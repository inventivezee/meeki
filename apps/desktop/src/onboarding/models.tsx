import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { CloudIcon, DownloadIcon, SettingsIcon } from "lucide-react";
import { useCallback } from "react";

import { commands as localLlmCommands } from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { formatGb } from "~/settings/ai/shared/model-facts";
import { downloadAndActivateOnDevice } from "~/settings/ai/shared/on-device-setup";
import { useTabs } from "~/store/zustand/tabs";
import { sttPackBytes } from "~/stt/on-device-pack";

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
  const totalGb = formatGb(sttPackBytes() + llmBytes);

  const openSettings = useCallback(() => {
    openCurrent({ type: "settings", state: { tab: "transcription" } });
    onContinue();
  }, [onContinue, openCurrent]);

  // Both of the choices below used to call onContinue() and nothing else, so a
  // fresh install finished onboarding with no transcription model and no
  // provider set — and met the consequences at its first recording.
  const startLocalDownload = useCallback(() => {
    // Not awaited: this is fifteen minutes of downloading. Progress is tracked
    // app-wide, and the settings card finishes activation even if this screen
    // is long gone.
    void downloadAndActivateOnDevice(
      recommended.data?.model?.key ?? null,
    ).catch((error: unknown) => {
      sonnerToast.error("Couldn’t finish the on-device download", {
        id: "onboarding-on-device-download",
        description: error instanceof Error ? error.message : String(error),
      });
    });
    openCurrent({ type: "settings", state: { tab: "transcription" } });
    onContinue();
  }, [onContinue, openCurrent, recommended.data?.model?.key]);

  // Cloud needs a key, so the honest action is to go and add one rather than
  // silently record the choice and leave the user with nothing configured.
  const chooseCloud = useCallback(() => {
    openCurrent({ type: "settings", state: { tab: "intelligence" } });
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
        <Button
          className="w-full justify-start gap-2"
          onClick={startLocalDownload}
        >
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
          onClick={chooseCloud}
        >
          <CloudIcon className="size-4 shrink-0" />
          <Trans>Use cloud models instead (add an API key)</Trans>
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
