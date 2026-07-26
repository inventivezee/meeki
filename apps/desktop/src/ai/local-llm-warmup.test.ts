import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createWarmupFetch,
  getWarmupGraceMs,
  getWarmupState,
  setWarmupEstimateSeconds,
  WARMUP_TEST_ONLY,
} from "./local-llm-warmup";

const { WARMUP_SUSPICION_MS, FALLBACK_ESTIMATE_SECONDS } = WARMUP_TEST_ONLY;

describe("local llm warmup", () => {
  beforeEach(() => {
    WARMUP_TEST_ONLY.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays idle when the response arrives promptly", async () => {
    const fetchImpl = createWarmupFetch(
      vi.fn(async () => new Response("ok")) as unknown as typeof fetch,
    );

    const pending = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS - 100);
    expect(getWarmupState()).toBeNull();

    await pending;
    expect(getWarmupState()).toBeNull();
  });

  it("reports warming once a request stalls past the suspicion window", async () => {
    let release: (value: Response) => void = () => {};
    const fetchImpl = createWarmupFetch(
      vi.fn(
        () => new Promise<Response>((resolve) => (release = resolve)),
      ) as unknown as typeof fetch,
    );

    const pending = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS + 10);

    expect(getWarmupState()).not.toBeNull();
    expect(getWarmupState()?.estimateMs).toBe(FALLBACK_ESTIMATE_SECONDS * 1000);

    release(new Response("ok"));
    await pending;
    expect(getWarmupState()).toBeNull();
  });

  it("clears the warming state when the request fails", async () => {
    const fetchImpl = createWarmupFetch(
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error("boom")),
              WARMUP_SUSPICION_MS * 3,
            ),
          ),
      ) as unknown as typeof fetch,
    );

    // Assert before advancing timers, or the rejection lands with no handler
    // attached and surfaces as an unhandled rejection.
    const settled = expect(
      fetchImpl("http://127.0.0.1:1/v1/chat/completions"),
    ).rejects.toThrow("boom");

    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS + 10);
    expect(getWarmupState()).not.toBeNull();

    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS * 3);
    await settled;
    expect(getWarmupState()).toBeNull();
  });

  it("paces the estimate from the selected model", async () => {
    setWarmupEstimateSeconds(16);
    let release: (value: Response) => void = () => {};
    const fetchImpl = createWarmupFetch(
      vi.fn(
        () => new Promise<Response>((resolve) => (release = resolve)),
      ) as unknown as typeof fetch,
    );

    const pending = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS + 10);

    expect(getWarmupState()?.estimateMs).toBe(16_000);

    release(new Response("ok"));
    await pending;
  });

  it("falls back when the catalog has no estimate", () => {
    setWarmupEstimateSeconds(undefined);
    expect(getWarmupGraceMs()).toBe(0);
  });

  it("keeps the first clock when a second request stalls on the same reload", async () => {
    setWarmupEstimateSeconds(10);
    const releases: ((value: Response) => void)[] = [];
    const fetchImpl = createWarmupFetch(
      vi.fn(
        () => new Promise<Response>((resolve) => releases.push(resolve)),
      ) as unknown as typeof fetch,
    );

    const first = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS + 10);
    const startedAt = getWarmupState()?.startedAt;

    const second = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(WARMUP_SUSPICION_MS + 10);

    expect(getWarmupState()?.startedAt).toBe(startedAt);

    releases.forEach((release) => release(new Response("ok")));
    await Promise.all([first, second]);
    expect(getWarmupState()).toBeNull();
  });

  it("grace shrinks as the reload progresses and never goes negative", async () => {
    setWarmupEstimateSeconds(10);
    let release: (value: Response) => void = () => {};
    const fetchImpl = createWarmupFetch(
      vi.fn(
        () => new Promise<Response>((resolve) => (release = resolve)),
      ) as unknown as typeof fetch,
    );

    const pending = fetchImpl("http://127.0.0.1:1/v1/chat/completions");
    await vi.advanceTimersByTimeAsync(1_000);
    const early = getWarmupGraceMs();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThanOrEqual(10_000);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(getWarmupGraceMs()).toBe(0);

    release(new Response("ok"));
    await pending;
  });
});
