import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { FolderOpenIcon, FolderUpIcon, MicIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@meeki/ui/components/ui/button";
import { cn } from "@meeki/utils";

import { useLiveQuery } from "~/db";
import { ExportModal } from "~/session/components/outer-header/overflow/export-modal";
import { buildExportName } from "~/session/recordings/export-name";
import { loadExportableRecordings } from "~/session/recordings/queries";
import { useNewNoteAndUpload } from "~/shared/useNewNote";
import type { EditorView } from "~/store/zustand/tabs/schema";
import {
  listBacklog,
  startBacklogRun,
  useAudioBacklog,
} from "~/stt/audio-backlog";

function useRecordings() {
  // Re-runs when sessions change so a new recording appears without a reopen.
  const { data: sessions = [] } = useLiveQuery<
    { id: string },
    { id: string }[]
  >({
    sql: `SELECT id FROM sessions WHERE deleted_at IS NULL`,
  });

  return useQuery({
    queryKey: ["exportable-recordings", sessions.length],
    queryFn: loadExportableRecordings,
  });
}

/**
 * Imported audio that has never been transcribed, and the button that works
 * through it.
 *
 * Lives here rather than on the home screen: it is a property of the recordings
 * you have, not one of the things you might do next. Hidden when there is
 * nothing waiting, which is the normal case.
 */
function PendingTranscriptions() {
  const running = useAudioBacklog((state) => state.running);
  const done = useAudioBacklog((state) => state.done);
  const total = useAudioBacklog((state) => state.total);
  const [count, setCount] = useState(0);

  // Counted on mount and whenever a run ends. The queue is a query, so
  // "resume" after a quit or a crash is just asking again.
  useEffect(() => {
    if (running) {
      return;
    }

    let current = true;
    void listBacklog()
      .then((pending) => current && setCount(pending.length))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [running]);

  if (!running && count === 0) {
    return null;
  }

  return (
    <div className="border-border/60 bg-card/70 flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">
          {running ? (
            <Trans>
              Transcribing {done} of {total}
            </Trans>
          ) : (
            <Trans>{count} recordings still to process</Trans>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          <Trans>
            Runs one at a time and can take hours. Stopping keeps everything
            finished so far.
          </Trans>
        </p>
      </div>
      {running ? (
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => useAudioBacklog.getState().stop()}
        >
          <Trans>Stop</Trans>
        </Button>
      ) : (
        <div className="flex shrink-0 gap-2">
          {/* Transcribing stops the language model to keep both off the GPU, so
              every summary reloads it from cold. Skipping summaries here is
              worth minutes a recording across several hundred of them, and the
              summary sweep picks them all up afterwards. */}
          <Button
            variant="outline"
            onClick={() => void startBacklogRun({ summarize: false })}
          >
            <Trans>Transcribe only</Trans>
          </Button>
          {/* Summaries sit behind every recording still to be transcribed, so
              with a large import a failed summary is days from being retried.
              This reaches them directly. */}
          <Button
            variant="outline"
            onClick={() => void startBacklogRun({ transcribe: false })}
          >
            <Trans>Summaries only</Trans>
          </Button>
          <Button variant="outline" onClick={() => void startBacklogRun()}>
            <Trans>Process all</Trans>
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettingsRecordings() {
  const recordings = useRecordings();
  const [isExportOpen, setIsExportOpen] = useState(false);
  const uploadRecordings = useNewNoteAndUpload();

  // Picking several files opens the transcribe/summarize prompt, so this is
  // the same bulk path as the note's overflow menu, not a second one.
  const importRecordings = useCallback(
    () => void uploadRecordings("audio"),
    [uploadRecordings],
  );

  const items = recordings.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">
            <Trans>Recordings</Trans>
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">
            <Trans>
              Meeki keeps each recording beside its note. Import brings in
              existing audio, a note per file. Export copies them into one
              folder, named by date and note title, leaving the originals
              untouched.
            </Trans>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={importRecordings}>
            <FolderUpIcon className="size-4" />
            <Trans>Import</Trans>
          </Button>
          <Button onClick={() => setIsExportOpen(true)}>
            <FolderOpenIcon className="size-4" />
            <Trans>Export all</Trans>
          </Button>
        </div>
      </div>

      <PendingTranscriptions />

      <div className="flex flex-col divide-y rounded-lg border">
        {recordings.isLoading && (
          <p className="text-muted-foreground p-4 text-sm">
            <Trans>Looking for recordings...</Trans>
          </p>
        )}

        {!recordings.isLoading && items.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            <Trans>No recordings yet.</Trans>
          </p>
        )}

        {items.map((item) => (
          <div
            key={item.sessionId}
            className={cn(["flex items-center gap-3 p-3 text-sm"])}
          >
            <MicIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{buildExportName(item)}</span>
          </div>
        ))}
      </div>

      {isExportOpen && (
        <ExportModal
          sessionId=""
          currentView={{ type: "raw" } as EditorView}
          open={isExportOpen}
          onOpenChange={setIsExportOpen}
          lockedScope="all"
        />
      )}
    </div>
  );
}
