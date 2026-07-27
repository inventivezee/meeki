import { afterEach, describe, expect, it } from "vitest";

import {
  BROWSING_GRACE_MS,
  claimLocalLlm,
  ENGAGED_GRACE_MS,
  getLocalLlmGraceMs,
  isLocalLlmWanted,
  LOCAL_LLM_DEMAND_TEST_ONLY,
} from "./local-llm-demand";

afterEach(() => {
  LOCAL_LLM_DEMAND_TEST_ONLY.reset();
});

describe("local llm demand", () => {
  it("tracks whether anything wants the model", () => {
    expect(isLocalLlmWanted()).toBe(false);
    const release = claimLocalLlm("chat", BROWSING_GRACE_MS);
    expect(isLocalLlmWanted()).toBe(true);
    release();
    expect(isLocalLlmWanted()).toBe(false);
  });

  it("gives an untouched chat panel only the short grace", () => {
    claimLocalLlm("chat", BROWSING_GRACE_MS);
    expect(getLocalLlmGraceMs()).toBe(BROWSING_GRACE_MS);
  });

  it("extends the grace once the user starts typing", () => {
    const release = claimLocalLlm("chat", BROWSING_GRACE_MS);
    claimLocalLlm("chat", ENGAGED_GRACE_MS);
    release();
    expect(isLocalLlmWanted()).toBe(false);
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });

  it("does not shorten the grace when the draft is cleared again", () => {
    claimLocalLlm("chat", ENGAGED_GRACE_MS);
    claimLocalLlm("chat", BROWSING_GRACE_MS);
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });

  it("does not carry a previous run's long grace into the next one", () => {
    const release = claimLocalLlm("chat", ENGAGED_GRACE_MS);
    release();
    claimLocalLlm("chat", BROWSING_GRACE_MS);
    expect(getLocalLlmGraceMs()).toBe(BROWSING_GRACE_MS);
  });

  it("keeps the longest grace while several surfaces hold claims", () => {
    claimLocalLlm("chat", BROWSING_GRACE_MS);
    claimLocalLlm("ai-task:1", ENGAGED_GRACE_MS);
    expect(getLocalLlmGraceMs()).toBe(ENGAGED_GRACE_MS);
  });
});
