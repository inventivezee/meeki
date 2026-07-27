import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";

import { setWarmupEstimateSeconds } from "~/ai/local-llm-warmup";
import { getStoredAiProvider, setAiProvider } from "~/settings/providers";
import { getStoredSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

/** Keep the local llama-server running when On device is selected. */
export function useEnsureLocalLlm() {
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ] as const);

  const enabled =
    current_llm_provider === "on_device" && Boolean(current_llm_model);

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
      // as the liveness check.
      const started = await localLlmCommands.startServer(model);
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
}
