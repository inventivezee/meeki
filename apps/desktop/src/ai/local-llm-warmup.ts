import { useSyncExternalStore } from "react";

/**
 * With `--sleep-idle-seconds` on, llama-server unloads its weights when idle and
 * reloads them on the next request. `start_server` can't see that — the process
 * is still alive, so it returns instantly — which means the reload lands inside
 * an ordinary HTTP call with no response for several seconds. This tracks that
 * gap so the UI can say "warming up" instead of looking hung.
 */
export type WarmupState = {
  startedAt: number;
  estimateMs: number;
} | null;

/** Below this a slow request is just a slow request, not a reload. */
const WARMUP_SUSPICION_MS = 900;
const FALLBACK_ESTIMATE_SECONDS = 10;

let state: WarmupState = null;
let active = 0;
let estimateSeconds = FALLBACK_ESTIMATE_SECONDS;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

/** Set from the model catalog whenever the on-device selection changes. */
export function setWarmupEstimateSeconds(seconds: number | null | undefined) {
  estimateSeconds =
    seconds && seconds > 0 ? seconds : FALLBACK_ESTIMATE_SECONDS;
}

export function getWarmupState() {
  return state;
}

/**
 * How much longer the current reload is expected to take. Callers that bound a
 * request on a fixed timeout add this so a wake doesn't read as a stall.
 */
export function getWarmupGraceMs() {
  if (!state) {
    return 0;
  }
  return Math.max(0, state.estimateMs - (Date.now() - state.startedAt));
}

export function subscribeToWarmup(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocalLlmWarmup() {
  return useSyncExternalStore(subscribeToWarmup, getWarmupState, () => null);
}

function beginWarmup(startedAt: number) {
  // Enhance and title generation run concurrently against one server, and both
  // stall on the same reload. Keep the first request's clock so the second
  // doesn't restart the countdown, and refcount so whichever finishes first
  // doesn't clear the indicator out from under the other.
  active += 1;
  if (state) {
    return;
  }
  state = { startedAt, estimateMs: estimateSeconds * 1_000 };
  emit();
}

function endWarmup() {
  if (active > 0) {
    active -= 1;
  }
  if (active === 0 && state) {
    state = null;
    emit();
  }
}

/**
 * The initial weight load, which happens before any request is made. Without
 * this the UI looks idle for the whole boot and only starts explaining itself
 * once a request is already stalling.
 */
export function markWarmupStarted() {
  beginWarmup(Date.now());
}

export function markWarmupFinished() {
  endWarmup();
}

/**
 * Wraps the on-device transport. A request that hasn't produced response
 * headers within `WARMUP_SUSPICION_MS` is treated as a reload in progress;
 * headers arriving (or the request failing) ends it.
 */
export function createWarmupFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const startedAt = Date.now();
    let began = false;
    const timer = setTimeout(() => {
      began = true;
      beginWarmup(startedAt);
    }, WARMUP_SUSPICION_MS);

    try {
      return await baseFetch(input, init);
    } finally {
      clearTimeout(timer);
      if (began) {
        endWarmup();
      }
    }
  };
}

export const WARMUP_TEST_ONLY = {
  reset() {
    state = null;
    active = 0;
    estimateSeconds = FALLBACK_ESTIMATE_SECONDS;
    listeners.clear();
  },
  WARMUP_SUSPICION_MS,
  FALLBACK_ESTIMATE_SECONDS,
};
