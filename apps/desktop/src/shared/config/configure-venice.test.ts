import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    VITE_VENICE_API_KEY: undefined as string | undefined,
    VITE_VENICE_BASE_URL: undefined as string | undefined,
    VITE_VENICE_MODEL: undefined as string | undefined,
  },
  getStoredAiProvider: vi.fn(),
  setAiProvider: vi.fn(async () => undefined),
  getStoredSettingValues: vi.fn(),
  setSettingValues: vi.fn(async () => undefined),
}));

vi.mock("~/env", () => ({
  env: mocks.env,
}));

vi.mock("~/settings/providers", () => ({
  getStoredAiProvider: mocks.getStoredAiProvider,
  setAiProvider: mocks.setAiProvider,
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: mocks.getStoredSettingValues,
  setSettingValues: mocks.setSettingValues,
}));

import {
  VENICE_DEFAULT_MODEL,
  configureVeniceLlmFromEnv,
} from "./configure-venice";

describe("configureVeniceLlmFromEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.VITE_VENICE_API_KEY = undefined;
    mocks.env.VITE_VENICE_BASE_URL = undefined;
    mocks.env.VITE_VENICE_MODEL = undefined;
    mocks.getStoredAiProvider.mockResolvedValue(undefined);
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {},
      hasValues: new Set(),
    });
  });

  it("does nothing without an API key", async () => {
    await configureVeniceLlmFromEnv();
    expect(mocks.setAiProvider).not.toHaveBeenCalled();
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });

  it("configures Venice and selects Qwen 3.6 when a key is provided", async () => {
    mocks.env.VITE_VENICE_API_KEY = "venice-key";
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {
        current_llm_provider: "hyprnote",
        current_llm_model: "Auto",
      },
      hasValues: new Set(),
    });

    await configureVeniceLlmFromEnv();

    expect(mocks.setAiProvider).toHaveBeenCalledWith("llm", "venice", {
      base_url: "https://api.venice.ai/api/v1",
      api_key: "venice-key",
    });
    expect(mocks.setSettingValues).toHaveBeenCalledWith({
      current_llm_provider: "venice",
      current_llm_model: VENICE_DEFAULT_MODEL,
    });
  });
});
