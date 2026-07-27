import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMicrophoneDevices: vi.fn(),
}));

vi.mock("@meeki/plugin-transcription", () => ({
  commands: { listMicrophoneDevices: mocks.listMicrophoneDevices },
}));

import { hasMicrophone } from "./microphone-availability";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hasMicrophone", () => {
  it("reports false when the machine exposes no input device", async () => {
    mocks.listMicrophoneDevices.mockResolvedValue({ status: "ok", data: [] });

    await expect(hasMicrophone()).resolves.toBe(false);
  });

  it("reports true when at least one input device exists", async () => {
    mocks.listMicrophoneDevices.mockResolvedValue({
      status: "ok",
      data: ["MacBook Pro Microphone"],
    });

    await expect(hasMicrophone()).resolves.toBe(true);
  });

  it("does not block recording when enumeration fails", async () => {
    mocks.listMicrophoneDevices.mockResolvedValue({
      status: "error",
      error: "boom",
    });

    await expect(hasMicrophone()).resolves.toBe(true);
  });

  it("does not block recording when the command throws", async () => {
    mocks.listMicrophoneDevices.mockRejectedValue(new Error("ipc down"));

    await expect(hasMicrophone()).resolves.toBe(true);
  });
});
