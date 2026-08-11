import { downloadDir } from "@tauri-apps/api/path";
import { open as selectFile } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect } from "react";
import { useShallow } from "zustand/shallow";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { catalogLocalSessionAudio } from "~/session/attachments";
import { createSession } from "~/session/queries";
import { askBulkImportChoice } from "~/shared/bulk-import-prompt";
import {
  createDuplicateFilter,
  loadImportedAudioHashes,
} from "~/shared/import-duplicates";
import { useTabs } from "~/store/zustand/tabs";
import { startBacklogRun } from "~/stt/audio-backlog";
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

/**
 * A recording start that has been asked for but has not reached "active" yet.
 *
 * Module-level on purpose: Start Recording exists in the sidebar, on the home
 * screen, in the note header and on a keyboard shortcut, so a per-hook guard
 * would not stop two of them racing — nor two clicks on one of them.
 *
 * `LiveSessionStatus` is only inactive | active | finalizing; there is nothing
 * between asking and being active to check. Without this claim a second click
 * inside that window creates a second session that also auto-starts, and the
 * UI can only offer a stop control for one of them — leaving a recording
 * running with no visible way to end it.
 */
const PENDING_RECORDING_TIMEOUT_MS = 20_000;
let pendingRecording: {
  sessionId: string | null;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function claimPendingRecording() {
  releasePendingRecording();
  pendingRecording = {
    sessionId: null,
    // A start that never reports active must not wedge the button for the rest
    // of the session. Allowing a second attempt is the lesser failure.
    timer: setTimeout(releasePendingRecording, PENDING_RECORDING_TIMEOUT_MS),
  };
}

function releasePendingRecording() {
  if (pendingRecording) {
    clearTimeout(pendingRecording.timer);
    pendingRecording = null;
  }
}

/** Exposed so tests do not leak a claim from one case into the next. */
export function resetPendingRecording() {
  releasePendingRecording();
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

  // Clearing on "finalizing" too: a recording that has already been stopped is
  // not one this guard should keep blocking.
  useEffect(() => {
    if (status === "active" || status === "finalizing") {
      releasePendingRecording();
    }
  }, [status]);

  const handler = useCallback(() => {
    const ff = behavior === "new" ? openNew : openCurrent;

    if (status === "active" && liveSessionId) {
      ff({ type: "sessions", id: liveSessionId });
      return;
    }

    // Claimed synchronously, before the await below, so a second click in the
    // same tick sees it.
    if (pendingRecording) {
      if (pendingRecording.sessionId) {
        ff({ type: "sessions", id: pendingRecording.sessionId });
      }
      return;
    }
    claimPendingRecording();

    void createSession()
      .then((sessionId) => {
        if (pendingRecording) {
          pendingRecording.sessionId = sessionId;
        }
        ff({
          type: "sessions",
          id: sessionId,
          state: { view: null, autoStart: true },
        });
      })
      .catch((error) => {
        releasePendingRecording();
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

      if (filePaths.length === 1) {
        const sessionId = await createSession();
        setPendingUpload(sessionId, { kind, filePath: filePaths[0]! });
        openNew({
          type: "sessions",
          id: sessionId,
          state: { view: null, autoStart: null },
        });
        return;
      }

      const choice = await askBulkImportChoice(filePaths.length);
      if (!choice) {
        return;
      }

      // Nothing here goes through setPendingUpload, unlike the single-file case
      // above. That path transcribes from inside the session view, which would
      // race the backlog worker for the same note: neither can see the other
      // start, and both would write a transcript.
      const sessionIds = await importBatch(
        filePaths,
        (filePath) => (sessionId) =>
          fsSyncCommands.audioImport(sessionId, filePath),
        (filePath) => filePath,
      );

      if (sessionIds[0]) {
        openNew({
          type: "sessions",
          id: sessionIds[0],
          state: { view: null, autoStart: null },
        });
      }

      if (choice.transcribe) {
        void startBacklogRun({ summarize: choice.summarize });
      }
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
 * One note, its audio copied in, and an attachment row so the rest of the app
 * can see it.
 *
 * Nothing is queued for the session view to pick up: that view only runs for
 * the tab on screen, so a queued file would sit untouched until the user
 * happened to open that note, and be lost outright if they quit first.
 *
 * Returns the session id, or null if the file could not be imported.
 */
async function importIntoNewNote(
  run: (
    sessionId: string,
  ) => Promise<{ status: "ok" | "error"; error?: unknown }>,
): Promise<string | null> {
  const sessionId = await createSession();
  try {
    const result = await run(sessionId);
    if (result.status === "error") {
      console.error("[session] failed to import audio", result.error);
      return null;
    }
    // The single-file path catalogs through useUploadFile. Without the
    // attachment row the audio exists on disk but nothing else can see it —
    // not the player, not sync, not the backlog this note now belongs to.
    await catalogLocalSessionAudio(sessionId);
    return sessionId;
  } catch (error) {
    console.error("[session] failed to import audio", error);
    return null;
  }
}

const IMPORT_TOAST_ID = "bulk-audio-import";

/**
 * Imports a multi-file selection one at a time, reporting as it goes, and
 * returns the sessions it created.
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
  /**
   * Where the file currently lives, when that is knowable. Only the picker can
   * say — a dropped file has no path — so drops import without the duplicate
   * check rather than pretending to have one.
   */
  sourcePathOf?: (item: T) => string,
): Promise<string[]> {
  const total = items.length;
  const sessionIds: string[] = [];
  let skipped = 0;
  let stopped = false;

  const duplicates = sourcePathOf
    ? createDuplicateFilter(
        await loadImportedAudioHashes().catch(() => new Set<string>()),
      )
    : null;

  const report = (done: number) => {
    sonnerToast.message(`Importing ${total} recordings`, {
      id: IMPORT_TOAST_ID,
      description:
        skipped > 0
          ? `${done} of ${total} · ${skipped} already imported`
          : `${done} of ${total}`,
      duration: Infinity,
      action: {
        label: "Stop",
        onClick: () => {
          stopped = true;
        },
      },
    });
  };

  report(0);

  for (const item of items) {
    if (stopped) {
      break;
    }

    // Checked before the copy, so a duplicate costs a read rather than a read,
    // a write and a delete.
    if (duplicates && sourcePathOf) {
      if (await duplicates.isDuplicate(sourcePathOf(item))) {
        skipped += 1;
        report(sessionIds.length);
        continue;
      }
    }

    const sessionId = await importIntoNewNote(toImport(item));
    if (sessionId) {
      sessionIds.push(sessionId);
    }
    report(sessionIds.length);
  }

  // Counted rather than prompted: a run this long is unattended, and asking
  // about each duplicate would defeat that.
  const skippedNote =
    skipped > 0 ? `, skipped ${skipped} already in your library` : "";
  sonnerToast.success(
    stopped
      ? `Stopped after importing ${sessionIds.length} of ${total} recordings${skippedNote}`
      : `Imported ${sessionIds.length} recordings${skippedNote}`,
    { id: IMPORT_TOAST_ID, duration: 6_000, action: undefined },
  );

  return sessionIds;
}

const DROP_LIMIT_TOAST_ID = "audio-drop-too-large";

/**
 * Past either of these a drop is refused and the user is sent to the file
 * dialog instead.
 *
 * A dropped file has no path, so its bytes cross to Rust as a JSON number
 * array — 3.57x the audio size on the wire, and roughly 22x in heap while the
 * array is built. The dialog hands over paths and Rust copies the files
 * itself. At this size that is not merely faster: it is the difference between
 * importing and running the app out of memory.
 */
const MAX_DROPPED_FILES = 25;
const MAX_DROPPED_BYTES = 1_000_000_000;

function describeOversizedDrop(
  files: readonly File[],
): { title: string; description: string } | null {
  if (files.length > MAX_DROPPED_FILES) {
    return {
      title: `${files.length} recordings is too many to drop`,
      description:
        "Dropping copies every file through the app itself, which stops working well past a couple of dozen. Choosing them from the picker imports them by path instead — you can select a whole folder there.",
    };
  }

  const bytes = files.reduce((total, file) => total + file.size, 0);
  if (bytes > MAX_DROPPED_BYTES) {
    return {
      title: `${(bytes / 1e9).toFixed(1)} GB is too much audio to drop`,
      description:
        "Dropped files are copied through the app itself, and this much would exhaust its memory. Choosing them from the picker imports them by path instead.",
    };
  }

  return null;
}

/** Drop audio files anywhere on the empty tab: a note each, then import them. */
export function useNewNoteFromDroppedAudio() {
  const openNew = useTabs((state) => state.openNew);
  const uploadFromDialog = useNewNoteAndUpload();

  return useCallback(
    async (dropped: File | File[]) => {
      const files = (Array.isArray(dropped) ? dropped : [dropped]).filter(
        isAudioUploadFile,
      );
      if (files.length === 0) {
        return;
      }

      const oversized = describeOversizedDrop(files);
      if (oversized) {
        sonnerToast.error(oversized.title, {
          id: DROP_LIMIT_TOAST_ID,
          description: oversized.description,
          duration: 20_000,
          action: {
            label: "Choose files instead",
            onClick: () => void uploadFromDialog("audio"),
          },
        });
        return;
      }

      if (files.length === 1) {
        const sessionId = await createSession();
        setPendingUpload(sessionId, { kind: "audio", file: files[0]! });
        openNew({
          type: "sessions",
          id: sessionId,
          state: { view: null, autoStart: null },
        });
        return;
      }

      const choice = await askBulkImportChoice(files.length);
      if (!choice) {
        return;
      }

      // A dropped file has no path, so its bytes cross IPC as a JSON number
      // array — measured at 3.57x the audio size on the wire and ~22x in heap.
      // Tolerable at the sizes `describeOversizedDrop` still allows.
      const sessionIds = await importBatch(
        files,
        (file) => async (sessionId) => {
          const data = Array.from(new Uint8Array(await file.arrayBuffer()));
          return fsSyncCommands.audioImportData(
            sessionId,
            data,
            file.name,
            file.type || null,
          );
        },
      );

      if (sessionIds[0]) {
        openNew({
          type: "sessions",
          id: sessionIds[0],
          state: { view: null, autoStart: null },
        });
      }

      if (choice.transcribe) {
        void startBacklogRun({ summarize: choice.summarize });
      }
    },
    [openNew],
  );
}
