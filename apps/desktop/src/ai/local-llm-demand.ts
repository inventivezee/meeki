import { useSyncExternalStore } from "react";

/**
 * Tracks whether anything actually wants the local model right now.
 *
 * Starting llama-server at launch made the app slow to become usable and held
 * the weights for a whole session even if the user never asked for a summary.
 * Surfaces that need the model claim it; when the last claim is released the
 * server is free to be stopped — after the grace period the claim asked for.
 * Merely opening chat buys a short one, because glancing at a note and moving
 * on shouldn't hold several GB; typing buys the long one, because someone
 * mid-sentence is very likely about to send.
 */
export const BROWSING_GRACE_MS = 60_000;
export const ENGAGED_GRACE_MS = 5 * 60_000;

const claims = new Map<string, number>();
const listeners = new Set<() => void>();

/** Peak grace across the claims held during the current run of demand. */
let graceMs = ENGAGED_GRACE_MS;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function claimLocalLlm(
  reason: string,
  claimGraceMs: number = ENGAGED_GRACE_MS,
) {
  const release = () => releaseLocalLlm(reason);
  if (claims.get(reason) === claimGraceMs) {
    return release;
  }
  const wasEmpty = claims.size === 0;
  claims.set(reason, claimGraceMs);
  // Recompute from the live set on the first claim so a previous run's long
  // grace doesn't leak into this one; afterwards only ever ratchet up.
  graceMs = wasEmpty
    ? claimGraceMs
    : Math.max(...Array.from(claims.values()), graceMs);
  emit();
  return release;
}

export function releaseLocalLlm(reason: string) {
  if (claims.delete(reason)) {
    emit();
  }
}

export function isLocalLlmWanted() {
  return claims.size > 0;
}

/** Grace to honour once the last claim drops. Read when the timer is armed. */
export function getLocalLlmGraceMs() {
  return graceMs;
}

export function useLocalLlmWanted() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isLocalLlmWanted,
    () => false,
  );
}

export const LOCAL_LLM_DEMAND_TEST_ONLY = {
  reset() {
    claims.clear();
    listeners.clear();
    graceMs = ENGAGED_GRACE_MS;
  },
};
