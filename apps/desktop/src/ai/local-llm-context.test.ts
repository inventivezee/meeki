import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startServer: vi.fn(),
  getStoredSettingValues: vi.fn(),
}));

vi.mock("@meeki/plugin-local-llm", () => ({
  commands: { startServer: mocks.startServer },
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: mocks.getStoredSettingValues,
}));

import {
  contextTokensForTranscript,
  ensureContextForTranscript,
} from "./local-llm-context";

describe("sizing the window to a transcript", () => {
  it("grows with the transcript", () => {
    const hour = contextTokensForTranscript(60_000);
    const twoHours = contextTokensForTranscript(120_000);
    expect(twoHours).toBeGreaterThan(hour);
  });

  it("leaves room for the prompt and the summary, not just the transcript", () => {
    // A bare characters/token estimate would fit the transcript exactly and
    // then have nowhere to put the summary — which is the 400 this prevents.
    const characters = 60_000;
    expect(contextTokensForTranscript(characters)).toBeGreaterThan(
      characters / 3.4 + 1_000,
    );
  });

  it("stops the summary allowance running away on a very long meeting", () => {
    // Eight hours of speech does not need an eight-hour summary; past the cap
    // the window should grow at the transcript's rate, not 1.35x it.
    const long = contextTokensForTranscript(1_000_000);
    const longer = contextTokensForTranscript(1_100_000);
    expect(longer - long).toBeLessThan((100_000 / 3.4) * 1.1);
  });
});

describe("growing the local server before a summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startServer.mockResolvedValue({ status: "ok", data: "http://x/v1" });
  });

  it("asks for a window that covers the transcript", async () => {
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {
        current_llm_provider: "on_device",
        current_llm_model: "gemma-4-12b",
      },
    });

    await ensureContextForTranscript(200_000);

    expect(mocks.startServer).toHaveBeenCalledWith(
      "gemma-4-12b",
      contextTokensForTranscript(200_000),
    );
  });

  it("leaves cloud providers alone — their window is not ours to size", async () => {
    mocks.getStoredSettingValues.mockResolvedValue({
      values: { current_llm_provider: "openai", current_llm_model: "gpt-5" },
    });

    await ensureContextForTranscript(200_000);

    expect(mocks.startServer).not.toHaveBeenCalled();
  });

  it("does nothing for an empty transcript", async () => {
    await ensureContextForTranscript(0);

    expect(mocks.getStoredSettingValues).not.toHaveBeenCalled();
    expect(mocks.startServer).not.toHaveBeenCalled();
  });

  it("lets the summary proceed when the resize fails", async () => {
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {
        current_llm_provider: "on_device",
        current_llm_model: "gemma-4-12b",
      },
    });
    mocks.startServer.mockRejectedValue(new Error("no such model"));

    await expect(ensureContextForTranscript(200_000)).resolves.toBeUndefined();
  });
});
