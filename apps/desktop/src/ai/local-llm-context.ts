import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";

import { getStoredSettingValues } from "~/settings/queries";

/**
 * Characters per token for English prose in Gemma's and Qwen's vocabularies.
 * Deliberately low: over-estimating the token count asks for a slightly larger
 * window, while under-estimating produces the failure this exists to prevent.
 */
const CHARACTERS_PER_TOKEN = 3.4;

/** System prompt, note body, participants and the output template. */
const PROMPT_OVERHEAD_TOKENS = 1_500;

/**
 * llama.cpp counts generated tokens against the same window, so the summary
 * competes with the transcript for room. It grows with the meeting until the
 * length policy's character ceiling caps it.
 */
const SUMMARY_TOKEN_RATIO = 0.35;
const SUMMARY_TOKEN_CEILING = 8_000;

/**
 * The window a summary of this transcript needs: the transcript itself, the
 * prompt around it, and the summary the model has to write, all of which
 * llama.cpp holds in one context.
 */
export function contextTokensForTranscript(
  transcriptCharacters: number,
): number {
  const transcriptTokens = Math.ceil(
    transcriptCharacters / CHARACTERS_PER_TOKEN,
  );
  const summaryTokens = Math.min(
    Math.ceil(transcriptTokens * SUMMARY_TOKEN_RATIO),
    SUMMARY_TOKEN_CEILING,
  );
  return PROMPT_OVERHEAD_TOKENS + transcriptTokens + summaryTokens;
}

/**
 * The one way the app starts llama-server.
 *
 * `neededTokens` is what the work in hand requires; Rust raises the window to
 * cover it, never past what this Mac can hold, and never below the default. A
 * running server that is already large enough is left alone, so the ordinary
 * five-second liveness poll — which passes nothing — cannot shrink a window
 * that a long meeting just grew.
 */
export async function startLocalLlmServer(
  model: GgufLlmModel,
  neededTokens?: number,
): Promise<ReturnType<typeof localLlmCommands.startServer>> {
  return localLlmCommands.startServer(model, neededTokens ?? null);
}

/**
 * Grows the local model's context window to fit this transcript before the
 * summary request goes out.
 *
 * Without this, a meeting past roughly an hour comes back as an HTTP 400 with
 * the partial output discarded — there is no truncation or chunking anywhere in
 * the enhance path. Restarting llama-server keeps its port, so the model the AI
 * SDK is already holding stays valid across the resize.
 *
 * Best-effort by design: a failure here leaves the existing server running and
 * the request is attempted anyway, which is no worse than not trying.
 */
export async function ensureContextForTranscript(
  transcriptCharacters: number,
): Promise<void> {
  if (transcriptCharacters <= 0) {
    return;
  }

  try {
    const { values } = await getStoredSettingValues();
    if (values.current_llm_provider !== "on_device") {
      return;
    }

    const model = values.current_llm_model as GgufLlmModel | undefined;
    if (!model) {
      return;
    }

    const started = await startLocalLlmServer(
      model,
      contextTokensForTranscript(transcriptCharacters),
    );
    if (started.status === "error") {
      console.warn(
        "[local-llm] failed to size the context window",
        started.error,
      );
    }
  } catch (error) {
    console.warn("[local-llm] failed to size the context window", error);
  }
}
