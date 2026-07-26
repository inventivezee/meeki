import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    VITE_ASSEMBLYAI_API_KEY: undefined as string | undefined,
    VITE_ASSEMBLYAI_BASE_URL: undefined as string | undefined,
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

import { configureAssemblyAiSttFromEnv } from "./configure-assemblyai";

describe("configureAssemblyAiSttFromEnv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.VITE_ASSEMBLYAI_API_KEY = undefined;
    mocks.env.VITE_ASSEMBLYAI_BASE_URL = undefined;
    mocks.getStoredAiProvider.mockResolvedValue(undefined);
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {},
      hasValues: new Set(),
    });
  });

  it("does nothing without an API key", async () => {
    await configureAssemblyAiSttFromEnv();
    expect(mocks.setAiProvider).not.toHaveBeenCalled();
    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });

  it("configures and selects AssemblyAI when a key is provided", async () => {
    mocks.env.VITE_ASSEMBLYAI_API_KEY = "asm-key";
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {
        current_stt_provider: "hyprnote",
        current_stt_model: "cloud",
      },
      hasValues: new Set(),
    });

    await configureAssemblyAiSttFromEnv();

    expect(mocks.setAiProvider).toHaveBeenCalledWith("stt", "assemblyai", {
      base_url: "https://api.assemblyai.com",
      api_key: "asm-key",
    });
    expect(mocks.setSettingValues).toHaveBeenCalledWith({
      current_stt_provider: "assemblyai",
      current_stt_model: "u3-rt-pro",
    });
  });
});
