import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  openNew: vi.fn(),
  setPendingUpload: vi.fn(),
  audioImport: vi.fn(),
  audioImportData: vi.fn(),
  selectFile: vi.fn(),
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@meeki/plugin-fs-sync", () => ({
  commands: {
    audioImport: mocks.audioImport,
    audioImportData: mocks.audioImportData,
  },
}));

vi.mock("@meeki/ui/components/ui/toast", () => ({
  sonnerToast: { message: mocks.toastMessage, success: mocks.toastSuccess },
}));

vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: () => Promise.resolve("/Users/someone/Downloads"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.selectFile,
}));

vi.mock("~/session/queries", () => ({
  createSession: mocks.createSession,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ openNew: mocks.openNew, openCurrent: vi.fn() }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ live: { status: "inactive", sessionId: null } }),
}));

vi.mock("~/stt/pending-upload", () => ({
  setPendingUpload: mocks.setPendingUpload,
}));

vi.mock("~/stt/useUploadFile", () => ({
  AUDIO_EXTENSIONS: ["mp3", "wav", "m4a"],
  isAudioUploadFile: (file: File) => /\.(mp3|wav|m4a)$/u.test(file.name),
}));

import { useNewNoteAndUpload, useNewNoteFromDroppedAudio } from "./useNewNote";

function audioFile(name: string): File {
  const file = new File(["audio"], name, { type: "audio/mpeg" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
  });
  return file;
}

describe("importing several recordings at once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let counter = 0;
    mocks.createSession.mockImplementation(() =>
      Promise.resolve(`session-${++counter}`),
    );
    mocks.audioImport.mockResolvedValue({ status: "ok" });
    mocks.audioImportData.mockResolvedValue({ status: "ok" });
  });

  it("gives every dropped recording its own note", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([
      audioFile("one.mp3"),
      audioFile("two.mp3"),
      audioFile("three.mp3"),
    ]);

    expect(mocks.createSession).toHaveBeenCalledTimes(3);
    // The first rides the existing pending-upload path so it still transcribes
    // on open; the rest are imported now, because a queued upload only runs in
    // the tab that is on screen.
    expect(mocks.setPendingUpload).toHaveBeenCalledTimes(1);
    expect(mocks.audioImportData).toHaveBeenCalledTimes(2);
    expect(mocks.openNew).toHaveBeenCalledTimes(1);
  });

  it("ignores non-audio files in a mixed drop", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([
      audioFile("keep.mp3"),
      new File(["x"], "notes.pdf", { type: "application/pdf" }),
    ]);

    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.audioImportData).not.toHaveBeenCalled();
  });

  it("still accepts a single dropped file", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current(audioFile("only.mp3"));

    expect(mocks.setPendingUpload).toHaveBeenCalledTimes(1);
    expect(mocks.audioImportData).not.toHaveBeenCalled();
  });

  it("creates a note per file chosen from the audio dialog", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    );
    expect(mocks.createSession).toHaveBeenCalledTimes(2);
    expect(mocks.audioImport).toHaveBeenCalledWith("session-2", "/tmp/b.mp3");
  });

  it("keeps transcript upload to one file, since a note has one transcript", async () => {
    mocks.selectFile.mockResolvedValue("/tmp/a.vtt");
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("transcript");

    expect(mocks.selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false }),
    );
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.audioImport).not.toHaveBeenCalled();
  });

  it("counts the whole selection, including the file the session view takes", async () => {
    mocks.selectFile.mockResolvedValue([
      "/tmp/a.mp3",
      "/tmp/b.mp3",
      "/tmp/c.mp3",
    ]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.toastMessage).toHaveBeenCalledWith(
      "Importing 3 recordings",
      expect.objectContaining({ description: "1 of 3" }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Imported 3 recordings",
      expect.anything(),
    );
  });

  it("stops at the next file boundary and keeps what it already imported", async () => {
    mocks.selectFile.mockResolvedValue([
      "/tmp/a.mp3",
      "/tmp/b.mp3",
      "/tmp/c.mp3",
      "/tmp/d.mp3",
    ]);
    // Press Stop as soon as the first progress update offers the action.
    mocks.toastMessage.mockImplementationOnce(
      (_message: string, options: { action: { onClick: () => void } }) => {
        options.action.onClick();
      },
    );
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.audioImport).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Stopped after importing 1 of 4 recordings",
      expect.anything(),
    );
  });

  it("says nothing about a batch when only one file was chosen", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/only.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.toastMessage).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("keeps importing the rest when one file fails", async () => {
    mocks.audioImportData
      .mockResolvedValueOnce({ status: "error", error: "unsupported" })
      .mockResolvedValueOnce({ status: "ok" });
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([
      audioFile("a.mp3"),
      audioFile("b.mp3"),
      audioFile("c.mp3"),
    ]);

    expect(mocks.audioImportData).toHaveBeenCalledTimes(2);
    expect(mocks.openNew).toHaveBeenCalledTimes(1);
  });
});
