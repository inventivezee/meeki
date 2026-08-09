import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { Loader2, PauseIcon, PlayIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";
import { cn } from "@meeki/utils";

import { OtherLocalModels } from "./other-models";

import { startLocalLlmServer } from "~/ai/local-llm-context";
import { useNotifications } from "~/contexts/notifications";
import {
  formatGb,
  formatMemoryGb,
  ModelFacts,
} from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";

export const DEFAULT_ON_DEVICE_LLM_MODEL =
  "gemma-4-26b-a4b" as const satisfies GgufLlmModel;

const DOWNLOADED_QUERY_KEY = ["local-llm-downloaded"] as const;

type DownloadPhase = "idle" | "downloading" | "starting";

async function activateOnDeviceLlm(model: GgufLlmModel) {
  const started = await startLocalLlmServer(model);
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
  return started.data;
}

export function OnDeviceLlmCard() {
  const queryClient = useQueryClient();
  const { downloadsFor } = useNotifications();
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  // null means "in progress but this mount doesn't own the progress channel".
  const [progress, setProgress] = useState<number | null>(null);
  const [pendingActivation, setPendingActivation] = useState(false);
  const cancelledRef = useRef(false);
  const activatingRef = useRef(false);
  const failureReportedRef = useRef(false);

  // Sized to this Mac's memory: a 16 GB machine can't hold the 35B weights
  // alongside the STT models and macOS.
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

  const defaultModel = recommended.data?.model ?? null;
  const totalMemoryBytes = recommended.data?.total_memory_bytes ?? 0;
  const modelKey = defaultModel?.key ?? "none";
  // Falls back to the app-wide stream when this mount has no channel of its own
  // — a download started from the setup card, or before this tab was opened.
  // Without it `progress` stayed null and the bar rendered full-width and
  // pulsing, which reads as "nearly done" at 6%.
  const sharedProgress = downloadsFor(
    defaultModel ? [defaultModel.key] : [],
  ).current;
  const shownProgress = progress ?? sharedProgress?.progress ?? null;
  const isPaused = sharedProgress?.paused === true;
  const modelName = defaultModel?.name ?? "the on-device model";

  const downloaded = useQuery({
    queryKey: DOWNLOADED_QUERY_KEY,
    queryFn: async () => {
      const result = await localLlmCommands.listDownloadedModel();
      return result.status === "ok" ? result.data : [];
    },
    refetchInterval: 2_000,
  });

  const isDownloaded = Boolean(
    defaultModel && downloaded.data?.includes(defaultModel.key),
  );

  const downloadingQueryKey = ["local-llm-downloading", modelKey] as const;

  const downloading = useQuery({
    enabled: Boolean(defaultModel),
    queryKey: downloadingQueryKey,
    queryFn: async () => {
      const result = await localLlmCommands.isModelDownloading(
        defaultModel!.key,
      );
      return result.status === "ok" ? result.data : false;
    },
    refetchInterval: isDownloaded && phase === "idle" ? false : 1_000,
  });

  const resetDownloadState = useCallback(() => {
    // The poll is up to a second stale; clear it so the derived UI below can't
    // bounce back into a download that already ended.
    queryClient.setQueryData(["local-llm-downloading", modelKey], false);
    setPhase("idle");
    setProgress(null);
    setPendingActivation(false);
  }, [queryClient, modelKey]);

  const reportDownloadFailure = useCallback(
    (description: string) => {
      if (!failureReportedRef.current) {
        failureReportedRef.current = true;
        sonnerToast.error(`Couldn’t download ${modelName}`, {
          id: "local-llm-download",
          description,
        });
      }
      resetDownloadState();
    },
    [modelName, resetDownloadState],
  );

  const finishDownload = useCallback(
    async (model: GgufLlmModel) => {
      if (cancelledRef.current || activatingRef.current) {
        return;
      }
      activatingRef.current = true;
      setPhase("starting");
      setProgress(100);
      try {
        await activateOnDeviceLlm(model);
        await queryClient.invalidateQueries({ queryKey: DOWNLOADED_QUERY_KEY });
        if (!cancelledRef.current) {
          sonnerToast.success(`${modelName} is ready`, {
            id: "local-llm-download",
          });
        }
      } catch (error) {
        sonnerToast.error(`Couldn’t start ${modelName}`, {
          id: "local-llm-download",
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        activatingRef.current = false;
        resetDownloadState();
      }
    },
    [modelName, queryClient, resetDownloadState],
  );

  useEffect(() => {
    if (
      pendingActivation &&
      isDownloaded &&
      defaultModel &&
      !cancelledRef.current
    ) {
      void finishDownload(defaultModel.key);
    }
  }, [pendingActivation, isDownloaded, defaultModel, finishDownload]);

  const downloadAndUse = useMutation({
    mutationFn: async (model: GgufLlmModel) => {
      cancelledRef.current = false;
      activatingRef.current = false;
      failureReportedRef.current = false;
      setPhase("downloading");
      setProgress(0);
      setPendingActivation(true);

      const channel = new Channel<number>();
      channel.onmessage = (value) => {
        if (cancelledRef.current) {
          return;
        }
        // -1 is failure, -2 is paused. Treating every negative as a failure
        // meant pausing raised "Download failed. Check your connection", reset
        // the phase and made this card vanish — for a transfer that was fine
        // and resumable. The plugin sends -2 for exactly this reason, and the
        // two sibling consumers already gate on `value >= 0`.
        if (value === -1) {
          reportDownloadFailure(
            "Download failed. Check your connection and try again.",
          );
          return;
        }
        if (value < 0) {
          return;
        }

        const next = Math.max(0, Math.min(100, Math.round(value)));
        setProgress(next);
        if (next >= 100) {
          void finishDownload(model);
        }
      };

      // Resolves once the transfer is queued; completion arrives on the channel.
      const result = await localLlmCommands.downloadModel(model, channel);
      if (result.status === "error") {
        throw new Error(result.error);
      }
    },
    onError: (error) => {
      if (cancelledRef.current) {
        return;
      }
      reportDownloadFailure(
        error instanceof Error ? error.message : String(error),
      );
    },
  });

  const activate = useMutation({
    mutationFn: activateOnDeviceLlm,
    onSuccess: () => {
      sonnerToast.success(`${modelName} is ready`);
    },
    onError: (error) => {
      sonnerToast.error(`Couldn’t start ${modelName}`, {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const pauseDownload = useMutation({
    mutationFn: async (model: GgufLlmModel) => {
      const result = await localLlmCommands.pauseDownload(model);
      if (result.status === "error") {
        throw new Error(result.error);
      }
    },
    onError: (error) => {
      sonnerToast.error("Couldn’t pause the download", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const cancelDownload = useMutation({
    mutationFn: async (model: GgufLlmModel) => {
      if (activatingRef.current) {
        return false;
      }
      cancelledRef.current = true;
      const result = await localLlmCommands.cancelDownload(model);
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (cancelled) => {
      if (!cancelled) {
        // Nothing was in flight (it just finished, or activation took over).
        cancelledRef.current = false;
        void queryClient.invalidateQueries({ queryKey: DOWNLOADED_QUERY_KEY });
        return;
      }
      resetDownloadState();
      sonnerToast.message("Download cancelled", { id: "local-llm-download" });
    },
    onError: (error) => {
      cancelledRef.current = false;
      sonnerToast.error("Couldn’t cancel download", {
        id: "local-llm-download",
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  if (recommended.isError) {
    return (
      <div className="border-border/60 bg-card/70 flex flex-col gap-1 rounded-2xl border px-4 py-3">
        <p className="text-sm font-medium">On-device interpretation</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Couldn’t read the local model catalog. Restart Meeki and try again.
        </p>
      </div>
    );
  }

  if (!defaultModel) {
    return null;
  }

  // First-time download is owned by OnDeviceSetupCard, which fetches the
  // transcription and interpretation models together.
  if (!isDownloaded && phase === "idle" && downloading.data !== true) {
    return null;
  }

  const backendDownloading =
    downloading.data === true && !isDownloaded && !cancelledRef.current;
  const showStarting = phase === "starting";
  const showDownloading =
    !showStarting && (phase === "downloading" || backendDownloading);
  const busy =
    phase !== "idle" ||
    downloading.data !== false ||
    downloadAndUse.isPending ||
    activate.isPending ||
    cancelDownload.isPending;
  const sizeGb = formatGb(defaultModel.size_bytes);

  return (
    <div className="border-border/60 bg-card/70 flex flex-col gap-3 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">On-device interpretation</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          One click downloads {defaultModel.name} (~{sizeGb} GB) from Hugging
          Face and runs it locally with the bundled llama.cpp runtime. Venice
          remains available if you prefer cloud.
        </p>
        <ModelFacts model={defaultModel} totalMemoryBytes={totalMemoryBytes} />
        {totalMemoryBytes > 0 ? (
          <p className="text-muted-foreground text-[11px]">
            Chosen for this Mac’s {formatMemoryGb(totalMemoryBytes)} GB of
            memory. You can pick a different local model in the dropdown above.
          </p>
        ) : null}
      </div>

      {showDownloading || showStarting ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
              <Loader2 className="size-3.5 shrink-0 animate-spin" />
              <span className="truncate">
                {showStarting
                  ? `Starting ${modelName}…`
                  : progress === null
                    ? `Downloading ${modelName}…`
                    : `Downloading ${modelName} · ${progress}%`}
              </span>
            </div>
            {showDownloading ? (
              <div className="flex shrink-0 items-center gap-1">
                {/*
                  Pausing keeps the bytes for a Range resume; cancelling throws
                  them away. On a 13.6 GB model that is a big enough difference
                  to be worth offering both.
                */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  // Not `|| isPaused`: that disabled the button in the one state
                  // where it says "Resume", so the resume branch below was
                  // unreachable. During a retry backoff — which renders exactly
                  // this state — the only ways out were waiting or cancelling.
                  disabled={pauseDownload.isPending || downloadAndUse.isPending}
                  onClick={() =>
                    isPaused
                      ? downloadAndUse.mutate(defaultModel.key)
                      : pauseDownload.mutate(defaultModel.key)
                  }
                >
                  {isPaused ? (
                    <>
                      <PlayIcon className="size-3.5" />
                      Resume
                    </>
                  ) : (
                    <>
                      <PauseIcon className="size-3.5" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={cancelDownload.isPending}
                  onClick={() => cancelDownload.mutate(defaultModel.key)}
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
          <div
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              showStarting || shownProgress === null ? undefined : shownProgress
            }
            aria-valuetext={
              showStarting
                ? `Starting ${modelName}`
                : shownProgress === null
                  ? `Downloading ${modelName}`
                  : `${shownProgress}%`
            }
            aria-label={`${modelName} download progress`}
          >
            <div
              className={cn([
                "bg-foreground/80 h-full rounded-full transition-[width] duration-300 ease-out",
                (showStarting || shownProgress === null) && "animate-pulse",
              ])}
              style={{
                width:
                  showStarting || shownProgress === null
                    ? "100%"
                    : `${Math.max(shownProgress, 2)}%`,
              }}
            />
          </div>
          {showDownloading ? (
            <p className="text-muted-foreground text-[11px]">
              ~{sizeGb} GB from Hugging Face. You can cancel anytime.
            </p>
          ) : null}
        </div>
      ) : !isDownloaded ? (
        <Button
          size="sm"
          className="w-fit gap-2"
          disabled={busy}
          onClick={() => downloadAndUse.mutate(defaultModel.key)}
        >
          Download & use {defaultModel.name}
        </Button>
      ) : (
        <Button
          size="sm"
          className="w-fit gap-2"
          disabled={busy}
          onClick={() => activate.mutate(defaultModel.key)}
        >
          {activate.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Starting…
            </>
          ) : (
            `Use ${defaultModel.name}`
          )}
        </Button>
      )}

      <OtherLocalModels recommendedKey={defaultModel.key} />
    </div>
  );
}
