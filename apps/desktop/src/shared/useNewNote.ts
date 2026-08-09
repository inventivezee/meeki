import { downloadDir } from "@tauri-apps/api/path";
import { open as selectFile } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useShallow } from "zustand/shallow";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";

import { createSession } from "~/session/queries";
import { useTabs } from "~/store/zustand/tabs";
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

      for (const filePath of rest) {
        await importIntoNewNote((sessionId) =>
          fsSyncCommands.audioImport(sessionId, filePath),
        );
      }

      openNew({
        type: "sessions",
        id: firstSessionId,
        state: { view: null, autoStart: null },
      });
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
    }
  } catch (error) {
    console.error("[session] failed to import audio", error);
  }
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

      for (const file of rest) {
        const data = Array.from(new Uint8Array(await file.arrayBuffer()));
        await importIntoNewNote((sessionId) =>
          fsSyncCommands.audioImportData(
            sessionId,
            data,
            file.name,
            file.type || null,
          ),
        );
      }

      openNew({
        type: "sessions",
        id: firstSessionId,
        state: { view: null, autoStart: null },
      });
    },
    [openNew],
  );
}
