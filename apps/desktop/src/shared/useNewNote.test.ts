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
  toastError: vi.fn(),
  catalogLocalSessionAudio: vi.fn(),
  askBulkImportChoice: vi.fn(),
  startBacklogRun: vi.fn(),
  audioSourceFingerprint: vi.fn(),
  audioMetadata: vi.fn(),
  loadImportedAudioFingerprints: vi.fn(),
  softDeleteSession: vi.fn(),
  finalizeSessionDeletion: vi.fn(),
  keepAwakeAcquire: vi.fn(),
  keepAwakeRelease: vi.fn(),
}));

vi.mock("@meeki/plugin-fs-sync", () => ({
  commands: {
    audioImport: mocks.audioImport,
    audioImportData: mocks.audioImportData,
    audioSourceFingerprint: mocks.audioSourceFingerprint,
    audioMetadata: mocks.audioMetadata,
  },
}));

vi.mock("@meeki/plugin-misc", () => ({
  commands: {
    keepAwakeAcquire: mocks.keepAwakeAcquire,
    keepAwakeRelease: mocks.keepAwakeRelease,
  },
}));

vi.mock("@meeki/ui/components/ui/toast", () => ({
  sonnerToast: {
    message: mocks.toastMessage,
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  downloadDir: () => Promise.resolve("/Users/someone/Downloads"),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mocks.selectFile,
}));

vi.mock("~/session/attachments", () => ({
  catalogLocalSessionAudio: mocks.catalogLocalSessionAudio,
}));

vi.mock("~/session/queries", () => ({
  createSession: mocks.createSession,
  softDeleteSession: mocks.softDeleteSession,
  finalizeSessionDeletion: mocks.finalizeSessionDeletion,
}));

vi.mock("~/stt/audio-backlog", () => ({
  startBacklogRun: mocks.startBacklogRun,
}));

vi.mock("~/shared/import-duplicates", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadImportedAudioFingerprints: mocks.loadImportedAudioFingerprints,
}));

vi.mock("~/shared/bulk-import-prompt", () => ({
  askBulkImportChoice: mocks.askBulkImportChoice,
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ openNew: mocks.openNew, openCurrent: vi.fn() }),
}));

const liveStatus = { value: "inactive" };
const liveSessionId = { value: null as string | null };

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      live: { status: liveStatus.value, sessionId: liveSessionId.value },
    }),
}));

vi.mock("~/stt/pending-upload", () => ({
  setPendingUpload: mocks.setPendingUpload,
}));

vi.mock("~/stt/useUploadFile", () => ({
  AUDIO_EXTENSIONS: ["mp3", "wav", "m4a"],
  isAudioUploadFile: (file: File) => /\.(mp3|wav|m4a)$/u.test(file.name),
}));

import {
  resetPendingRecording,
  useNewNoteAndListen,
  useNewNoteAndUpload,
  useNewNoteFromDroppedAudio,
} from "./useNewNote";

function audioFile(name: string, sizeBytes = 4): File {
  const file = new File(["audio"], name, { type: "audio/mpeg" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
  });
  Object.defineProperty(file, "size", { value: sizeBytes });
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
    mocks.catalogLocalSessionAudio.mockResolvedValue(undefined);
    mocks.askBulkImportChoice.mockResolvedValue({
      transcribe: true,
      summarize: true,
    });
    mocks.loadImportedAudioFingerprints.mockResolvedValue(new Set<string>());
    // A distinct fingerprint per file, so the duplicate check never fires for
    // cases that predate it.
    mocks.audioSourceFingerprint.mockImplementation((path: string) =>
      Promise.resolve({
        status: "ok",
        data: { sha256: `hash:${path}`, sizeBytes: 1 },
      }),
    );
    let unique = 0;
    mocks.audioMetadata.mockImplementation(() =>
      Promise.resolve({
        status: "ok",
        data: { sha256: `import:${++unique}`, sizeBytes: 1 },
      }),
    );
    mocks.softDeleteSession.mockResolvedValue({ session: { id: "x" } });
    mocks.finalizeSessionDeletion.mockResolvedValue(undefined);
    mocks.keepAwakeAcquire.mockResolvedValue(undefined);
    mocks.keepAwakeRelease.mockResolvedValue(undefined);
  });

  it("gives every dropped recording its own note", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([
      audioFile("one.mp3"),
      audioFile("two.mp3"),
      audioFile("three.mp3"),
    ]);

    expect(mocks.createSession).toHaveBeenCalledTimes(3);
    // None are queued for the session view. That view transcribes from inside
    // the open tab, which would race the backlog worker for the same note.
    expect(mocks.setPendingUpload).not.toHaveBeenCalled();
    expect(mocks.audioImportData).toHaveBeenCalledTimes(3);
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
    // Without the attachment row the audio is on disk but invisible to the
    // player, to sync, and to the backlog that transcribes it later.
    expect(mocks.catalogLocalSessionAudio).toHaveBeenCalledWith("session-2");
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

  it("reports progress from the first file to the last", async () => {
    mocks.selectFile.mockResolvedValue([
      "/tmp/a.mp3",
      "/tmp/b.mp3",
      "/tmp/c.mp3",
    ]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.toastMessage).toHaveBeenNthCalledWith(
      1,
      "Importing 3 recordings",
      expect.objectContaining({ description: "0 of 3" }),
    );
    expect(mocks.toastMessage).toHaveBeenLastCalledWith(
      "Importing 3 recordings",
      expect.objectContaining({ description: "3 of 3" }),
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
      "Stopped after importing 0 of 4 recordings",
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

  it("refuses a drop of too many files and offers the picker instead", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current(
      Array.from({ length: 40 }, (_, index) => audioFile(`${index}.mp3`)),
    );

    // Nothing imported: dropped bytes cross IPC as a JSON number array, which
    // is what makes this path unusable at scale in the first place.
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.audioImportData).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "40 recordings is too many to drop",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Choose files instead" }),
      }),
    );
  });

  it("refuses a drop that is too large even when the file count is small", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([
      audioFile("huge.mp3", 900_000_000),
      audioFile("also-huge.mp3", 900_000_000),
    ]);

    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "1.8 GB is too much audio to drop",
      expect.anything(),
    );
  });

  it("takes the user straight to the picker from the refusal", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3"]);
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current(
      Array.from({ length: 40 }, (_, index) => audioFile(`${index}.mp3`)),
    );
    const [, options] = mocks.toastError.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    options.action.onClick();
    await vi.waitFor(() => expect(mocks.selectFile).toHaveBeenCalled());
  });

  it("still accepts an ordinary handful of dropped files", async () => {
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([audioFile("a.mp3"), audioFile("b.mp3")]);

    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.audioImportData).toHaveBeenCalledTimes(2);
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

    expect(mocks.audioImportData).toHaveBeenCalledTimes(3);
    expect(mocks.openNew).toHaveBeenCalledTimes(1);
  });

  it("abandons the import when the prompt is cancelled", async () => {
    mocks.askBulkImportChoice.mockResolvedValue(null);
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    // Asked before anything is copied, so cancelling leaves no notes behind.
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.audioImport).not.toHaveBeenCalled();
    expect(mocks.startBacklogRun).not.toHaveBeenCalled();
  });

  it("starts processing only when the user asked for it", async () => {
    mocks.askBulkImportChoice.mockResolvedValue({
      transcribe: true,
      summarize: false,
    });
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.startBacklogRun).toHaveBeenCalledWith({ summarize: false });
  });

  it("imports without processing when the user declines both", async () => {
    mocks.askBulkImportChoice.mockResolvedValue({
      transcribe: false,
      summarize: false,
    });
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.audioImport).toHaveBeenCalledTimes(2);
    expect(mocks.startBacklogRun).not.toHaveBeenCalled();
  });

  it("does not ask about a single file, which just opens and transcribes", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/only.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.askBulkImportChoice).not.toHaveBeenCalled();
    expect(mocks.setPendingUpload).toHaveBeenCalledTimes(1);
  });
});

describe("starting a recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPendingRecording();
    liveStatus.value = "inactive";
    liveSessionId.value = null;
  });

  it("starts only one recording when the button is clicked twice", async () => {
    let resolveCreate: (id: string) => void = () => {};
    mocks.createSession.mockImplementationOnce(
      () => new Promise<string>((resolve) => (resolveCreate = resolve)),
    );
    const { result } = renderHook(() => useNewNoteAndListen());

    // Both clicks land before the first createSession resolves, which is the
    // whole window the live status cannot describe.
    result.current();
    result.current();
    resolveCreate("session-1");
    await Promise.resolve();

    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.openNew).toHaveBeenCalledTimes(1);
  });

  it("focuses the recording already starting rather than opening nothing", async () => {
    mocks.createSession.mockResolvedValue("session-1");
    const { result } = renderHook(() => useNewNoteAndListen());

    result.current();
    await vi.waitFor(() => expect(mocks.openNew).toHaveBeenCalledTimes(1));
    result.current();

    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.openNew).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "session-1" }),
    );
  });

  it("focuses the live recording once one is active", () => {
    liveStatus.value = "active";
    liveSessionId.value = "live-session";
    const { result } = renderHook(() => useNewNoteAndListen());

    result.current();

    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.openNew).toHaveBeenCalledWith({
      type: "sessions",
      id: "live-session",
    });
  });
});

describe("skipping recordings already in the library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPendingRecording();
    let counter = 0;
    mocks.createSession.mockImplementation(() =>
      Promise.resolve(`session-${++counter}`),
    );
    mocks.audioImport.mockResolvedValue({ status: "ok" });
    mocks.askBulkImportChoice.mockResolvedValue({
      transcribe: false,
      summarize: false,
    });
    mocks.loadImportedAudioFingerprints.mockResolvedValue(
      new Set(["hash-known:1"]),
    );
    mocks.softDeleteSession.mockResolvedValue({ session: { id: "x" } });
    mocks.finalizeSessionDeletion.mockResolvedValue(undefined);
    mocks.keepAwakeAcquire.mockResolvedValue(undefined);
    mocks.keepAwakeRelease.mockResolvedValue(undefined);
  });

  it("does not copy a file whose contents are already imported", async () => {
    mocks.audioSourceFingerprint.mockImplementation((path: string) =>
      Promise.resolve({
        status: "ok",
        data: {
          sha256: path === "/tmp/dupe.mp3" ? "hash-known" : "hash-new",
          sizeBytes: 1,
        },
      }),
    );
    mocks.selectFile.mockResolvedValue(["/tmp/dupe.mp3", "/tmp/fresh.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    // Hashed before the copy, so the duplicate never reaches audioImport.
    expect(mocks.audioImport).toHaveBeenCalledTimes(1);
    expect(mocks.audioImport).toHaveBeenCalledWith(
      "session-1",
      "/tmp/fresh.mp3",
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Imported 1 recordings, skipped 1 already in your library",
      expect.anything(),
    );
  });

  it("collapses two copies of the same file inside one selection", async () => {
    mocks.audioSourceFingerprint.mockResolvedValue({
      status: "ok",
      data: { sha256: "hash-same", sizeBytes: 1 },
    });
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.audioImport).toHaveBeenCalledTimes(1);
  });

  it("imports a file it cannot hash rather than dropping it", async () => {
    mocks.audioSourceFingerprint.mockResolvedValue({
      status: "error",
      error: "permission denied",
    });
    mocks.selectFile.mockResolvedValue(["/tmp/unreadable.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    expect(mocks.audioImport).toHaveBeenCalledTimes(2);
  });
  it("undoes a dropped duplicate, since a drop cannot be checked beforehand", async () => {
    // Both dropped files carry the same content; the second import is reclaimed.
    mocks.audioMetadata.mockResolvedValue({
      status: "ok",
      data: { sha256: "hash-same", sizeBytes: 1 },
    });
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([audioFile("a.mp3"), audioFile("b.mp3")]);

    // Both copies were made — a drop gives no path to hash first — but only one
    // note survives.
    expect(mocks.audioImportData).toHaveBeenCalledTimes(2);
    expect(mocks.softDeleteSession).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeSessionDeletion).toHaveBeenCalledTimes(1);
  });

  it("keeps a dropped file whose fingerprint cannot be read", async () => {
    mocks.audioMetadata.mockResolvedValue({ status: "error", error: "gone" });
    const { result } = renderHook(() => useNewNoteFromDroppedAudio());

    await result.current([audioFile("a.mp3"), audioFile("b.mp3")]);

    // Deleting on a failed read would destroy a recording to save disk space.
    expect(mocks.softDeleteSession).not.toHaveBeenCalled();
  });

  it("holds off sleep for the whole import and releases it after", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio");

    // Copying hundreds of files runs for a long time and a sleeping Mac does
    // not resume it, so the assertion spans the run rather than each file.
    expect(mocks.keepAwakeAcquire).toHaveBeenCalledTimes(1);
    expect(mocks.keepAwakeRelease).toHaveBeenCalledTimes(1);
  });

  it("releases the sleep assertion even when the import throws", async () => {
    mocks.selectFile.mockResolvedValue(["/tmp/a.mp3", "/tmp/b.mp3"]);
    mocks.createSession.mockRejectedValue(new Error("db gone"));
    const { result } = renderHook(() => useNewNoteAndUpload());

    await result.current("audio").catch(() => {});

    // Leaking it would keep the Mac awake for the rest of the session.
    expect(mocks.keepAwakeRelease).toHaveBeenCalledTimes(1);
  });
});
