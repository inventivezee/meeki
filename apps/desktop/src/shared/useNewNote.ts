import { downloadDir } from "@tauri-apps/api/path";
import { open as selectFile } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useShallow } from "zustand/shallow";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { catalogLocalSessionAudio } from "~/session/attachments";
import { createSession } from "~/session/queries";
import { useTabs } from "~/store/zustand/tabs";
import {
  listUntranscribedSessions,
  useAudioBacklog,
} from "~/stt/audio-backlog";
import { useListener } from "~/stt/contexts";
import { setPendingUpload } from "~/stt/pending-upload";
import { AUDIO_EXTENSIONS, isAudioUploadFile } from "~/stt/useUploadFile";

export function useNewNote({
  behavior = "new",
}: {
  behavior?: "new" | "current";
} = {}) {
  const { openNew, openCurrent } = useTabs(
    useShallow((state) => ({
      openNew: state.openNew,
      openCurrent: state.openCurrent,
    })),
  );

  const handler = useCallback(() => {
    const ff = behavior === "new" ? openNew : openCurrent;
    void createSession()
      .then((sessionId) => {
        ff({ type: "sessions", id: sessionId });
      })
      .catch((error) => {
        console.error("[session] failed to create note", error);
      });
  }, [openNew, openCurrent, behavior]);

  return handler;
}

export function useNewNoteAndListen({
  behavior = "new",
}: {
  behavior?: "new" | "current";
} = {}) {
  const { openNew, openCurrent } = useTabs(
    useShallow((state) => ({
      openNew: state.openNew,
      openCurrent: state.openCurrent,
    })),
  );
  const { status, sessionId: liveSessionId } = useListener((state) => ({
    status: state.live.status,
    sessionId: state.live.sessionId,
  }));

  const handler = useCallback(() => {
    if (status === "active" && liveSessionId) {
      const ff = behavior === "new" ? openNew : openCurrent;
      ff({ type: "sessions", id: liveSessionId });
      return;
    }

    const ff = behavior === "new" ? openNew : openCurrent;
    void createSession()
      .then((sessionId) => {
        ff({
          type: "sessions",
          id: sessionId,
          state: { view: null, autoStart: true },
        });
      })
      .catch((error) => {
        console.error("[session] failed to create listening note", error);
      });
  }, [status, liveSessionId, openNew, openCurrent, behavior]);

  return handler;
}

// Shared with the in-session upload button and the drop overlay's copy, so the
// three can't drift — this list used to omit webm and aac, which drop accepted.
const AUDIO_FILTERS = [{ name: "Audio", extensions: AUDIO_EXTENSIONS }];
const TRANSCRIPT_FILTERS = [{ name: "Transcript", extensions: ["vtt", "srt"] }];

export function useNewNoteAndUpload() {
  const openNew = useTabs((state) => state.openNew);

  const handler = useCallback(
    async (kind: "audio" | "transcript") => {
      const defaultPath = await downloadDir();
      const selection = await selectFile({
        // One transcript belongs to one note, so only audio takes a batch.
        multiple: kind === "audio",
        title: kind === "audio" ? "Upload Audio" : "Upload Transcript",
        directory: false,
        defaultPath,
        filters: kind === "audio" ? AUDIO_FILTERS : TRANSCRIPT_FILTERS,
      });

      const filePaths = toSelectionList(selection);
      if (filePaths.length === 0) {
        return;
      }

      const [first, ...rest] = filePaths;
      const firstSessionId = await createSession();
      setPendingUpload(firstSessionId, { kind, filePath: first! });

      openNew({
        type: "sessions",
        id: firstSessionId,
        state: { view: null, autoStart: null },
      });

      await importBatch(
        rest,
        (filePath) => (sessionId) =>
          fsSyncCommands.audioImport(sessionId, filePath),
      );
    },
    [openNew],
  );

  return handler;
}

function toSelectionList(selection: string | string[] | null): string[] {
  if (Array.isArray(selection)) {
    return selection.filter(Boolean);
  }
  return selection ? [selection] : [];
}

/**
 * Every file past the first is imported here rather than queued. A pending
 * upload is only consumed by the session view, and the shell renders just the
 * tab that is on screen — so a queued file would sit untouched until the user
 * happened to open that note, and be lost outright if they quit first.
 */
async function importIntoNewNote(
  run: (
    sessionId: string,
  ) => Promise<{ status: "ok" | "error"; error?: unknown }>,
): Promise<void> {
  const sessionId = await createSession();
  try {
    const result = await run(sessionId);
    if (result.status === "error") {
      console.error("[session] failed to import audio", result.error);
      return;
    }
    // The single-file path catalogs through useUploadFile. Without the
    // attachment row the audio exists on disk but nothing else can see it —
    // not the player, not sync, not the backlog this note now belongs to.
    await catalogLocalSessionAudio(sessionId);
  } catch (error) {
    console.error("[session] failed to import audio", error);
  }
}

const IMPORT_TOAST_ID = "bulk-audio-import";

/**
 * Imports the rest of a multi-file selection one at a time, reporting as it
 * goes.
 *
 * A folder of a few hundred recordings is minutes of copying with the window
 * unresponsive, which is indistinguishable from a hang. The count says
 * otherwise, and Stop ends the run at a file boundary rather than leaving a
 * half-written copy behind. Files already imported keep their notes — stopping
 * is "no more", not "undo".
 */
async function importBatch<T>(
  items: T[],
  toImport: (
    item: T,
  ) => (
    sessionId: string,
  ) => Promise<{ status: "ok" | "error"; error?: unknown }>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  // The first file was handed to the session view, so it counts toward the
  // total the user selected even though it is not imported here.
  const total = items.length + 1;
  let stopped = false;

  const report = (done: number) => {
    sonnerToast.message(`Importing ${total} recordings`, {
      id: IMPORT_TOAST_ID,
      description: `${done} of ${total}`,
      duration: Infinity,
      action: {
        label: "Stop",
        onClick: () => {
          stopped = true;
        },
      },
    });
  };

  report(1);

  let done = 1;
  for (const item of items) {
    if (stopped) {
      break;
    }
    await importIntoNewNote(toImport(item));
    done += 1;
    report(done);
  }

  // Importing only copies the audio. Offer the hours of transcription that
  // follow rather than starting them unasked.
  const pending = await listUntranscribedSessions().catch(() => []);

  sonnerToast.success(
    stopped
      ? `Stopped after importing ${done} of ${total} recordings`
      : `Imported ${done} recordings`,
    {
      id: IMPORT_TOAST_ID,
      duration: pending.length > 0 ? 30_000 : 5_000,
      action:
        pending.length > 0
          ? {
              label: `Transcribe ${pending.length}`,
              onClick: () => useAudioBacklog.getState().start(pending.length),
            }
          : undefined,
    },
  );
}

/** Drop audio files anywhere on the empty tab: a note each, then import them. */
export function useNewNoteFromDroppedAudio() {
  const openNew = useTabs((state) => state.openNew);

  return useCallback(
    async (dropped: File | File[]) => {
      const files = (Array.isArray(dropped) ? dropped : [dropped]).filter(
        isAudioUploadFile,
      );
      if (files.length === 0) {
        return;
      }

      const [first, ...rest] = files;
      const firstSessionId = await createSession();
      setPendingUpload(firstSessionId, { kind: "audio", file: first! });

      openNew({
        type: "sessions",
        id: firstSessionId,
        state: { view: null, autoStart: null },
      });

      // A dropped file has no path, so its bytes cross IPC as a JSON number
      // array — measured at 3.57x the audio size on the wire and ~22x in heap.
      // Fine for a handful; use Upload a Recording for a folder.
      await importBatch(rest, (file) => async (sessionId) => {
        const data = Array.from(new Uint8Array(await file.arrayBuffer()));
        return fsSyncCommands.audioImportData(
          sessionId,
          data,
          file.name,
          file.type || null,
        );
      });
    },
    [openNew],
  );
}
