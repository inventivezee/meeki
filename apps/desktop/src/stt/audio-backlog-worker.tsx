import { useQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { commands as localLlmCommands } from "@meeki/plugin-local-llm";
import { commands as miscCommands } from "@meeki/plugin-misc";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import {
  type BacklogItem,
  listBacklog,
  useAudioBacklog,
} from "./audio-backlog";
import { useListener } from "./contexts";
import { isStoppedTranscriptionError, useRunBatch } from "./useRunBatch";

import { getEnhancerService } from "~/services/enhancer";
import {
  createTaskId,
  type TaskId,
} from "~/store/zustand/ai-task/task-configs";
import { listenerStore } from "~/store/zustand/listener/instance";

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

  const summarize = useAudioBacklog((state) => state.summarize);
  const transcribe = useAudioBacklog((state) => state.transcribe);

  const pending = useQuery({
    enabled: running,
    queryKey: ["audio-backlog", summarize, transcribe],
    queryFn: () => listBacklog({ summarize, transcribe }),
    // Nothing emits an event when a transcript lands, and each item takes
    // minutes anyway, so polling costs nothing worth avoiding.
    refetchInterval: 5_000,
  });

  const next = pending.data?.find((item) => !failed.has(backlogItemKey(item)));

  // A live recording drives the same Swift transcriber this queue does. Running
  // both at once tripped a fatal assertion inside it and took the app down
  // mid-call, losing the recording. The batch waits; the call does not.
  const recording = useListener((state) => state.live.status !== "inactive");

  // The queue is not known until the first fetch lands. Reporting "finished"
  // off an undefined list would end every run the instant it started.
  useBacklogProgressToast(
    running && pending.isSuccess,
    Boolean(next),
    recording,
    transcribe ? "Transcribing recordings" : "Writing summaries",
  );

  if (!running || recording || !next) {
    return null;
  }

  return <ProcessOne key={backlogItemKey(next)} item={next} />;
}

/**
 * Keyed by kind as well as session, because one recording can appear in both
 * passes across a run — transcribed now, summarized later — and a failure in
 * one must not blacklist it from the other.
 */
function backlogItemKey(item: BacklogItem): string {
  return `${item.kind}:${item.sessionId}`;
}

/**
 * Below this, the language model is stopped before every transcription.
 *
 * Metal will only wire about 75% of unified memory — 11.84 GiB measured on a
 * 16 GB M1 — and Gemma 4 12B's weights plus its caches are most of that alone.
 * Leaving it resident through transcription exhausted that budget on exactly
 * such a machine: the command buffer returned
 * kIOGPUCommandBufferCallbackErrorOutOfMemory and the app aborted.
 *
 * Above it there is headroom for both, and keeping the model loaded saves a
 * cold 12B reload before every single summary. 32 GiB rather than 24 GiB
 * because the ceiling scales with total memory — 24 GiB wires only 18 GiB, and
 * that margin is too thin to bet a several-hundred-file run on.
 */
const KEEP_MODEL_RESIDENT_MIN_BYTES = 32 * 1024 * 1024 * 1024;

let modelMayStayResident: Promise<boolean> | undefined;

function canKeepModelResident(): Promise<boolean> {
  // Asked once per launch: total memory does not change, and this sits in the
  // path of every recording. Any failure answers "no" — the machines this
  // protects are the ones that crash when it is wrong.
  modelMayStayResident ??= localLlmCommands
    .recommendedModel()
    .then(
      (result) =>
        result.status === "ok" &&
        result.data.total_memory_bytes >= KEEP_MODEL_RESIDENT_MIN_BYTES,
    )
    .catch(() => false);
  return modelMayStayResident;
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

function useBacklogProgressToast(
  active: boolean,
  hasWork: boolean,
  paused: boolean,
  title: string,
) {
  const { total, done, failed, stop } = useAudioBacklog();

  useEffect(() => {
    if (!active) {
      return;
    }

    // Checked before "finished": a run held for a recording still has work, and
    // announcing completion here would stop it for good.
    if (paused) {
      sonnerToast.message("Recording — transcription paused", {
        id: BACKLOG_TOAST_ID,
        description: `${done} of ${total} · resumes when the recording ends`,
        duration: Infinity,
      });
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

    sonnerToast.message(title, {
      id: BACKLOG_TOAST_ID,
      description: `${done} of ${total} · this runs for hours`,
      duration: Infinity,
      action: {
        label: "Stop",
        onClick: () => {
          stop();
          // Stop means stop: this unmounts the worker, whose teardown cancels
          // the file being transcribed rather than leaving the GPU busy for
          // another ten minutes. Nothing is lost — the queue is derived from
          // the database, so that recording is simply still pending.
          // Replacing the toast here is what clears it — the effect above has
          // already returned by the time `running` is false.
          sonnerToast.message(`Stopped after ${done} of ${total}`, {
            id: BACKLOG_TOAST_ID,
            duration: 5_000,
          });
        },
      },
    });
  }, [active, hasWork, paused, title, done, total, failed, stop]);
}

/**
 * One item of work: a recording to transcribe, or a transcript to summarize.
 *
 * A hook-shaped component rather than a plain async loop because `useRunBatch`
 * needs the session and its participants, and both arrive through hooks keyed
 * on the session id. Keying this component on the item is what gives each one
 * its own instance of them.
 */
function ProcessOne({ item }: { item: BacklogItem }) {
  const { sessionId, kind } = item;
  const { aiTaskStore } = useRouteContext({ from: "__root__" });
  const runBatch = useRunBatch(sessionId);
  const recordDone = useAudioBacklog((state) => state.recordDone);
  const recordFailure = useAudioBacklog((state) => state.recordFailure);

  const runBatchRef = useRef(runBatch);
  runBatchRef.current = runBatch;

  useEffect(() => {
    let cancelled = false;

    const transcribe = async () => {
      const path = await fsSyncCommands.audioPath(sessionId);
      if (path.status === "error") {
        throw new Error(path.error);
      }

      // Transcription is MLX on the GPU; the language model is llama.cpp on
      // the same GPU. On a machine that cannot hold both, the model goes away
      // for the duration — see KEEP_MODEL_RESIDENT_MIN_BYTES for what happens
      // when it does not. On one that can, it stays, because stopping it means
      // reloading 12B from cold before the summary that follows.
      if (!(await canKeepModelResident())) {
        await localLlmCommands.stopServer();
      }

      await runBatchRef.current(path.data, {
        promotion: { scope: "whole_session" },
      });
    };

    const summarize = async () => {
      const started = await getEnhancerService()?.enhance(sessionId);
      if (started && "noteId" in started && aiTaskStore) {
        await waitForEnhance(aiTaskStore, started.noteId, () => cancelled);
      }
    };

    let settled = false;

    void (async () => {
      try {
        if (kind === "transcribe") {
          await transcribe();
        }

        // A summarize item is the recovery path: its recording already has a
        // transcript and an empty note, which is what put it in this queue.
        // A transcribe item only summarizes if the user asked for summaries,
        // read at use so changing that mid-run cannot restart this component.
        if (kind === "summarize" || useAudioBacklog.getState().summarize) {
          await summarize();
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
          kind,
          error,
        });
        if (!cancelled) {
          // Counted as done and skipped for the rest of this run: one
          // unreadable file must not stall the several hundred behind it.
          recordFailure(`${kind}:${sessionId}`);
        }
      } finally {
        settled = true;
      }
    })();

    return () => {
      cancelled = true;

      // Torn down with work still running — a call just started, or the shell
      // remounted. Marking it cancelled only skips the bookkeeping; the file is
      // still being transcribed on the GPU, which is precisely the collision
      // that took the app down mid-call. This actually stops it. The queue is
      // derived from the database, so the recording simply comes round again.
      if (!settled && kind === "transcribe") {
        void listenerStore.getState().stopTranscription(sessionId);
      }
    };
    // Deliberately not `item`: the queue query rebuilds those objects on every
    // five-second refetch, so depending on it re-ran this effect — and its
    // cleanup — every five seconds. The work restarted continuously and
    // recordDone never fired, because the run that would have called it had
    // already been cancelled. Progress froze while transcription carried on.
  }, [sessionId, kind, aiTaskStore, recordDone, recordFailure]);

  return null;
}

/**
 * Blocks until a queued summary has actually finished.
 *
 * `enhance` resolves once the task is queued, and the task store only flips to
 * "generating" after its own awaits — so for a moment the status is idle or
 * absent. Reading that as "finished" is what let the worker move on and stop
 * llama-server while the summary was still streaming, which surfaced as
 * "error sending request" against a port that no longer existed.
 *
 * So there are two waits: one for it to start, one for it to end. A summary
 * that never starts is not worth blocking a several-hundred-file run over, and
 * one that never ends must not block it forever either.
 *
 * The start wait is minutes, not seconds. Transcription kills llama-server
 * first to keep the two models off the GPU at once, so the summary that follows
 * has to load a 12B model from cold on a machine that has just finished
 * saturating the GPU. At sixty seconds this gave up before that load finished,
 * moved to the next recording, and killed the server it had just started — 116
 * summaries in one batch left an empty row and no text.
 */
const ENHANCE_START_TIMEOUT_MS = 5 * 60_000;
const ENHANCE_SETTLE_TIMEOUT_MS = 10 * 60_000;
const ENHANCE_POLL_MS = 500;

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
  const statusNow = () => aiTaskStore.getState().getState(taskId)?.status;
  const settled = (status: string | undefined) =>
    status === "success" || status === "error";

  const waitUntil = async (
    done: (status: string | undefined) => boolean,
    timeoutMs: number,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (!isCancelled() && Date.now() < deadline) {
      if (done(statusNow())) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, ENHANCE_POLL_MS));
    }
    return false;
  };

  const started = await waitUntil(
    (status) => status === "generating" || settled(status),
    ENHANCE_START_TIMEOUT_MS,
  );
  if (!started) {
    return;
  }

  await waitUntil(settled, ENHANCE_SETTLE_TIMEOUT_MS);
}
