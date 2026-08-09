import {
  type ImagePart,
  type LanguageModel,
  smoothStream,
  streamText,
  type TextPart,
} from "ai";

import { commands as templateCommands } from "@meeki/plugin-template";

import type { TaskArgsMapTransformed, TaskConfig } from ".";
import type { EnhanceImageContext } from "./enhance-images";
import { createEnhanceValidator } from "./enhance-validator";

import { ensureContextForTranscript } from "~/ai/local-llm-context";
import {
  groundedGenerationSettings,
  thinkingProviderOptions,
} from "~/ai/model-settings";
import {
  formatSummaryLengthGuidance,
  getSummaryLengthPolicy,
  type SummaryLengthPolicy,
} from "~/services/enhancer/summary-length";
import { getStoredSettingValues } from "~/settings/queries";
import { normalizeBulletPoints } from "~/store/zustand/ai-task/shared/transform_impl";
import { withEarlyValidationRetry } from "~/store/zustand/ai-task/shared/validate";
import { assertCanonicalTemplateSections } from "~/templates/codec";

const AI_GENERATION_MAX_RETRIES = 4;
// Long meetings need room for a full structured summary, and reasoning tokens
// come out of the same budget before any of the note is written.
const SUMMARY_MAX_OUTPUT_TOKENS = 32768;
const IMAGE_CONTEXT_NOTE =
  "Attached note images are included as visual context. Use visible text, diagrams, screenshots, and other image content when it materially improves the summary.";

export const enhanceWorkflow: Pick<
  TaskConfig<"enhance">,
  "executeWorkflow" | "transforms"
> = {
  executeWorkflow,
  transforms: [
    normalizeBulletPoints(),
    smoothStream({ delayInMs: 250, chunking: "line" }),
  ],
};

async function* executeWorkflow(params: {
  model: LanguageModel;
  args: TaskArgsMapTransformed["enhance"];
  onProgress: (step: any) => void;
  signal: AbortSignal;
}) {
  const { model, args, onProgress, signal } = params;

  const policy = getSummaryLengthPolicy(args.transcripts, args.summaryLength);

  // A long meeting needs a bigger context window than the one the local server
  // starts with, and llama.cpp fixes that window when the process starts. Grow
  // it here, before the request, rather than letting the whole summary come
  // back as a 400 with nothing salvaged. No-op for cloud providers.
  await ensureContextForTranscript(policy?.transcriptCharacters ?? 0);

  const system = await getSystemPrompt(args);
  const prompt = withLengthGuidance(
    withImageContextNote(await getUserPrompt(args), args.imageContext.length),
    policy,
  );

  yield* generateSummary({
    model,
    args,
    system,
    prompt,
    onProgress,
    signal,
  });
}

async function getSystemPrompt(args: TaskArgsMapTransformed["enhance"]) {
  const result = await templateCommands.render({
    enhanceSystem: {
      language: args.language,
      promptOverride: args.promptOverride,
    },
  });

  if (result.status === "error") {
    throw new Error(result.error);
  }

  return result.data;
}

async function getUserPrompt(args: TaskArgsMapTransformed["enhance"]) {
  const {
    session,
    participants,
    template: rawTemplate,
    transcripts,
    preMeetingMemo,
    postMeetingMemo,
  } = args;
  const template = rawTemplate
    ? {
        ...rawTemplate,
        sections: assertCanonicalTemplateSections(
          rawTemplate.sections,
          "enhance render template.sections",
        ),
      }
    : null;

  const result = await templateCommands.render({
    enhanceUser: {
      session,
      participants,
      template,
      transcripts,
      preMeetingMemo,
      postMeetingMemo,
    },
  });

  if (result.status === "error") {
    throw new Error(result.error);
  }

  return result.data;
}

async function* generateSummary(params: {
  model: LanguageModel;
  args: TaskArgsMapTransformed["enhance"];
  system: string;
  prompt: string;
  onProgress: (step: any) => void;
  signal: AbortSignal;
}) {
  const { model, args, system, prompt, onProgress, signal } = params;

  onProgress({ type: "generating" });

  const { values } = await getStoredSettingValues();
  const thinking = values.llm_thinking ? thinkingProviderOptions() : undefined;

  const validator = createEnhanceValidator(args.template, {
    overrideTemplateFormatting: Boolean(args.promptOverride.trim()),
  });

  yield* withEarlyValidationRetry(
    (retrySignal, { previousFeedback }) => {
      let enhancedPrompt = prompt;

      if (previousFeedback) {
        enhancedPrompt = `${prompt}

IMPORTANT: Previous attempt failed. ${previousFeedback}`;
      }

      const combinedController = new AbortController();

      const abortFromOuter = () => combinedController.abort();
      const abortFromRetry = () => combinedController.abort();

      signal.addEventListener("abort", abortFromOuter);
      retrySignal.addEventListener("abort", abortFromRetry);

      const result = streamText({
        model,
        system,
        ...createPromptInput(enhancedPrompt, args.imageContext),
        ...groundedGenerationSettings(model),
        ...(thinking ? { providerOptions: thinking } : {}),
        abortSignal: combinedController.signal,
        maxRetries: AI_GENERATION_MAX_RETRIES,
        maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
      });
      return withCleanup(result.fullStream, () => {
        signal.removeEventListener("abort", abortFromOuter);
        retrySignal.removeEventListener("abort", abortFromRetry);
      });
    },
    validator,
    {
      minChar: 10,
      maxChar: 30,
      maxRetries: 2,
      onRetry: (attempt, feedback) => {
        onProgress({ type: "retrying", attempt, reason: feedback });
      },
      onRetrySuccess: () => {
        onProgress({ type: "generating" });
      },
      onGiveUp: () => {
        onProgress({ type: "generating" });
      },
    },
  );
}

async function* withCleanup<T>(
  stream: AsyncIterable<T>,
  cleanup: () => void,
): AsyncIterable<T> {
  try {
    yield* stream;
  } finally {
    cleanup();
  }
}

function withImageContextNote(prompt: string, imageCount: number): string {
  if (imageCount === 0) {
    return prompt;
  }

  return `${prompt}

${IMAGE_CONTEXT_NOTE}`;
}

function withLengthGuidance(
  prompt: string,
  policy: SummaryLengthPolicy | null,
): string {
  const guidance = formatSummaryLengthGuidance(policy);
  if (!guidance) {
    return prompt;
  }

  return `${prompt}

${guidance}`;
}

function createPromptInput(
  prompt: string,
  imageContext: EnhanceImageContext[],
):
  | { prompt: string }
  | {
      messages: Array<{ role: "user"; content: Array<TextPart | ImagePart> }>;
    } {
  if (imageContext.length === 0) {
    return { prompt };
  }

  return {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageContext.map(
            (image): ImagePart => ({
              type: "image",
              image: image.base64,
              mediaType: image.mimeType,
            }),
          ),
        ],
      },
    ],
  };
}
