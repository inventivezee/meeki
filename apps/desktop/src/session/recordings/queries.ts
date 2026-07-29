import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";

import { liveQueryClient } from "~/db";
import type { RecordingForExport } from "~/session/recordings/export-name";

type RecordingSqlRow = {
  id: string;
  title: string;
  created_at: string;
  started_at: string | null;
  timezone: string | null;
};

/**
 * Sessions that actually have audio on disk, newest first.
 *
 * Existence has to be checked against the filesystem rather than the database:
 * a legacy-vault import leaves the file in place with no attachment row, so a
 * purely SQL answer would omit recordings the user can plainly see.
 */
export async function loadExportableRecordings(): Promise<
  RecordingForExport[]
> {
  const rows = await liveQueryClient.execute<RecordingSqlRow>(
    `
      SELECT id, title, created_at, started_at, timezone
      FROM sessions
      WHERE deleted_at IS NULL
      ORDER BY COALESCE(started_at, created_at) DESC, id
    `,
  );

  const recordings: RecordingForExport[] = [];
  for (const row of rows) {
    const exists = await fsSyncCommands.audioExist(row.id);
    if (exists.status === "ok" && exists.data) {
      recordings.push({
        sessionId: row.id,
        title: row.title,
        startedAt: row.started_at ?? row.created_at,
        timezone: row.timezone,
      });
    }
  }
  return recordings;
}
