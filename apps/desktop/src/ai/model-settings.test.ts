import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";

import {
  deterministicGenerationSettings,
  groundedGenerationSettings,
  thinkingProviderOptions,
} from "./model-settings";

function model(provider: string, modelId: string): LanguageModel {
  return {
    specificationVersion: "v3",
    provider,
    modelId,
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error("not implemented");
    },
    doStream: async () => {
      throw new Error("not implemented");
    },
  };
}

describe("deterministicGenerationSettings", () => {
  it("omits temperature for Anthropic Claude 4.8 models", () => {
    expect(
      deterministicGenerationSettings(model("anthropic", "claude-opus-4-8")),
    ).toEqual({});
  });

  it("omits temperature for hosted Anthropic Claude 4.8 models", () => {
    expect(
      deterministicGenerationSettings(
        model("openrouter", "anthropic/claude-opus-4-8"),
      ),
    ).toEqual({});
    expect(
      deterministicGenerationSettings(
        model("hyprnote", "anthropic/claude-opus-4-8"),
      ),
    ).toEqual({});
  });

  it("omits temperature for dotted Claude 4.8 model ids", () => {
    expect(
      deterministicGenerationSettings(model("anthropic", "claude-opus-4.8")),
    ).toEqual({});
  });

  it("keeps deterministic temperature for other models", () => {
    expect(
      deterministicGenerationSettings(model("anthropic", "claude-opus-4-5")),
    ).toEqual({ temperature: 0 });
  });
});

describe("groundedGenerationSettings", () => {
  it("pins summaries well below the llama.cpp default of 0.8", () => {
    expect(
      groundedGenerationSettings(model("on_device", "qwen3.6-35b-a3b")),
    ).toEqual({ temperature: 0.2, topP: 0.9 });
  });

  it("omits sampling for Anthropic Claude 4.8 models", () => {
    expect(
      groundedGenerationSettings(model("anthropic", "claude-opus-4-8")),
    ).toEqual({});
  });
});

describe("thinkingProviderOptions", () => {
  it("enables thinking only for the local provider", () => {
    const options = thinkingProviderOptions();

    expect(options.on_device).toEqual({
      chat_template_kwargs: { enable_thinking: true },
    });
    expect(options.onDevice).toEqual(options.on_device);
    expect(options.venice).toBeUndefined();
  });
});
