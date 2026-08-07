import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import {
  CheckIcon,
  HelpCircleIcon,
  Loader2,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
  type ModelInfo,
} from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meeki/ui/components/ui/dialog";
import { sonnerToast } from "@meeki/ui/components/ui/toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@meeki/ui/components/ui/tooltip";
import { cn } from "@meeki/utils";

import {
  fitsInMemory,
  formatGb,
  formatMemoryGb,
} from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";

const DOWNLOADED_QUERY_KEY = ["local-llm-downloaded"] as const;

/**
 * Blocks until the weights are on disk, the transfer stops, or an hour passes.
 *
 * A paused transfer resolves rather than throwing: the bytes are kept for a
 * Range resume, so it is not a failure to report. Shared by both settings rows.
 */
export async function waitUntilDownloaded(model: GgufLlmModel) {
  for (let attempt = 0; attempt < 60 * 60; attempt += 1) {
    const done = await localLlmCommands.isModelDownloaded(model);
    if (done.status === "ok" && done.data) {
      return;
    }
    const running = await localLlmCommands.isModelDownloading(model);
    if (running.status === "ok" && !running.data) {
      const paused = await localLlmCommands.pausedBytes(model);
      if (paused.status === "ok" && paused.data > 0) {
        return;
      }
      throw new Error("The download stopped before the model finished.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out waiting for the download to finish.");
}

async function activate(model: GgufLlmModel) {
  const started = await localLlmCommands.startServer(model);
  if (started.status === "error") {
    throw new Error(started.error);
  }
  await setAiProvider("llm", "on_device", {
    base_url: started.data,
    api_key: "local",
  });
  await setSettingValues({
    current_llm_provider: "on_device",
    current_llm_model: model,
  });
}

/**
 * Everything the user needs to judge a model without leaving the app: what it
 * is good at, what it costs to fetch, and whether this Mac can actually hold
 * it. The trigger turns amber when it cannot, which is how a frontier model
 * explains itself rather than just looking arbitrarily absent.
 */
function ModelHelp({
  model,
  fits,
  totalMemoryBytes,
}: {
  model: ModelInfo;
  fits: boolean;
  totalMemoryBytes: number;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${model.name}`}
          className={cn([
            "shrink-0 rounded-full transition-colors",
            fits
              ? "text-muted-foreground hover:text-foreground"
              : "text-amber-700 hover:text-amber-900",
          ])}
        >
          {fits ? (
            <HelpCircleIcon className="size-3.5" />
          ) : (
            <TriangleAlertIcon className="size-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex flex-col gap-1.5">
          <p className="leading-relaxed">{model.description}</p>
          <p className="text-[11px] opacity-80">
            {formatGb(model.size_bytes)} GB download ·{" "}
            {formatMemoryGb(model.min_memory_bytes)} GB memory recommended
          </p>
          {fits ? null : (
            <p className="text-[11px] leading-relaxed">
              This Mac has {formatMemoryGb(totalMemoryBytes)} GB. Running it
              would exceed what Metal can allocate, so it would swap heavily or
              fail to load.
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function LocalModels() {
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<GgufLlmModel | null>(null);
  const [confirming, setConfirming] = useState<ModelInfo | null>(null);
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ] as const);

  const supported = useQuery({
    queryKey: ["local-llm-supported"],
    queryFn: async () => {
      const result = await localLlmCommands.listSupportedModel();
      return result.status === "ok" ? result.data : [];
    },
    staleTime: Infinity,
  });

  const recommended = useQuery({
    queryKey: ["local-llm-recommended"],
    queryFn: async () => {
      const result = await localLlmCommands.recommendedModel();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: Infinity,
  });

  const downloaded = useQuery({
    queryKey: DOWNLOADED_QUERY_KEY,
    queryFn: async () => {
      const result = await localLlmCommands.listDownloadedModel();
      return result.status === "ok" ? result.data : [];
    },
    refetchInterval: 2_000,
  });

  const download = useMutation({
    mutationFn: async (model: ModelInfo) => {
      setDownloading(model.key);
      const channel = new Channel<number>();
      channel.onmessage = (value) => {
        if (value >= 0) {
          sonnerToast.message(`Downloading ${model.name}`, {
            id: `local-llm-${model.key}`,
            description: `${Math.round(value)}%`,
          });
        }
      };
      const result = await localLlmCommands.downloadModel(model.key, channel);
      if (result.status === "error") {
        throw new Error(result.error);
      }

      // downloadModel resolves once the transfer is queued, not when it lands.
      // Returning here claimed success at 0% — a green "downloaded" toast that
      // the next progress tick overwrote with "Downloading… 0%", and a row that
      // went back to offering Download for the whole multi-gigabyte transfer.
      await waitUntilDownloaded(model.key);
    },
    onSuccess: async (_data, model) => {
      await queryClient.invalidateQueries({ queryKey: DOWNLOADED_QUERY_KEY });
      sonnerToast.success(`${model.name} downloaded`, {
        id: `local-llm-${model.key}`,
        description: "Select Enable to start using it.",
      });
    },
    onError: (error, model) => {
      sonnerToast.error(`Couldn't download ${model.name}`, {
        id: `local-llm-${model.key}`,
        description: error instanceof Error ? error.message : String(error),
      });
    },
    onSettled: () => setDownloading(null),
  });

  const enable = useMutation({
    mutationFn: (model: ModelInfo) => activate(model.key),
    onSuccess: (_data, model) =>
      sonnerToast.success(`${model.name} is ready`, {
        id: `local-llm-${model.key}`,
      }),
    onError: (error, model) =>
      sonnerToast.error(`Couldn't start ${model.name}`, {
        id: `local-llm-${model.key}`,
        description: error instanceof Error ? error.message : String(error),
      }),
  });

  const models = supported.data ?? [];
  if (models.length === 0) {
    return null;
  }

  const totalMemoryBytes = recommended.data?.total_memory_bytes ?? 0;
  const busy = downloading !== null || enable.isPending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-md font-sans font-semibold">Local &amp; Private</h3>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Runs on this Mac with the bundled llama.cpp runtime. Nothing leaves
          the device.
        </p>
      </div>

      <div className="border-border/60 bg-card/70 divide-border/60 flex flex-col divide-y rounded-2xl border">
        {models.map((model) => {
          const isDownloaded = downloaded.data?.includes(model.key) ?? false;
          // Selected is not the same as present. Config keeps pointing at a
          // model whose weights are missing — never fetched, or deleted — and
          // the row answered "In use" while the setup card above it was still
          // downloading that very model.
          const isActive =
            isDownloaded &&
            current_llm_provider === "on_device" &&
            current_llm_model === model.key;
          const fits = fitsInMemory(model, totalMemoryBytes);

          return (
            <div
              key={model.key}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{model.name}</p>
                  <ModelHelp
                    model={model}
                    fits={fits}
                    totalMemoryBytes={totalMemoryBytes}
                  />
                </div>
                <p
                  className={cn([
                    "text-[11px]",
                    fits ? "text-muted-foreground" : "text-amber-700",
                  ])}
                >
                  {formatGb(model.size_bytes)} GB ·{" "}
                  {formatMemoryGb(model.min_memory_bytes)} GB RAM
                </p>
              </div>

              {isActive ? (
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                  <CheckIcon className="size-3.5" />
                  In use
                </span>
              ) : isDownloaded ? (
                <Button
                  size="sm"
                  className="h-7 shrink-0 px-3 text-xs"
                  disabled={busy}
                  onClick={() => enable.mutate(model)}
                >
                  Enable
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-3 text-xs"
                  disabled={busy}
                  onClick={() =>
                    fits ? download.mutate(model) : setConfirming(model)
                  }
                >
                  {downloading === model.key ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Download"
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => (open ? null : setConfirming(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming?.name} needs more memory than this Mac has
            </DialogTitle>
            <DialogDescription className="flex flex-col gap-2 pt-1 text-left">
              <span>
                It wants about{" "}
                {confirming ? formatMemoryGb(confirming.min_memory_bytes) : 0}{" "}
                GB and this Mac has {formatMemoryGb(totalMemoryBytes)} GB, so it
                will swap heavily or fail to load.
              </span>
              <span>{confirming?.description}</span>
              <span>
                The download is{" "}
                {confirming ? formatGb(confirming.size_bytes) : 0} GB. You can
                proceed anyway.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (confirming) {
                  download.mutate(confirming);
                }
                setConfirming(null);
              }}
            >
              Download anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
