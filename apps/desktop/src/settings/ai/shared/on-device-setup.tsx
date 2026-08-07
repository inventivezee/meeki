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
import { cn } from "@meeki/utils";

import { useNotifications } from "~/contexts/notifications";
import {
  formatBytesProgress,
  formatGb,
  ModelFacts,
} from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";
import {
  BATCH_MODEL_CHOICES,
  DEFAULT_BATCH_MODEL,
  sttPackBytes,
  sttPackFor,
  usePreferredBatchModel,
} from "~/stt/on-device-pack";

const SETUP_TOAST_ID = "on-device-setup";

/**
 * Single entry point for on-device AI. Transcription always uses the fixed
 * Parakeet + Qwen3 pair; only the interpretation model varies with memory.
 *
 * `scope` exists because this card renders on two settings pages. Under
 * Transcription it used to describe — and offer to download — the 13.6 GB
 * summarisation model, which has nothing to do with transcription and read as a
 * mistake.
 */
export function OnDeviceSetupCard({
  scope = "all",
}: {
  scope?: "all" | "stt";
} = {}) {
  const includesLlm = scope === "all";
  // The transcription panel writes the user's batch choice here; reading it
  // rather than a constant is what makes the pick actually govern the download.
  const batchModel = usePreferredBatchModel();
  const sttPack = sttPackFor(batchModel);
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

  // Any batch model on disk means transcription works, which is all this card
  // was ever offering. It used to insist on its own exact pack, so a user who
  // had already downloaded a different model — or picked one and fetched it
  // from the list below — kept a "download models" panel above a page whose
  // rows all say Downloaded.
  const anyBatchReady = useQuery({
    queryKey: ["on-device-any-batch-model-ready"],
    queryFn: async () => {
      for (const choice of BATCH_MODEL_CHOICES) {
        const result = await localSttCommands.isModelDownloaded(choice.model);
        if (result.status === "ok" && result.data) {
          return true;
        }
      }
      return false;
    },
    refetchInterval: 2_000,
  });

  const sttReady = useQuery({
    queryKey: ["on-device-stt-pack-ready", batchModel],
    queryFn: async () => {
      for (const model of sttPack) {
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

  const llmModel = includesLlm ? (recommended.data?.model ?? null) : null;
  // Vacuously true when this card is not responsible for the LLM, so the
  // transcription page still hides the card once transcription is set up.
  const llmReady =
    !includesLlm ||
    Boolean(llmModel && llmDownloaded.data?.includes(llmModel.key));
  // What this card would actually fetch. The card described — and showed the
  // full spec block for — a summarisation model that had already finished,
  // while quoting a size that correctly excluded it.
  const llmPending = llmReady ? null : llmModel;
  const sttPending = !sttReady.data;

  // Asked of the backend rather than tracked in component state: a download
  // outlives this card, so remounting it after a tab switch must not offer to
  // start the same multi-gigabyte transfer a second time.
  const inFlight = useQuery({
    queryKey: ["on-device-setup-in-flight", llmModel?.key ?? null, batchModel],
    refetchInterval: 1_000,
    queryFn: async () => {
      for (const model of sttPack) {
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
      await downloadAndActivateOnDevice(llmModel?.key ?? null, batchModel);
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

  // Whichever leg is actually transferring. The two stop by different means —
  // the GGUF keeps a byte-range partial, Soniqo keeps whole completed files —
  // but both resume rather than restart, so one button covers them.
  const pause = useMutation({
    mutationFn: async () => {
      const model = current?.model;
      if (!model) return;

      if (llmModel && model === llmModel.key) {
        const result = await localLlmCommands.pauseDownload(llmModel.key);
        if (result.status === "error") {
          throw new Error(result.error);
        }
        return;
      }

      const result = await localSttCommands.cancelDownload(model as LocalModel);
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
      const model = current?.model;
      if (!model) return;

      if (llmModel && model === llmModel.key) {
        // Resuming is just downloading again: the partial on disk is picked up
        // by a Range request rather than refetched.
        const result = await localLlmCommands.downloadModel(
          llmModel.key,
          new Channel<number>(),
        );
        if (result.status === "error") {
          throw new Error(result.error);
        }
        return;
      }

      // Same for Soniqo, at whole-file granularity: the Hub writes a .metadata
      // sidecar only after a file completes, so a restart skips what landed.
      const result = await localSttCommands.downloadModel(model as LocalModel);
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
  const mine = downloadsFor([...sttPack, ...(llmModel ? [llmModel.key] : [])]);
  const current = mine.current;
  // A percentage is only shown when byte counts back it up. The Soniqo bridge
  // reports a fraction weighted per *file*, so a 2.4 GB shard is one sixth of
  // the bar and the whole transfer crawls 0% -> 13%. A number that moves one
  // point per 185 MB is worse than no number; an indeterminate bar is honest.
  const hasByteCounts = (current?.totalBytes ?? 0) > 0;
  const percent = hasByteCounts ? (current?.progress ?? null) : null;
  const paused = mine.paused;
  // Every leg can be stopped now. Soniqo used to be excluded because the bridge
  // was thought to have no stop, which left a transcription download with no
  // button at all — no pause, and no Download either, since the progress row
  // replaces it.
  const pausable = Boolean(current);
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
    void activateOnDevice(llmModel?.key ?? null, batchModel).catch(
      (error: unknown) => {
        sonnerToast.error("Downloaded, but couldn’t start the models", {
          id: SETUP_TOAST_ID,
          description: error instanceof Error ? error.message : String(error),
        });
      },
    );
  }, [
    inFlight.data,
    sttReady.data,
    llmReady,
    llmModel?.key,
    setup.isPending,
    paused,
    batchModel,
  ]);

  if ((sttReady.data || anyBatchReady.data) && llmReady) {
    return null;
  }

  const packBytes = sttPackBytes(batchModel);
  const totalBytes =
    (sttReady.data ? 0 : packBytes) +
    (llmModel && !llmReady ? llmModel.size_bytes : 0);

  return (
    <div className="border-border/60 bg-card/70 flex flex-col gap-3 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {sttPending && llmPending
            ? "Set up on-device AI"
            : sttPending
              ? "Set up on-device transcription"
              : "Set up on-device summaries"}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {/* Names only what is still missing. Listing a model that has already
              downloaded reads as though the work has to be redone. */}
          {sttPending
            ? "Downloads Parakeet and Qwen3 so transcription runs on this Mac"
            : `Downloads ${llmPending?.name ?? "a language model"} so summaries run on this Mac`}
          {sttPending && llmPending
            ? `, and ${llmPending.name} for summaries`
            : ""}
          . About {formatGb(totalBytes)} GB from Hugging Face. The runtimes are
          already in the app.
        </p>
        {llmPending ? (
          <div className="border-border/60 mt-1 flex flex-col gap-0.5 border-l-2 pl-2.5">
            <p className="text-xs font-medium">{llmPending.name}</p>
            <ModelFacts
              model={llmPending}
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
              className={cn([
                "bg-foreground/80 h-full rounded-full transition-[width] duration-300 ease-out",
                percent === null && "animate-pulse",
              ])}
              style={{
                width: percent === null ? "100%" : `${Math.max(percent, 2)}%`,
              }}
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
  batchModel: LocalModel = DEFAULT_BATCH_MODEL,
) {
  for (const model of sttPackFor(batchModel)) {
    await downloadSttModel(model);
  }

  if (llmModel) {
    // A paused model must not be selected — the weights are incomplete. The
    // card's recovery effect re-activates once the resumed transfer lands, so
    // stopping here quietly is the whole handling.
    if ((await downloadLlmModel(llmModel)) === "paused") {
      return;
    }
  }

  await activateOnDevice(llmModel, batchModel);
}

async function downloadLlmModel(
  model: GgufLlmModel,
): Promise<"done" | "paused"> {
  // The same check the STT leg has always done. Without it, clicking setup
  // with only transcription missing refetched a summarisation model that was
  // already on disk — 13.6 GB from byte zero, invisibly, because the transfer
  // lands in a .part while the complete file next to it keeps serving answers.
  const already = await localLlmCommands.isModelDownloaded(model);
  if (already.status === "ok" && already.data) {
    return "done";
  }

  // This leg runs only after the whole STT pack lands, so it can fire many
  // minutes after the click that armed it — long enough for the user to have
  // started this very model from the settings row below. Re-issuing the command
  // would displace that transfer's channel with a -1 and restart its
  // connection. Wait on it instead.
  const inFlight = await localLlmCommands.isModelDownloading(model);
  if (inFlight.status === "ok" && inFlight.data) {
    return await waitForLlmDownload(model);
  }

  const result = await localLlmCommands.downloadModel(
    model,
    new Channel<number>(),
  );
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return await waitForLlmDownload(model);
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

async function waitForLlmDownload(
  model: GgufLlmModel,
): Promise<"done" | "paused"> {
  for (let attempt = 0; attempt < 60 * 60; attempt += 1) {
    const done = await localLlmCommands.isModelDownloaded(model);
    if (done.status === "ok" && done.data) {
      return "done";
    }
    const downloading = await localLlmCommands.isModelDownloading(model);
    if (downloading.status === "ok" && !downloading.data) {
      // A pause looks exactly like a stop from here: pause_download removes the
      // registry entry before it returns, so is_downloading reads false the
      // instant the user clicks the card's own Pause button. Throwing turned a
      // deliberate, resumable pause into "Couldn't finish on-device setup".
      // Bytes on disk are what tells them apart — a pause keeps its partial.
      const paused = await localLlmCommands.pausedBytes(model);
      if (paused.status === "ok" && paused.data > 0) {
        return "paused";
      }
      throw new Error("Download stopped before the model finished.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Timed out downloading the interpretation model.");
}

async function activateOnDevice(
  llmModel: GgufLlmModel | null,
  batchModel: LocalModel = DEFAULT_BATCH_MODEL,
) {
  await setSettingValues({
    current_stt_provider: "hyprnote",
    current_stt_model: batchModel,
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
