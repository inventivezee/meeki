import { useQuery } from "@tanstack/react-query";
import type { LanguageModel, ToolSet } from "ai";
import { useEffect, useMemo, useState } from "react";

import { commands as localLlmCommands } from "@meeki/plugin-local-llm";
import { commands as templateCommands } from "@meeki/plugin-template";

import { CustomChatTransport } from "./index";
import type { ResolvedChatContext } from "./index";

import { useLanguageModel } from "~/ai/hooks";
import type { ContextRef } from "~/chat/context/entities";
import { hydrateSessionContext } from "~/chat/context/session-context-hydrator";
import { loadHuman, loadOrganization } from "~/contacts/queries";
import { useToolRegistry } from "~/contexts/tool";
import { useConfigValue, useConfigValues } from "~/shared/config";

export const MEETING_CONTEXT_TOOL_GUIDANCE = `
Context and local meeting tool guidance:
- Use list_meetings for recent meetings, title or ID lookup, pagination, and exact recurring-series filtering. Never guess a meeting ID.
- Use search_meetings for open-ended questions about topics, people, decisions, or date ranges across meeting content. Use search_meeting_content when the user needs exact wording from notes or transcripts.
- After resolving an ID, use get_meeting for the canonical note, summaries, participants, and action items. Use get_meeting_transcript separately for bounded transcript pages, following pagination.next_offset only when more context is needed.
- Use get_recurring_meeting_history for meetings in the same recurring series. Use find_related_meetings only for broader relationships such as shared participants or nearby dates.
- When the user refers to the current meeting, prefer the attached meeting context. Do not fetch it again unless the task needs newer structured data.
- When the user asks to rewrite, revise, refocus, shorten, or restructure an existing summary, call edit_summary with the complete replacement markdown so they can review and apply it. Do not return the rewrite only as a fenced markdown block.
- Use apply_session_correction for narrow exact old-to-new corrections and edit_summary for broader summary rewrites. Only return a draft without calling edit_summary when the user explicitly asks not to change the current summary or no target summary can be resolved.
- When the user corrects note content with wording like "it's not X but Y", use apply_session_correction to update the current session summary and transcript unless they explicitly ask for one target only. Add uncommon names, companies, products, acronyms, or jargon from the correction to dictionaryTerms so future transcription can prefer them; skip common names. If the tool reports partial, use get_meeting or retry with the exact remaining text instead of claiming both were updated.
- Do not ask the user to open or share a meeting until list_meetings, search_meetings, search_meeting_content, and get_meeting cannot find enough local context.
- Use typed meeting tools instead of constructing shell commands, crawling files, or accessing SQLite directly.
- Do not assume meeting contents from chat history when a typed tool can read the current source of truth.

Web search guidance:
- Use web_search for public websites, URLs, companies, products, people, news, or current facts that may be outside local notes.
- Include source URLs in the final answer when web_search results are used.
- Do not use web_search for questions that only need local notes, contacts, or calendar events.
`.trim();

/**
 * Small on-device models read the full guidance literally and get lost in it.
 * Asked for action items they matched the phrase in "use get_meeting for the
 * canonical note, summaries, participants, and action items" and called a tool
 * instead of reading the transcript sitting in their context.
 *
 * Same twelve tools, but ordered around the common case: the meeting is already
 * here, answer from it, and reach for a tool only to go somewhere else.
 */
export const COMPACT_MEETING_CONTEXT_TOOL_GUIDANCE = `
Answering about the current meeting:
- The attached meeting context already contains this meeting's summary and full transcript. Answer from it directly. Do not call a tool to fetch the meeting you were given.
- Only use a tool when the user asks about a different meeting, a person, the calendar, or the public web.

Reaching other meetings:
- search_meetings for topics, people or decisions across meetings; list_meetings to find one by title or date; get_meeting once you have its ID. Never guess an ID.
- search_contacts for people, search_calendar_events for scheduled events.

Changing this meeting's note:
- edit_summary to rewrite the summary, with the complete replacement markdown.
- apply_session_correction for an exact old-to-new wording fix.
`.trim();

/** Above this, a model holds the full guidance without getting lost in it. */
const COMPACT_GUIDANCE_MAX_PARAMETERS_B = 6;

function useToolGuidanceVariant(): "full" | "compact" {
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ] as const);

  // Shares the cache with the settings cards and the ensure loop.
  const supported = useQuery({
    enabled: current_llm_provider === "on_device",
    queryKey: ["local-llm-supported"],
    queryFn: async () => {
      const result = await localLlmCommands.listSupportedModel();
      return result.status === "ok" ? result.data : [];
    },
    staleTime: Infinity,
  });

  if (current_llm_provider !== "on_device") {
    return "full";
  }

  const parameters = supported.data?.find(
    (model) => model.key === current_llm_model,
  )?.parameters_billions;

  // Unknown model, including a custom GGUF: assume it is small, since that is
  // the case where over-long guidance actually hurts.
  return parameters === undefined ||
    parameters < COMPACT_GUIDANCE_MAX_PARAMETERS_B
    ? "compact"
    : "full";
}

export function appendMeetingContextToolGuidance(
  prompt: string | undefined,
  variant: "full" | "compact" = "full",
): string | undefined {
  if (prompt === undefined) {
    return undefined;
  }

  const guidance =
    variant === "compact"
      ? COMPACT_MEETING_CONTEXT_TOOL_GUIDANCE
      : MEETING_CONTEXT_TOOL_GUIDANCE;

  return prompt ? `${prompt}\n\n${guidance}` : guidance;
}

async function renderHumanContext(humanId: string): Promise<string | null> {
  const human = await loadHuman(humanId);
  if (!human) return null;
  const organization = await loadOrganization(human.organizationId);

  const name = human.name.trim() || null;
  const email = human.email.trim() || null;
  const jobTitle = human.jobTitle.trim() || null;
  const organizationName = organization?.name.trim() || null;
  const memo = human.memo.trim() || null;

  if (!name && !email) {
    return null;
  }

  const details = [
    jobTitle,
    organizationName ? `Organization: ${organizationName}` : null,
    email ? `Email: ${email}` : null,
    memo ? `Notes: ${memo}` : null,
  ].filter(Boolean);

  return [`Referenced contact: ${name ?? email}`, ...details].join("\n");
}

async function renderOrganizationContext(
  organizationId: string,
): Promise<string | null> {
  const organization = await loadOrganization(organizationId);
  const name = organization?.name.trim() || null;

  return name ? `Referenced organization: ${name}` : null;
}

export function useTransport(
  modelOverride?: LanguageModel,
  extraTools?: ToolSet,
  systemPromptOverride?: string,
  userId?: string,
) {
  const registry = useToolRegistry();
  const configuredModel = useLanguageModel("chat");
  const model = modelOverride ?? configuredModel;
  const language = useConfigValue("ai_language") || "en";
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>();

  useEffect(() => {
    if (systemPromptOverride) {
      setSystemPrompt(systemPromptOverride);
      return;
    }

    let stale = false;

    void (async () => {
      try {
        const result = await templateCommands.render({
          chatSystem: {
            language,
          },
        });
        if (stale) {
          return;
        }

        if (result.status === "ok") {
          setSystemPrompt(result.data);
        } else {
          setSystemPrompt("");
        }
      } catch (error) {
        console.error(error);
        if (!stale) {
          setSystemPrompt("");
        }
      }
    })();

    return () => {
      stale = true;
    };
  }, [language, systemPromptOverride]);

  const guidanceVariant = useToolGuidanceVariant();
  const webSearchUnavailable =
    useConfigValue("current_llm_provider") === "on_device";
  const effectiveSystemPrompt = appendMeetingContextToolGuidance(
    systemPromptOverride ?? systemPrompt,
    guidanceVariant,
  );
  const isSystemPromptReady =
    typeof systemPromptOverride === "string" || systemPrompt !== undefined;

  const tools = useMemo(() => {
    const localTools = registry.getTools("chat-general");

    // web_search posts to /research/search on the hosted API, which proxies
    // Exa and Jina server-side and requires a signed-in user. On device there
    // is neither, so the tool can only ever answer "Sign in to use web
    // search" — while still costing prompt tokens and giving a small model one
    // more wrong option to reach for.
    if (webSearchUnavailable && "web_search" in localTools) {
      delete (localTools as Record<string, unknown>).web_search;
    }

    if (extraTools && import.meta.env.DEV) {
      for (const key of Object.keys(extraTools)) {
        if (key in localTools) {
          console.warn(
            `[ChatSession] Tool name collision: "${key}" exists in both local registry and extraTools. extraTools will take precedence.`,
          );
        }
      }
    }

    return {
      ...localTools,
      ...extraTools,
    };
  }, [registry, extraTools, webSearchUnavailable]);

  const transport = useMemo(() => {
    if (!model) {
      return null;
    }

    return new CustomChatTransport(
      model,
      tools,
      effectiveSystemPrompt,
      async (ref: ContextRef) => {
        if (ref.kind === "session") {
          const context = await hydrateSessionContext(ref.sessionId, userId);
          return context
            ? ({ kind: "session", context } satisfies ResolvedChatContext)
            : null;
        }

        if (ref.kind === "human") {
          const text = await renderHumanContext(ref.humanId);
          return text
            ? ({ kind: "text", text } satisfies ResolvedChatContext)
            : null;
        }

        const text = await renderOrganizationContext(ref.organizationId);
        return text
          ? ({ kind: "text", text } satisfies ResolvedChatContext)
          : null;
      },
    );
  }, [model, tools, effectiveSystemPrompt, userId]);

  return {
    transport,
    isSystemPromptReady,
  };
}
