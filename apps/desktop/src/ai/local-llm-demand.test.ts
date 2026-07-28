import { afterEach, describe, expect, it } from "vitest";

import {
  BROWSING_GRACE_MS,
  claimLocalLlm,
  ENGAGED_GRACE_MS,
  getLocalLlmGraceMs,
  isLocalLlmWanted,
  LOCAL_LLM_DEMAND_TEST_ONLY,
  markLocalLlmEngaged,
  resetLocalLlmEngagement,
} from "./local-llm-demand";

afterEach(() => {
  LOCAL_LLM_DEMAND_TEST_ONLY.reset();
});

describe("local llm demand", () => {
  it("tracks whether anything wants the model", () => {
    expect(isLocalLlmWanted()).toBe(false);
    const release = claimLocalLlm("chat", false);
    expect(isLocalLlmWanted()).toBe(true);
    release();
    expect(isLocalLlmWanted()).toBe(false);
  });

  it("gives an untouched chat panel only the short grace", () => {
    claimLocalLlm("chat", false);
    expect(getLocalLlmGraceMs()).toBe(BROWSING_GRACE_MS);
  });

  it("extends the grace once the user starts typing", () => {
    claimLocalLlm("chat", false);
    markLocalLlmEngaged();
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });

  it("keeps the long grace after sending clears the draft", () => {
    claimLocalLlm("chat", false);
    markLocalLlmEngaged();
    // Sending empties the composer, so the "typed" signal stops firing.
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });

  it("survives the chat claim being released and retaken", () => {
    const release = claimLocalLlm("chat", false);
    markLocalLlmEngaged();
    // The chat-mode effect re-runs and re-claims; this used to reset the grace.
    release();
    claimLocalLlm("chat", false);
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });

  it("starts fresh once the server has actually been stopped", () => {
    claimLocalLlm("chat", false);
    markLocalLlmEngaged();
    resetLocalLlmEngagement();
    claimLocalLlm("chat", false);
    expect(getLocalLlmGraceMs()).toBe(BROWSING_GRACE_MS);
  });

  it("treats a summary run as engagement", () => {
    claimLocalLlm("ai-task:1");
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });
});
