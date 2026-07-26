import type { SharedV3ProviderOptions } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

export function deterministicGenerationSettings(model: LanguageModel): {
  temperature?: number;
} {
  if (usesDeprecatedTemperature(model)) {
    return {};
  }

  return { temperature: 0 };
}

/**
 * For long grounded output such as meeting summaries. Left unset, llama.cpp
 * samples at temperature 0.8, which invents detail on exactly the task where
 * faithfulness matters most. A hard 0 is avoided because long generations at
 * greedy sampling are prone to repetition loops.
 */
export function groundedGenerationSettings(model: LanguageModel): {
  temperature?: number;
  topP?: number;
} {
  if (usesDeprecatedTemperature(model)) {
    return {};
  }

  return { temperature: 0.2, topP: 0.9 };
}

/**
 * Opts a single request into the model's reasoning mode. The local server
 * disables thinking by default so short tasks (titles, key facts) can't spend
 * their whole token budget deliberating; long grounded tasks opt back in.
 * Providers other than the local one ignore keys that aren't their own.
 */
export function thinkingProviderOptions(): SharedV3ProviderOptions {
  const enable = { chat_template_kwargs: { enable_thinking: true } };
  return { on_device: enable, onDevice: enable };
}

function usesDeprecatedTemperature(model: LanguageModel): boolean {
  if (typeof model === "string") {
    return false;
  }

  const provider = "provider" in model ? model.provider : "";
  const modelId = "modelId" in model ? model.modelId : "";
  const normalizedModelId = modelId.toLowerCase().replace(/\./g, "-");
  const modelName = normalizedModelId.includes("/")
    ? normalizedModelId.split("/").pop()!
    : normalizedModelId;

  return (
    (provider.startsWith("anthropic") ||
      normalizedModelId.startsWith("anthropic/")) &&
    /^claude-(?:opus|sonnet|haiku)-4-8(?:$|-)/.test(modelName)
  );
}
