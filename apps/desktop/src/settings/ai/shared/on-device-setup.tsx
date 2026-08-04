import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { Loader2, PauseIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";
import {
  commands as localSttCommands,
  type LocalModel,
} from "@meeki/plugin-local-stt";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { useNotifications } from "~/contexts/notifications";
import {
  formatBytesProgress,
  formatGb,
  ModelFacts,
} from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";
import { LOCAL_FINAL_BATCH_MODEL } from "~/stt/capabilities";
import { ON_DEVICE_STT_PACK, sttPackBytes } from "~/stt/on-device-pack";

const SETUP_TOAST_ID = "on-device-setup";

/**
 * Single entry point for on-device AI. Transcription always uses the fixed
 * Parakeet + Qwen3 pair; only the interpretation model varies with memory.
 */
export function OnDeviceSetupCard() {
  const queryClient = useQueryClient();
  const { downloadsFor } = useNotifications();
  const sawInFlight = useRef(false);

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

  const sttReady = useQuery({
    queryKey: ["on-device-stt-pack-ready"],
    queryFn: async () => {
      for (const model of ON_DEVICE_STT_PACK) {
        const result = await localSttCommands.isModelDownloaded(model);
        if (result.status !== "ok" || !result.data) {
          return false;
        }
      }
      return true;
    },
    refetchInterval: 2_000,
  });

  const llmDownloaded = useQuery({
    queryKey: ["local-llm-downloaded"],
    queryFn: async () => {
      const result = await localLlmCommands.listDownloadedModel();
      return result.status === "ok" ? result.data : [];
    },
    refetchInterval: 2_000,
  });

  const llmModel = recommended.data?.model ?? null;
  const llmReady = Boolean(
    llmModel && llmDownloaded.data?.includes(llmModel.key),
  );

  // Asked of the backend rather than tracked in component state: a download
  // outlives this card, so remounting it after a tab switch must not offer to
  // start the same multi-gigabyte transfer a second time.
  const inFlight = useQuery({
    queryKey: ["on-device-setup-in-flight", llmModel?.key ?? null],
    refetchInterval: 1_000,
    queryFn: async () => {
      for (const model of ON_DEVICE_STT_PACK) {
        const result = await localSttCommands.isModelDownloading(model);
        if (result.status === "ok" && result.data) {
          return true;
        }
      }
      if (llmModel) {
        const result = await localLlmCommands.isModelDownloading(llmModel.key);
        if (result.status === "ok" && result.data) {
          return true;
        }
      }
      return false;
    },
  });

  const setup = useMutation({
    mutationFn: async () => {
      // downloadAndActivateOnDevice skips what is already on disk, so passing
      // the recommended model is safe even when only one leg is missing.
      await downloadAndActivateOnDevice(llmModel?.key ?? null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["local-llm-downloaded"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["on-device-stt-pack-ready"],
      });
      sonnerToast.success("On-device models are ready", { id: SETUP_TOAST_ID });
    },
    onError: (error) => {
      sonnerToast.error("Couldn’t finish on-device setup", {
        id: SETUP_TOAST_ID,
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const pause = useMutation({
    mutationFn: async () => {
      if (!llmModel) return;
      const result = await localLlmCommands.pauseDownload(llmModel.key);
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

  const resume = useMutation({
    mutationFn: async () => {
      if (!llmModel) return;
      // Resuming is just downloading again: the partial on disk is picked up
      // by a Range request rather than refetched.
      const result = await localLlmCommands.downloadModel(
        llmModel.key,
        new Channel<number>(),
      );
      if (result.status === "error") {
        throw new Error(result.error);
      }
    },
    onError: (error) => {
      sonnerToast.error("Couldn’t resume the download", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // This card's own models, in the order it downloads them — not whatever
  // happened to report progress first.
  const mine = downloadsFor([
    ...ON_DEVICE_STT_PACK,
    ...(llmModel ? [llmModel.key] : []),
  ]);
  const current = mine.current;
  const percent = current?.progress ?? null;
  const paused = mine.paused;
  // Only the GGUF leg can be paused; the Soniqo transfer is owned by the Swift
  // bridge, which exposes start and poll but no stop.
  const pausable = Boolean(llmModel && current?.model === llmModel.key);
  const running = setup.isPending || inFlight.data === true || paused;

  // A download outlives this card, so the mutation that would have selected the
  // models can die with it. Without this, navigating away mid-download leaves
  // the user with the weights on disk and nothing using them.
  useEffect(() => {
    if (inFlight.data) {
      sawInFlight.current = true;
      return;
    }
    if (!sawInFlight.current || setup.isPending || paused) {
      return;
    }
    if (!sttReady.data || !llmReady) {
      return;
    }
    sawInFlight.current = false;
    void activateOnDevice(llmModel?.key ?? null).catch((error: unknown) => {
      sonnerToast.error("Downloaded, but couldn’t start the models", {
        id: SETUP_TOAST_ID,
        description: error instanceof Error ? error.message : String(error),
      });
    });
  }, [
    inFlight.data,
    sttReady.data,
    llmReady,
    llmModel?.key,
    setup.isPending,
    paused,
  ]);

  if (sttReady.data && llmReady) {
    return null;
  }

  const packBytes = sttPackBytes();
  const totalBytes =
    (sttReady.data ? 0 : packBytes) +
    (llmModel && !llmReady ? llmModel.size_bytes : 0);

  return (
    <div className="border-border/60 bg-card/70 flex flex-col gap-3 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Set up on-device AI</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Downloads everything Meeki needs to work offline: Parakeet and Qwen3
          for transcription
          {llmModel ? `, and ${llmModel.name} for summaries` : ""}. About{" "}
          {formatGb(totalBytes)} GB from Hugging Face. The runtimes are already
          in the app.
        </p>
        {llmModel ? (
          <div className="border-border/60 mt-1 flex flex-col gap-0.5 border-l-2 pl-2.5">
            <p className="text-xs font-medium">{llmModel.name}</p>
            <ModelFacts
              model={llmModel}
              totalMemoryBytes={recommended.data?.total_memory_bytes ?? 0}
            />
          </div>
        ) : null}
      </div>

      {running ? (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            <span className="truncate">
              {paused
                ? `Paused · ${current?.displayName ?? ""}`
                : current
                  ? `Downloading ${current.displayName}`
                  : "Preparing download"}
              {percent === null ? "" : ` · ${percent}%`}
            </span>
            {pausable ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 gap-1 px-2 text-xs"
                onClick={() => (paused ? resume.mutate() : pause.mutate())}
                disabled={pause.isPending || resume.isPending}
              >
                {paused ? (
                  <>
                    <PlayIcon className="size-3" /> Resume
                  </>
                ) : (
                  <>
                    <PauseIcon className="size-3" /> Pause
                  </>
                )}
              </Button>
            ) : null}
          </div>
          {current && current.totalBytes > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatBytesProgress(current.downloadedBytes, current.totalBytes)}
            </p>
          ) : null}
          <div
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            aria-label="On-device model download progress"
          >
            <div
              className="bg-foreground/80 h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(percent ?? 2, 2)}%` }}
            />
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          className="w-fit gap-2"
          onClick={() => setup.mutate()}
        >
          Download on-device models
        </Button>
      )}
    </div>
  );
}

/**
 * Downloads the on-device pack and selects it. Shared with onboarding, whose
 * "Download local & private models" button used to call onContinue() and
 * nothing else — a fresh install reached the record button with no model at all.
 *
 * Long-lived by design: callers that must not block should not await it. Every
 * surface tracks the progress through the app-wide event, and the setup card
 * finishes activation on its own if this caller goes away.
 */
export async function downloadAndActivateOnDevice(
  llmModel: GgufLlmModel | null,
) {
  for (const model of ON_DEVICE_STT_PACK) {
    await downloadSttModel(model);
  }

  if (llmModel) {
    const result = await localLlmCommands.downloadModel(
      llmModel,
      new Channel<number>(),
    );
    if (result.status === "error") {
      throw new Error(result.error);
    }
    await waitForLlmDownload(llmModel);
  }

  await activateOnDevice(llmModel);
}

async function downloadSttModel(model: LocalModel) {
  const already = await localSttCommands.isModelDownloaded(model);
  if (already.status === "ok" && already.data) {
    return;
  }

  const started = await localSttCommands.downloadModel(model);
  if (started.status === "error") {
    throw new Error(started.error);
  }

  // The command returns once the transfer is queued; poll until the file lands.
  for (let attempt = 0; attempt < 60 * 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const done = await localSttCommands.isModelDownloaded(model);
    if (done.status === "ok" && done.data) {
      return;
    }
    const downloading = await localSttCommands.isModelDownloading(model);
    if (downloading.status === "ok" && !downloading.data) {
      throw new Error(`Download stopped for ${model}`);
    }
  }

  throw new Error(`Timed out downloading ${model}`);
}

async function waitForLlmDownload(model: GgufLlmModel) {
  for (let attempt = 0; attempt < 60 * 60; attempt += 1) {
    const done = await localLlmCommands.isModelDownloaded(model);
    if (done.status === "ok" && done.data) {
      return;
    }
    const downloading = await localLlmCommands.isModelDownloading(model);
    if (downloading.status === "ok" && !downloading.data) {
      throw new Error("Download stopped before the model finished.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out downloading the interpretation model.");
}

async function activateOnDevice(llmModel: GgufLlmModel | null) {
  await setSettingValues({
    current_stt_provider: "hyprnote",
    current_stt_model: LOCAL_FINAL_BATCH_MODEL,
  });

  if (!llmModel) {
    return;
  }

  const started = await localLlmCommands.startServer(llmModel);
  if (started.status === "error") {
    throw new Error(started.error);
  }
  await setAiProvider("llm", "on_device", {
    base_url: started.data,
    api_key: "local",
  });
  await setSettingValues({
    current_llm_provider: "on_device",
    current_llm_model: llmModel,
  });
}
