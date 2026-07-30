import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { FolderOpenIcon, MicIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@meeki/ui/components/ui/button";
import { cn } from "@meeki/utils";

import { useLiveQuery } from "~/db";
import { ExportModal } from "~/session/components/outer-header/overflow/export-modal";
import { buildExportName } from "~/session/recordings/export-name";
import { loadExportableRecordings } from "~/session/recordings/queries";
import type { EditorView } from "~/store/zustand/tabs/schema";

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

export function SettingsRecordings() {
  const recordings = useRecordings();
  const [isExportOpen, setIsExportOpen] = useState(false);

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
              Meeki keeps each recording beside its note. Export copies them
              into one folder, named by date and note title, leaving the
              originals untouched.
            </Trans>
          </p>
        </div>

        <Button onClick={() => setIsExportOpen(true)}>
          <FolderOpenIcon className="size-4" />
          <Trans>Export all</Trans>
        </Button>
      </div>

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
