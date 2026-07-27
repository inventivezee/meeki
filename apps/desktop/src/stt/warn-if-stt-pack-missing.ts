import { commands as localSttCommands } from "@meeki/plugin-local-stt";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { ON_DEVICE_STT_PACK } from "~/stt/on-device-pack";

const TOAST_ID = "stt-pack-downloading";

/**
 * The Soniqo bridge fetches its weights on first use, so an import with no
 * model still succeeds — it just sits silently for a couple of GB. Say so,
 * otherwise the first transcription of a fresh install looks hung.
 */
export async function warnIfSttPackMissing() {
  try {
    for (const model of ON_DEVICE_STT_PACK) {
      const result = await localSttCommands.isModelDownloaded(model);
      if (result.status === "ok" && result.data) {
        continue;
      }

      sonnerToast.message("Downloading the transcription model", {
        id: TOAST_ID,
        description:
          "First transcription on this Mac fetches about 2 GB. It runs automatically — transcription starts when it finishes.",
      });
      return false;
    }
  } catch (error) {
    console.warn("[upload] could not check transcription models", error);
  }

  return true;
}
