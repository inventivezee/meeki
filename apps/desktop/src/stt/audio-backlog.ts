import { create } from "zustand";

import { liveQueryClient } from "~/db";

/**
 * Sessions whose audio was imported but never transcribed.
 *
 * This is the queue. There is no queue table and there does not need to be one
 * — "has audio, has no transcript" is already recorded, so a run that is
 * interrupted by a crash, a quit or a week-long gap resumes by asking again.
 *
 * `transcript_status` is what the live-recording path writes when it finishes,
 * so a session it already handled is skipped even if its transcript rows were
 * later deleted.
 */
const PENDING_SQL = `
  SELECT attachment.session_id AS session_id
  FROM session_attachments AS attachment
  JOIN sessions AS session ON session.id = attachment.session_id
  WHERE attachment.source_type = 'session_audio'
    AND attachment.source_id = 'primary'
    AND attachment.deleted_at IS NULL
    AND session.deleted_at IS NULL
    AND COALESCE(
      json_extract(attachment.metadata_json, '$.transcript_status'),
      ''
    ) != 'complete'
    AND NOT EXISTS (
      SELECT 1
      FROM transcripts
      WHERE transcripts.session_id = session.id
        AND transcripts.deleted_at IS NULL
    )
  ORDER BY session.created_at, session.id
`;

export async function listUntranscribedSessions(): Promise<string[]> {
  const rows = await liveQueryClient.execute<{ session_id: string }>(
    PENDING_SQL,
  );
  return rows.map((row) => row.session_id);
}

type BacklogState = {
  running: boolean;
  /** How many were pending when the user started, so progress reads as N of M. */
  total: number;
  done: number;
  /** Whether to write a summary after each transcript, as the user chose. */
  summarize: boolean;
  /**
   * Sessions this run could not transcribe. Held in memory only: a file that
   * fails today may well succeed after the user fixes the model or the disk,
   * and a persisted skip list would quietly hide it forever.
   */
  failed: Set<string>;
  start: (total: number, options?: { summarize?: boolean }) => void;
  stop: () => void;
  recordDone: () => void;
  recordFailure: (sessionId: string) => void;
};

export const useAudioBacklog = create<BacklogState>((set) => ({
  running: false,
  total: 0,
  done: 0,
  summarize: true,
  failed: new Set(),
  start: (total, options) =>
    set({
      running: true,
      total,
      done: 0,
      summarize: options?.summarize ?? true,
      failed: new Set(),
    }),
  stop: () => set({ running: false }),
  recordDone: () => set((state) => ({ done: state.done + 1 })),
  recordFailure: (sessionId) =>
    set((state) => ({
      done: state.done + 1,
      failed: new Set(state.failed).add(sessionId),
    })),
}));

/**
 * Starts a run over whatever is pending right now.
 *
 * The count is read at the moment of starting rather than passed in, because
 * the caller's idea of "how many" comes from a selection, and some of those
 * files may have failed to import.
 */
export async function startBacklogRun(options?: {
  summarize?: boolean;
}): Promise<void> {
  const pending = await listUntranscribedSessions().catch(() => []);
  if (pending.length === 0) {
    return;
  }
  useAudioBacklog.getState().start(pending.length, options);
}
