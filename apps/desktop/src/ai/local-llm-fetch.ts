import { commands as localLlmCommands } from "@meeki/plugin-local-llm";

import { markWarmupFinished, markWarmupStarted } from "~/ai/local-llm-warmup";

/**
 * llama-server binds an ephemeral port, so the persisted base_url is only valid
 * for the lifetime of one server process. On launch it still holds the previous
 * run's port, and the first message goes out before the ensure loop has written
 * the new one — which surfaced as "error sending request for url" against a
 * dead port.
 *
 * Rather than race the settings write, retarget the request at send time: Rust
 * only reports a url once the server has passed its health check, so asking it
 * is the one source of truth that cannot be stale.
 */
const READY_POLL_MS = 500;

/**
 * llama-server unloads its weights after `--sleep-idle-seconds` and reloads
 * them on the next request. There is no way to ask whether they are resident:
 * /health answers `{"status":"ok"}` identically asleep and awake, and every
 * endpoint that would reveal the difference wakes the server (measured — a
 * single /health probe produced "exiting sleeping state" in the server log).
 *
 * So derive it instead. We know the timeout and we know when we last got a
 * response, which is enough to know the next request has to pay for a reload.
 */
let sleepIdleMs: number | null = null;
let lastResponseAt = 0;

async function willWakeTheServer() {
  if (sleepIdleMs === null) {
    const configured = await localLlmCommands.sleepIdleSeconds();
    sleepIdleMs =
      configured.status === "ok" && configured.data > 0
        ? configured.data * 1_000
        : 0;
  }
  if (!sleepIdleMs || !lastResponseAt) {
    return false;
  }
  return Date.now() - lastResponseAt >= sleepIdleMs;
}

async function liveOrigin(signal?: AbortSignal | null): Promise<string | null> {
  for (;;) {
    if (signal?.aborted) {
      return null;
    }
    const result = await localLlmCommands.serverUrl();
    if (result.status === "ok" && result.data) {
      try {
        return new URL(result.data).origin;
      } catch {
        return null;
      }
    }
    // The ensure loop is starting it; wait rather than fail the send. The
    // warm-up indicator is already showing by this point.
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
}

function retarget(input: RequestInfo | URL, origin: string) {
  const href =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  try {
    const url = new URL(href);
    url.protocol = new URL(origin).protocol;
    url.host = new URL(origin).host;
    return url.toString();
  } catch {
    return href;
  }
}

export function createLocalLlmFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    // Hold the indicator for exactly the wait for a ready server, and never
    // infer one from request latency: prefill of a long note takes ~13s, which
    // is indistinguishable from a reload by timing alone. Guessing made the UI
    // flip from "Loading" to "Answering" and back mid-request.
    const ready = await localLlmCommands.serverUrl();
    // Either the server is not up yet, or it has been idle long enough that
    // this request will reload the weights. Both are a wait for the model, not
    // for an answer, so the indicator covers both — and nothing here infers a
    // reload from how long a request happens to take.
    let warming = ready.status !== "ok" || !ready.data;
    if (!warming) {
      warming = await willWakeTheServer();
    }
    if (warming) {
      markWarmupStarted();
    }

    try {
      const origin = await liveOrigin(init?.signal);
      const response = await (origin === null
        ? baseFetch(input, init)
        : typeof input === "string" || input instanceof URL
          ? baseFetch(retarget(input, origin), init)
          : baseFetch(new Request(retarget(input, origin), input), init));
      lastResponseAt = Date.now();
      return response;
    } finally {
      if (warming) {
        markWarmupFinished();
      }
    }
  };
}
