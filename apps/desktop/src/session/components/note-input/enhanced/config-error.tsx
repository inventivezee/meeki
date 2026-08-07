import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";

import { commands as localLlmCommands } from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { useNotifications } from "~/contexts/notifications";
import { formatGb } from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";
import { useTabs } from "~/store/zustand/tabs";

/**
 * Summaries need a model, and there are exactly two honest ways to get one:
 * download one that runs here, or point at a provider you already pay for.
 *
 * This used to offer a Pro trial, which opened a settings pane that is no
 * longer in the nav and depended on a hosted API that does not resolve.
 * Offering a purchase the app cannot complete is worse than offering nothing.
 */
export function ConfigError() {
  const openNew = useTabs((state) => state.openNew);
  const { activeDownloads } = useNotifications();

  const recommended = useQuery({
    queryKey: ["local-llm-recommended"],
    staleTime: Infinity,
    queryFn: async () => {
      const result = await localLlmCommands.recommendedModel();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  // Already sized to this Mac's memory by recommended_model_for_memory, so the
  // one-click option cannot offer a model the machine is unable to run.
  const model = recommended.data?.model ?? null;
  const downloading = model
    ? (activeDownloads.find((entry) => entry.model === model.key) ?? null)
    : null;

  // Reaching this card says nothing about whether the weights are here. Every
  // reason that renders it — no provider, no model, blank API key — is
  // satisfied by a complete model that was simply never selected, which is the
  // ordinary outcome of downloading one in Settings and not clicking Enable.
  // Offering to fetch 13.6 GB in that state is the wrong thing to offer.
  const alreadyOnDisk = useQuery({
    enabled: !!model,
    queryKey: ["local-llm-downloaded", model?.key ?? null],
    refetchInterval: 2_000,
    queryFn: async () => {
      if (!model) return false;
      const result = await localLlmCommands.isModelDownloaded(model.key);
      return result.status === "ok" && result.data;
    },
  });

  const download = useMutation({
    mutationFn: async () => {
      if (!model) {
        throw new Error("No local model fits this Mac.");
      }

      if (alreadyOnDisk.data) {
        const started = await localLlmCommands.startServer(model.key);
        if (started.status === "error") {
          throw new Error(started.error);
        }
        await setAiProvider("llm", "on_device", {
          base_url: started.data,
          api_key: "local",
        });
        await setSettingValues({
          current_llm_provider: "on_device",
          current_llm_model: model.key,
        });
        return;
      }

      const result = await localLlmCommands.downloadModel(
        model.key,
        new Channel<number>(),
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
      // Settings owns progress, pause and selecting the model once it lands,
      // so send the user where the download is actually visible.
      openNew({ type: "settings", state: { tab: "intelligence" } });
    },
    onError: (error) => {
      sonnerToast.error("Couldn’t start the download", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  return (
    <div
      role="alert"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6"
    >
      <div className="mb-6 flex max-w-md flex-col gap-2 text-center">
        <p className="text-base font-medium">
          <Trans>Set up AI summaries</Trans>
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Trans>
            Summaries need a language model. Download one that runs on this Mac,
            or connect a provider you already use.
          </Trans>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="shadow-none"
          disabled={!model || download.isPending || downloading !== null}
          onClick={() => download.mutate()}
        >
          {downloading ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <Trans>Downloading… {downloading.progress}%</Trans>
            </>
          ) : model && alreadyOnDisk.data ? (
            <Trans>Use {model.name}</Trans>
          ) : model ? (
            <Trans>
              Download {model.name} ({formatGb(model.size_bytes)} GB)
            </Trans>
          ) : (
            <Trans>Download a local model</Trans>
          )}
        </Button>
        <Button
          variant="outline"
          className="shadow-none"
          onClick={() =>
            openNew({ type: "settings", state: { tab: "intelligence" } })
          }
        >
          <Trans>Use an API key</Trans>
        </Button>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        <Trans>The local model runs entirely on this Mac.</Trans>
      </p>
    </div>
  );
}
