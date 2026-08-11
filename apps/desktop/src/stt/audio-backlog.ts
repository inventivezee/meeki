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

/**
 * Sessions that were transcribed but never summarized.
 *
 * The transcribe pass marks a recording processed the moment its transcript
 * lands, so a summary that failed afterwards left nothing to look for — the
 * recording had dropped out of the only queue there was. This is the second
 * half: same trick, different question.
 *
 * An empty body counts as missing, because `ensureSummaryDocument` writes the
 * row before generation starts. A summary that failed leaves that row behind,
 * so testing for the row alone would declare every failure finished.
 */
const PENDING_SUMMARY_SQL = `
  SELECT session.id AS session_id
  FROM sessions AS session
  WHERE session.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM transcripts
      WHERE transcripts.session_id = session.id
        AND transcripts.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM session_documents
      WHERE session_documents.session_id = session.id
        AND session_documents.deleted_at IS NULL
        AND session_documents.kind IN ('summary', 'template_output')
        AND TRIM(session_documents.body) <> ''
    )
  ORDER BY session.created_at, session.id
`;

export async function listUnsummarizedSessions(): Promise<string[]> {
  const rows = await liveQueryClient.execute<{ session_id: string }>(
    PENDING_SUMMARY_SQL,
  );
  return rows.map((row) => row.session_id);
}

export type BacklogItem = {
  sessionId: string;
  kind: "transcribe" | "summarize";
};

/**
 * Everything still to do, transcription first.
 *
 * Ordering matters: a recording transcribed in this run should be summarized by
 * the pass that follows rather than queued twice, and putting transcription
 * first means the summary sweep sees a settled picture when it gets there.
 */
export async function listBacklog(options?: {
  summarize?: boolean;
}): Promise<BacklogItem[]> {
  const [untranscribed, unsummarized] = await Promise.all([
    listUntranscribedSessions(),
    options?.summarize === false
      ? Promise.resolve<string[]>([])
      : listUnsummarizedSessions(),
  ]);

  const transcribing = new Set(untranscribed);
  return [
    ...untranscribed.map(
      (sessionId): BacklogItem => ({ sessionId, kind: "transcribe" }),
    ),
    ...unsummarized
      .filter((sessionId) => !transcribing.has(sessionId))
      .map((sessionId): BacklogItem => ({ sessionId, kind: "summarize" })),
  ];
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
  const pending = await listBacklog(options).catch(() => []);
  if (pending.length === 0) {
    return;
  }
  useAudioBacklog.getState().start(pending.length, options);
}
