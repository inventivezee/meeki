import { beforeEach, describe, expect, it } from "vitest";

import {
  getWarmupGraceMs,
  getWarmupState,
  markWarmupFinished,
  markWarmupStarted,
  setWarmupEstimateSeconds,
  WARMUP_TEST_ONLY,
} from "./local-llm-warmup";

const { FALLBACK_ESTIMATE_SECONDS } = WARMUP_TEST_ONLY;

describe("local llm warmup", () => {
  beforeEach(() => {
    WARMUP_TEST_ONLY.reset();
  });

  it("stays idle until something says the server is not ready", () => {
    expect(getWarmupState()).toBeNull();
  });

  it("reports warming while the server is still loading its weights", () => {
    markWarmupStarted();
    expect(getWarmupState()).not.toBeNull();
    markWarmupFinished();
    expect(getWarmupState()).toBeNull();
  });

  it("keeps one clock when two callers wait on the same load", () => {
    markWarmupStarted();
    const first = getWarmupState();
    markWarmupStarted();
    expect(getWarmupState()).toBe(first);

    // Refcounted: the first finisher must not clear it under the second.
    markWarmupFinished();
    expect(getWarmupState()).not.toBeNull();
    markWarmupFinished();
    expect(getWarmupState()).toBeNull();
  });

  it("paces the countdown from the model's own estimate", () => {
    setWarmupEstimateSeconds(30);
    markWarmupStarted();
    expect(getWarmupGraceMs()).toBeGreaterThan(0);
    expect(getWarmupGraceMs()).toBeLessThanOrEqual(30_000);
    markWarmupFinished();
    expect(getWarmupGraceMs()).toBe(0);
  });

  it("falls back to a generic estimate for an unknown model", () => {
    setWarmupEstimateSeconds(null);
    markWarmupStarted();
    expect(getWarmupGraceMs()).toBeLessThanOrEqual(
      FALLBACK_ESTIMATE_SECONDS * 1_000,
    );
  });
});
