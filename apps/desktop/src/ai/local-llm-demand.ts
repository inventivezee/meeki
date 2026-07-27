import { useSyncExternalStore } from "react";

/**
 * Tracks whether anything actually wants the local model right now.
 *
 * Starting llama-server at launch made the app slow to become usable and held
 * the weights for a whole session even if the user never asked for a summary.
 * Surfaces that need the model claim it; when the last claim is released the
 * server is free to be stopped.
 */
const claims = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function claimLocalLlm(reason: string) {
  if (claims.has(reason)) {
    return () => releaseLocalLlm(reason);
  }
  claims.add(reason);
  emit();
  return () => releaseLocalLlm(reason);
}

export function releaseLocalLlm(reason: string) {
  if (claims.delete(reason)) {
    emit();
  }
}

export function isLocalLlmWanted() {
  return claims.size > 0;
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
  },
};
