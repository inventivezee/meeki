import { commands as localLlmCommands } from "@meeki/plugin-local-llm";

import { createWarmupFetch } from "~/ai/local-llm-warmup";

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
  const warmupFetch = createWarmupFetch(baseFetch);

  return async (input, init) => {
    const origin = await liveOrigin(init?.signal);
    if (!origin) {
      return warmupFetch(input, init);
    }
    const target = retarget(input, origin);
    if (typeof input === "string" || input instanceof URL) {
      return warmupFetch(target, init);
    }
    return warmupFetch(new Request(target, input), init);
  };
}
