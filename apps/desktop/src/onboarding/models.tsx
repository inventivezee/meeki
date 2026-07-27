import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { CloudIcon, DownloadIcon, SettingsIcon } from "lucide-react";
import { useCallback } from "react";

import { commands as localLlmCommands } from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";

import { useTabs } from "~/store/zustand/tabs";

/** Parakeet live preview + the default Qwen3 batch model. */
const STT_PACK_BYTES = 1_820 * 1024 * 1024;

function formatGb(bytes: number) {
  return (bytes / 1e9).toFixed(1);
}

/**
 * A fresh install can neither transcribe nor summarise until several GB have
 * landed, and the old flow never mentioned it — users met the download at
 * their first recording instead. Offer the choice up front, with the size
 * stated so the wait is expected rather than alarming.
 */
export function ModelsSection({ onContinue }: { onContinue: () => void }) {
  const openCurrent = useTabs((state) => state.openCurrent);

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

  const llmBytes = recommended.data?.model?.size_bytes ?? 0;
  const totalGb = formatGb(STT_PACK_BYTES + llmBytes);

  const openSettings = useCallback(() => {
    openCurrent({ type: "settings", state: { tab: "transcription" } });
    onContinue();
  }, [onContinue, openCurrent]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm leading-relaxed">
        <Trans>
          Meeki can transcribe and summarise entirely on this Mac, so nothing
          you record leaves the device. That needs a one-time download.
        </Trans>
      </p>

      <div className="flex flex-col gap-2">
        <Button className="w-full justify-start gap-2" onClick={onContinue}>
          <DownloadIcon className="size-4 shrink-0" />
          <Trans>Download local & private models (about {totalGb} GB)</Trans>
        </Button>
        <p className="text-muted-foreground pl-1 text-xs leading-relaxed">
          <Trans>
            Keep Meeki open and your Mac awake until it finishes. You can carry
            on using the app while it downloads.
          </Trans>
        </p>

        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onContinue}
        >
          <CloudIcon className="size-4 shrink-0" />
          <Trans>Use cloud models instead (skip the download)</Trans>
        </Button>

        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={openSettings}
        >
          <SettingsIcon className="size-4 shrink-0" />
          <Trans>Choose models myself…</Trans>
        </Button>
      </div>
    </div>
  );
}
