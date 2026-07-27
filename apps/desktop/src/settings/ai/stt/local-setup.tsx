import { useQuery } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { commands as localSttCommands } from "@meeki/plugin-local-stt";
import { cn } from "@meeki/utils";

import { OnDeviceSetupCard } from "~/settings/ai/shared/on-device-setup";
import { LOCAL_LIVE_PREVIEW_MODEL } from "~/stt/capabilities";
import {
  BATCH_MODEL_CHOICES,
  DEFAULT_BATCH_MODEL,
  setPreferredBatchModel,
  usePreferredBatchModel,
} from "~/stt/on-device-pack";

function formatGb(bytes: number) {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.round(bytes / 1e6)} MB`;
}

/**
 * Shown above everything else until on-device transcription exists, because a
 * fresh install has no way to transcribe and the provider dropdown alone does
 * not say so. Picking here decides which model the one-click download fetches.
 */
export function LocalTranscriptionSetup() {
  const preferred = usePreferredBatchModel();
  const [choice, setChoice] = useState(preferred ?? DEFAULT_BATCH_MODEL);

  const ready = useQuery({
    queryKey: ["on-device-stt-pack-ready", choice],
    queryFn: async () => {
      for (const model of [LOCAL_LIVE_PREVIEW_MODEL, choice]) {
        const result = await localSttCommands.isModelDownloaded(model);
        if (result.status !== "ok" || !result.data) {
          return false;
        }
      }
      return true;
    },
    refetchInterval: 2_000,
  });

  if (ready.data !== false) {
    return null;
  }

  return (
    <div className="border-border/60 bg-card/70 flex flex-col gap-3 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Transcription runs on this Mac</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Pick the model that writes your saved transcript. Live captions always
          use Parakeet, which downloads alongside it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        {BATCH_MODEL_CHOICES.map((option) => {
          const selected = option.model === choice;
          return (
            <button
              key={option.model}
              type="button"
              onClick={() => {
                setChoice(option.model);
                setPreferredBatchModel(option.model);
              }}
              className={cn([
                "flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                selected
                  ? "border-foreground/40 bg-accent/60"
                  : "border-border/60 hover:bg-accent/30",
              ])}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{option.label}</span>
                  {option.recommended ? (
                    <span className="bg-foreground/10 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <span className="text-muted-foreground text-[11px] leading-relaxed">
                  {option.description}
                </span>
                <span className="text-muted-foreground text-[11px]">
                  {formatGb(option.sizeBytes)} · with Parakeet{" "}
                  {formatGb(option.sizeBytes + 120 * 1024 * 1024)} total
                </span>
              </div>
              {selected ? (
                <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
              ) : null}
            </button>
          );
        })}
      </div>

      <OnDeviceSetupCard />
    </div>
  );
}
