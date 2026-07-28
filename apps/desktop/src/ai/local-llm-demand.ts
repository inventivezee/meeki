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

const claims = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Sticky for as long as the model stays up, deliberately. Engagement used to be
 * carried on the claim itself, but the chat-mode effect releases and re-claims
 * on every re-run, and sending clears the draft — so both the "typed" signal
 * and the ratchet were lost and the grace fell back to browsing.
 */
let engaged = false;

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function claimLocalLlm(reason: string, engagedClaim = true) {
  const release = () => releaseLocalLlm(reason);
  if (engagedClaim) {
    markLocalLlmEngaged();
  }
  if (claims.has(reason)) {
    return release;
  }
  claims.add(reason);
  emit();
  return release;
}

/** Typing or sending — anything that means the user actually wants an answer. */
export function markLocalLlmEngaged() {
  engaged = true;
}

/** Called once the server is actually stopped, so the next visit starts fresh. */
export function resetLocalLlmEngagement() {
  engaged = false;
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
  return engaged ? ENGAGED_GRACE_MS : BROWSING_GRACE_MS;
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
    engaged = false;
  },
};
