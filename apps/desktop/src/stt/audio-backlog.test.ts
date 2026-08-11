import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("~/db", () => ({ liveQueryClient: { execute: mocks.execute } }));

import {
  listBacklog,
  listUnsummarizedSessions,
  listUntranscribedSessions,
  useAudioBacklog,
} from "./audio-backlog";

describe("finding the pending recordings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([{ session_id: "a" }, { session_id: "b" }]);
  });

  it("asks only for audio that has no transcript", async () => {
    await listUntranscribedSessions();

    const [sql] = mocks.execute.mock.calls[0] as [string];
    expect(sql).toContain("'session_audio'");
    expect(sql).toContain("transcript_status");
    expect(sql).toContain("NOT EXISTS");
    // Oldest first, so a long run works forward through the archive rather
    // than jumping around as rows are written.
    expect(sql).toContain("ORDER BY session.created_at");
  });

  it("returns the ids in query order", async () => {
    expect(await listUntranscribedSessions()).toEqual(["a", "b"]);
  });
});

describe("tracking a backlog run", () => {
  beforeEach(() => {
    useAudioBacklog.setState({
      running: false,
      total: 0,
      done: 0,
      failed: new Set(),
    });
  });

  it("counts a failure as progress so one bad file cannot stall the rest", () => {
    const { start, recordDone, recordFailure } = useAudioBacklog.getState();
    start(3);
    recordDone();
    recordFailure("broken");
    recordDone();

    const state = useAudioBacklog.getState();
    expect(state.done).toBe(3);
    expect(state.failed.has("broken")).toBe(true);
  });

  it("clears the previous run's failures when starting again", () => {
    useAudioBacklog.getState().recordFailure("broken");
    useAudioBacklog.getState().start(10);

    const state = useAudioBacklog.getState();
    expect(state.failed.size).toBe(0);
    expect(state.done).toBe(0);
    expect(state.total).toBe(10);
  });

  it("stops without discarding what it got through", () => {
    const { start, recordDone, stop } = useAudioBacklog.getState();
    start(5);
    recordDone();
    stop();

    const state = useAudioBacklog.getState();
    expect(state.running).toBe(false);
    expect(state.done).toBe(1);
  });
});

describe("finding recordings that were never summarized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue([]);
  });

  it("treats an empty summary as missing, not as done", async () => {
    await listUnsummarizedSessions();

    const [sql] = mocks.execute.mock.calls[0] as [string];
    // ensureSummaryDocument writes the row before generation, so a failed
    // summary leaves one behind. Testing for the row alone would call every
    // failure finished.
    expect(sql).toContain("TRIM(session_documents.body) <> ''");
    expect(sql).toContain("'summary', 'template_output'");
    expect(sql).toContain("FROM transcripts");
  });

  it("queues transcription first and never queues a session twice", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ session_id: "needs-transcript" }])
      .mockResolvedValueOnce([
        { session_id: "needs-transcript" },
        { session_id: "needs-summary" },
      ]);

    const backlog = await listBacklog();

    // A recording about to be transcribed will be summarized by that same
    // pass, so it must not also appear as summary work.
    expect(backlog).toEqual([
      { sessionId: "needs-transcript", kind: "transcribe" },
      { sessionId: "needs-summary", kind: "summarize" },
    ]);
  });

  it("asks for no summary work when the user declined summaries", async () => {
    mocks.execute.mockResolvedValueOnce([{ session_id: "a" }]);

    const backlog = await listBacklog({ summarize: false });

    expect(backlog).toEqual([{ sessionId: "a", kind: "transcribe" }]);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
