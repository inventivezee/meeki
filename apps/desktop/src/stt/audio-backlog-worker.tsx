import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { commands as miscCommands } from "@meeki/plugin-misc";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { listUntranscribedSessions, useAudioBacklog } from "./audio-backlog";
import { isStoppedTranscriptionError, useRunBatch } from "./useRunBatch";

import { getEnhancerService } from "~/services/enhancer";
import {
  createTaskId,
  type TaskId,
} from "~/store/zustand/ai-task/task-configs";

const BACKLOG_TOAST_ID = "audio-backlog";

/**
 * Works through imported recordings that were never transcribed, one at a time.
 *
 * Mounted in the shell rather than in a session, because the shell renders only
 * the tab that is on screen — anything driven from the session view would
 * process exactly one note, the open one.
 *
 * Strictly sequential. Transcription and summarisation both saturate the
 * machine, and a few hundred recordings run for many hours; overlapping them
 * would not finish sooner and would make a laptop unusable meanwhile.
 */
export function AudioBacklogWorker() {
  const running = useAudioBacklog((state) => state.running);
  const failed = useAudioBacklog((state) => state.failed);

  useKeepAwakeWhileRunning(running);

  const pending = useQuery({
    enabled: running,
    queryKey: ["audio-backlog"],
    queryFn: listUntranscribedSessions,
    // Nothing emits an event when a transcript lands, and each item takes
    // minutes anyway, so polling costs nothing worth avoiding.
    refetchInterval: 5_000,
  });

  const next = pending.data?.find((sessionId) => !failed.has(sessionId));

  // The queue is not known until the first fetch lands. Reporting "finished"
  // off an undefined list would end every run the instant it started.
  useBacklogProgressToast(running && pending.isSuccess, Boolean(next));

  if (!running || !next) {
    return null;
  }

  return <TranscribeOne key={next} sessionId={next} />;
}

const KEEP_AWAKE_REASON = "Meeki is transcribing imported recordings";

/**
 * Holds off system sleep for the whole run, not per recording.
 *
 * A few hundred recordings is hours of work, and the gaps between them — a
 * summary streaming, the next file being read — are exactly when an idle Mac
 * would decide to sleep. Held across the run so those gaps are covered too.
 *
 * Sleep does not merely pause this: tokio's timers do not advance while the
 * machine is asleep, so work in flight stalls rather than resuming.
 */
function useKeepAwakeWhileRunning(running: boolean) {
  useEffect(() => {
    if (!running) {
      return;
    }

    void miscCommands.keepAwakeAcquire(KEEP_AWAKE_REASON);
    return () => {
      // Released on stop, on finish, and on unmount — the assertion must never
      // outlive the work that asked for it.
      void miscCommands.keepAwakeRelease(KEEP_AWAKE_REASON);
    };
  }, [running]);
}

function useBacklogProgressToast(active: boolean, hasWork: boolean) {
  const { total, done, failed, stop } = useAudioBacklog();

  useEffect(() => {
    if (!active) {
      return;
    }

    if (!hasWork) {
      sonnerToast.success(
        failed.size > 0
          ? `Finished ${done - failed.size} recordings, ${failed.size} failed`
          : `Finished ${done} recordings`,
        { id: BACKLOG_TOAST_ID, duration: 8_000 },
      );
      stop();
      return;
    }

    sonnerToast.message("Transcribing recordings", {
      id: BACKLOG_TOAST_ID,
      description: `${done} of ${total} · this runs for hours`,
      duration: Infinity,
      action: {
        label: "Stop",
        onClick: () => {
          stop();
          // The recording in flight is left to finish rather than abandoned
          // half-transcribed; Stop means no more after this one. Replacing the
          // toast here is what clears it — the effect above has already
          // returned by the time `running` is false.
          sonnerToast.message(`Stopped after ${done} of ${total}`, {
            id: BACKLOG_TOAST_ID,
            duration: 5_000,
          });
        },
      },
    });
  }, [active, hasWork, done, total, failed, stop]);
}

/**
 * One session's worth of work: transcribe, then summarise.
 *
 * A hook-shaped component rather than a plain async loop because `useRunBatch`
 * needs the session and its participants, and both arrive through hooks keyed
 * on the session id. Keying this component on the id is what gives each session
 * its own instance of them.
 */
function TranscribeOne({ sessionId }: { sessionId: string }) {
  const { aiTaskStore } = useRouteContext({ from: "__root__" });
  const runBatch = useRunBatch(sessionId);
  const recordDone = useAudioBacklog((state) => state.recordDone);
  const recordFailure = useAudioBacklog((state) => state.recordFailure);

  const runBatchRef = useRef(runBatch);
  runBatchRef.current = runBatch;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const path = await fsSyncCommands.audioPath(sessionId);
        if (path.status === "error") {
          throw new Error(path.error);
        }

        await runBatchRef.current(path.data, {
          promotion: { scope: "whole_session" },
        });

        // Read at use rather than subscribed to, so flipping the choice
        // mid-run cannot re-render this component and restart its work.
        if (useAudioBacklog.getState().summarize) {
          const started = await getEnhancerService()?.enhance(sessionId);
          // `enhance` resolves once the task is queued, not once the summary
          // exists. Waiting for it matters here: two summaries in flight can
          // want different context windows, and growing the window restarts
          // llama-server underneath whichever one is still streaming.
          if (started && "noteId" in started && aiTaskStore) {
            await waitForEnhance(aiTaskStore, started.noteId, () => cancelled);
          }
        }

        if (!cancelled) {
          recordDone();
        }
      } catch (error) {
        if (isStoppedTranscriptionError(error)) {
          return;
        }
        console.error("[audio-backlog] failed to process session", {
          sessionId,
          error,
        });
        if (!cancelled) {
          // Counted as done and skipped for the rest of this run: one
          // unreadable file must not stall the several hundred behind it.
          recordFailure(sessionId);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, recordDone, recordFailure]);

  return null;
}

/**
 * Blocks until a queued summary reaches a terminal state.
 *
 * Polled rather than subscribed because the task store keys on a note id the
 * caller only learns after queueing, and a summary takes minutes — a second of
 * latency at the end of one is not worth a subscription to notice.
 */
async function waitForEnhance(
  aiTaskStore: {
    getState: () => {
      getState: (taskId: TaskId<"enhance">) => { status: string } | undefined;
    };
  },
  noteId: string,
  isCancelled: () => boolean,
): Promise<void> {
  const taskId = createTaskId(noteId, "enhance");

  while (!isCancelled()) {
    const task = aiTaskStore.getState().getState(taskId);
    if (task?.status !== "generating") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
