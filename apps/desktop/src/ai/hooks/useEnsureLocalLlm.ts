import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";

import { startLocalLlmServer } from "~/ai/local-llm-context";
import {
  getLocalLlmGraceMs,
  resetLocalLlmEngagement,
  useLocalLlmWanted,
} from "~/ai/local-llm-demand";
import { setWarmupEstimateSeconds } from "~/ai/local-llm-warmup";
import { getStoredAiProvider, setAiProvider } from "~/settings/providers";
import { getStoredSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

/**
 * Keeps the local llama-server running when On device is selected.
 *
 * With `save_memory` on (the default) the server is only started once
 * something actually wants it — opening chat, or running a summary. Starting
 * it at launch delayed the first paint and held several GB for a session the
 * user might never ask anything of.
 */
export function useEnsureLocalLlm() {
  const { current_llm_provider, current_llm_model, save_memory } =
    useConfigValues([
      "current_llm_provider",
      "current_llm_model",
      "save_memory",
    ] as const);
  const wanted = useLocalLlmWanted();

  const selected =
    current_llm_provider === "on_device" && Boolean(current_llm_model);
  const enabled = selected && (save_memory === false || wanted);

  // Shares the catalog cache with the settings cards; only used to pace the
  // warm-up indicator, so a miss just falls back to a generic estimate.
  const supported = useQuery({
    enabled,
    queryKey: ["local-llm-supported"],
    queryFn: async () => {
      const result = await localLlmCommands.listSupportedModel();
      return result.status === "ok" ? result.data : [];
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const match = supported.data?.find(
      (model) => model.key === current_llm_model,
    );
    setWarmupEstimateSeconds(match?.warmup_seconds);
  }, [supported.data, current_llm_model]);

  const server = useQuery({
    enabled,
    queryKey: ["local-llm-server", current_llm_model],
    refetchInterval: 5_000,
    queryFn: async () => {
      const model = current_llm_model as GgufLlmModel;
      // start_server reuses a live server for the same model, so this doubles
      // as the liveness check. The first call loads the weights, which is the
      // long wait the user sees if they send a message straight away.
      // Deliberately does not touch the warm-up indicator: this query polls
      // every 5s, so toggling here flashed it on and off, and it cleared as
      // soon as the process was up while prefill was still running. The fetch
      // path owns the indicator instead, because it knows when the server is
      // actually answering.
      const started = await startLocalLlmServer(model);
      if (started.status === "error") {
        throw new Error(started.error);
      }
      const url = started.data;

      // Loading weights can take a while; the user may have moved to a cloud
      // provider in the meantime.
      const { values } = await getStoredSettingValues();
      if (
        values.current_llm_provider !== "on_device" ||
        values.current_llm_model !== model
      ) {
        await localLlmCommands.stopServer();
        return null;
      }

      const stored = await getStoredAiProvider("llm", "on_device");
      if (stored?.base_url !== url) {
        await setAiProvider("llm", "on_device", {
          base_url: url,
          api_key: "local",
        });
      }

      return url;
    },
  });

  useEffect(() => {
    if (server.error) {
      console.warn("[local-llm] failed to ensure server", server.error);
    }
  }, [server.error]);

  // Nothing wants the model any more: shut the server down rather than leave
  // it resident. The weights would eventually unload on their own via
  // --sleep-idle-seconds, but the process would keep its port and mapping.
  useEffect(() => {
    if (!selected || save_memory === false || wanted) {
      return;
    }

    const timer = setTimeout(() => {
      void localLlmCommands.stopServer();
      // The next visit starts as browsing again, not carrying this session's
      // engagement into a model the user may never ask anything of.
      resetLocalLlmEngagement();
    }, getLocalLlmGraceMs());
    return () => clearTimeout(timer);
  }, [selected, save_memory, wanted]);
}
