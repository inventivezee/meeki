import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";
import {
  commands as localSttCommands,
  events as localSttEvents,
  type LocalModel,
} from "@meeki/plugin-local-stt";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { formatGb, ModelFacts } from "~/settings/ai/shared/model-facts";
import { setAiProvider } from "~/settings/providers";
import { setSettingValues } from "~/settings/queries";
import { LOCAL_FINAL_BATCH_MODEL } from "~/stt/capabilities";
import { ON_DEVICE_STT_PACK } from "~/stt/on-device-pack";

const SETUP_TOAST_ID = "on-device-setup";

/** Parakeet streaming + Qwen3 large, the fixed transcription pair. */
const STT_PACK_BYTES = 2.6e9;

/**
 * Single entry point for on-device AI. Transcription always uses the fixed
 * Parakeet + Qwen3 pair; only the interpretation model varies with memory.
 */
export function OnDeviceSetupCard() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const sttProgressRef = useRef<Record<string, number>>({});

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

  useEffect(() => {
    const unlisten = localSttEvents.downloadProgressPayload.listen((event) => {
      const { model, status } = event.payload;
      if (typeof status === "object" && "downloading" in status) {
        sttProgressRef.current[String(model)] = status.downloading;
      } else if (status === "completed") {
        sttProgressRef.current[String(model)] = 100;
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  const setup = useMutation({
    mutationFn: async () => {
      const total =
        (sttReady.data ? 0 : ON_DEVICE_STT_PACK.length) +
        (llmReady || !llmModel ? 0 : 1);
      let done = 0;

      if (!sttReady.data) {
        for (const model of ON_DEVICE_STT_PACK) {
          setStep(`Transcription model ${done + 1} of ${total}`);
          await downloadSttModel(model, (value) => {
            setProgress(Math.round(((done + value / 100) / total) * 100));
          });
          done += 1;
        }
      }

      if (llmModel && !llmReady) {
        setStep(`Downloading ${llmModel.name}`);
        const channel = new Channel<number>();
        channel.onmessage = (value) => {
          if (value >= 0) {
            setProgress(
              Math.round(((done + Math.min(value, 100) / 100) / total) * 100),
            );
          }
        };
        const result = await localLlmCommands.downloadModel(
          llmModel.key,
          channel,
        );
        if (result.status === "error") {
          throw new Error(result.error);
        }
        await waitForLlmDownload(llmModel.key);
        done += 1;
      }

      setStep("Starting on-device models");
      setProgress(100);
      await activateOnDevice(llmModel?.key ?? null);
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
    onSettled: () => {
      setProgress(null);
      setStep(null);
    },
  });

  if (sttReady.data && llmReady) {
    return null;
  }

  const missingGb =
    llmModel && !llmReady
      ? formatGb(llmModel.size_bytes + STT_PACK_BYTES)
      : "2.6";
  const running = setup.isPending;

  return (
    <div className="border-border/60 bg-card/70 flex flex-col gap-3 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Set up on-device AI</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Downloads everything Meeki needs to work offline: Parakeet and Qwen3
          for transcription
          {llmModel ? `, and ${llmModel.name} for summaries` : ""}. About{" "}
          {missingGb} GB from Hugging Face. The runtimes are already in the app.
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
              {step ?? "Downloading"}
              {progress === null ? "" : ` · ${progress}%`}
            </span>
          </div>
          <div
            className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
            aria-label="On-device model download progress"
          >
            <div
              className="bg-foreground/80 h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(progress ?? 2, 2)}%` }}
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

async function downloadSttModel(
  model: LocalModel,
  onProgress: (value: number) => void,
) {
  const already = await localSttCommands.isModelDownloaded(model);
  if (already.status === "ok" && already.data) {
    onProgress(100);
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
      onProgress(100);
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
