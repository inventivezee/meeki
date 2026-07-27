import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { beginCloudsyncActivity, endCloudsyncActivity } from "@meeki/plugin-db";

const mocks = vi.hoisted(() => ({
  audioPath: vi.fn(),
  getLatestBatchTranscript: vi.fn(),
  handleBatchFailed: vi.fn(),
  queueAutoEnhanceIfSummaryEmpty: vi.fn(),
  requestAutoEnhance: vi.fn(),
  runBatch: vi.fn(),
  toastError: vi.fn(),
  conn: {
    provider: "deepgram",
    model: "nova-3-general",
    baseUrl: "https://api.deepgram.com/v1",
    apiKey: "key",
  } as {
    provider: string;
    model: string;
    baseUrl: string;
    apiKey: string;
  } | null,
}));

vi.mock("@meeki/plugin-fs-sync", () => ({
  commands: { audioPath: mocks.audioPath },
}));

vi.mock("@meeki/ui/components/ui/toast", () => ({
  sonnerToast: { error: mocks.toastError },
}));

vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({
    queueAutoEnhanceIfSummaryEmpty: mocks.queueAutoEnhanceIfSummaryEmpty,
    requestAutoEnhance: mocks.requestAutoEnhance,
  }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ handleBatchFailed: mocks.handleBatchFailed }),
}));

vi.mock("~/stt/useRunBatch", async () => {
  const actual =
    await vi.importActual<typeof import("~/stt/useRunBatch")>(
      "~/stt/useRunBatch",
    );
  return {
    ...actual,
    isStoppedTranscriptionError: (error: unknown) =>
      error instanceof Error && error.message === "Transcription stopped.",
    useRunBatch: () => mocks.runBatch,
  };
});

vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ conn: mocks.conn }),
}));

vi.mock("~/stt/queries", () => ({
  getLatestBatchTranscript: mocks.getLatestBatchTranscript,
}));

import { useRegenerateTranscript } from "./actions";

describe("useRegenerateTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conn = {
      provider: "deepgram",
      model: "nova-3-general",
      baseUrl: "https://api.deepgram.com/v1",
      apiKey: "key",
    };
    mocks.audioPath.mockResolvedValue({
      status: "ok",
      data: "/tmp/session.wav",
    });
    mocks.getLatestBatchTranscript.mockResolvedValue(null);
  });

  it("shows batch transcription failures even when an old transcript exists", async () => {
    mocks.runBatch.mockRejectedValue(new Error("Authentication failed"));
    const { result } = renderHook(() => useRegenerateTranscript("session-1"));

    await act(async () => {
      await result.current.regenerateTranscript();
    });

    expect(mocks.runBatch).toHaveBeenCalledWith("/tmp/session.wav", {
      promotion: { scope: "whole_session" },
      model: "nova-3-general",
      baseUrl: "https://api.deepgram.com/v1",
      apiKey: "key",
    });
    expect(mocks.handleBatchFailed).toHaveBeenCalledWith(
      "session-1",
      "Authentication failed",
    );
    expect(mocks.toastError).toHaveBeenCalledWith("Re-transcription failed", {
      id: "transcript-regenerate-failed-session-1",
      description: "Authentication failed",
    });
  });

  it("keeps CloudSync deferred until summary scheduling settles", async () => {
    let finishSummaryScheduling: (() => void) | undefined;
    mocks.runBatch.mockResolvedValue(undefined);
    mocks.queueAutoEnhanceIfSummaryEmpty.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishSummaryScheduling = resolve;
      }),
    );
    const { result } = renderHook(() => useRegenerateTranscript("session-1"));

    const regeneration = result.current.regenerateTranscript();
    await waitFor(() => {
      expect(mocks.queueAutoEnhanceIfSummaryEmpty).toHaveBeenCalledWith(
        "session-1",
      );
    });

    expect(beginCloudsyncActivity).toHaveBeenCalledWith(
      "transcription",
      expect.stringMatching(/^session-1:retranscription:/),
    );
    expect(endCloudsyncActivity).not.toHaveBeenCalled();

    finishSummaryScheduling?.();
    await act(async () => {
      await regeneration;
    });
    expect(endCloudsyncActivity).toHaveBeenCalledWith(
      "transcription",
      vi.mocked(beginCloudsyncActivity).mock.calls[0]?.[1],
    );
  });

  it("asks before replacing a transcript from a different model", async () => {
    mocks.getLatestBatchTranscript.mockResolvedValue({
      id: "t1",
      provider: "soniqo",
      model: "soniqo-qwen3-large",
      source: "batch_transcription",
    });
    const { result } = renderHook(() => useRegenerateTranscript("session-1"));

    await act(async () => {
      await result.current.regenerateTranscript();
    });

    expect(mocks.runBatch).not.toHaveBeenCalled();
    expect(result.current.confirmDialog).toBeTruthy();
  });
});
