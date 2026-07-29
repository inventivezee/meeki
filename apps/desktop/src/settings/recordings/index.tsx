import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpenIcon, MicIcon } from "lucide-react";
import { useState } from "react";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { Button } from "@meeki/ui/components/ui/button";
import { cn } from "@meeki/utils";

import { useLiveQuery } from "~/db";
import {
  buildExportName,
  type RecordingForExport,
} from "~/session/recordings/export-name";

type RecordingRow = {
  id: string;
  title: string;
  created_at: string;
  started_at: string | null;
  timezone: string | null;
};

function useRecordings() {
  const { data: sessions = [] } = useLiveQuery<RecordingRow, RecordingRow[]>({
    sql: `
      SELECT id, title, created_at, started_at, timezone
      FROM sessions
      WHERE deleted_at IS NULL
      ORDER BY COALESCE(started_at, created_at) DESC, id
    `,
  });

  // Audio existence is only knowable from disk: a legacy-vault import has the
  // file with no attachment row, so the database cannot answer this.
  return useQuery({
    enabled: sessions.length > 0,
    queryKey: ["recordings-with-audio", sessions.map((s) => s.id).join(",")],
    queryFn: async () => {
      const withAudio: RecordingForExport[] = [];
      for (const session of sessions) {
        const exists = await fsSyncCommands.audioExist(session.id);
        if (exists.status === "ok" && exists.data) {
          withAudio.push({
            sessionId: session.id,
            title: session.title,
            startedAt: session.started_at ?? session.created_at,
            timezone: session.timezone,
          });
        }
      }
      return withAudio;
    },
  });
}

export function SettingsRecordings() {
  const { t } = useLingui();
  const recordings = useRecordings();
  const [lastFolder, setLastFolder] = useState<string | null>(null);

  const exportAll = useMutation({
    mutationFn: async (items: RecordingForExport[]) => {
      const destDir = await open({
        directory: true,
        multiple: false,
        title: t`Choose a folder for your recordings`,
      });
      if (typeof destDir !== "string") {
        return null;
      }

      let exported = 0;
      const failed: string[] = [];
      for (const item of items) {
        const result = await fsSyncCommands.audioExport(
          item.sessionId,
          destDir,
          buildExportName(item),
        );
        if (result.status === "ok") {
          exported += 1;
        } else {
          failed.push(item.title || item.sessionId);
        }
      }
      return { destDir, exported, failed };
    },
    onSuccess: (result) => {
      if (result) {
        setLastFolder(result.destDir);
      }
    },
  });

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

        <Button
          disabled={items.length === 0 || exportAll.isPending}
          onClick={() => exportAll.mutate(items)}
        >
          <FolderOpenIcon className="size-4" />
          {exportAll.isPending ? (
            <Trans>Exporting...</Trans>
          ) : (
            <Trans>Export all</Trans>
          )}
        </Button>
      </div>

      {exportAll.data && (
        <p className="text-muted-foreground text-sm">
          {exportAll.data.failed.length === 0 ? (
            <Trans>
              Exported {exportAll.data.exported} recordings to{" "}
              {exportAll.data.destDir}
            </Trans>
          ) : (
            <Trans>
              Exported {exportAll.data.exported}, and could not read{" "}
              {exportAll.data.failed.length}.
            </Trans>
          )}
        </p>
      )}

      {lastFolder && !exportAll.isPending && (
        <p className="text-muted-foreground text-xs">{lastFolder}</p>
      )}

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
    </div>
  );
}
