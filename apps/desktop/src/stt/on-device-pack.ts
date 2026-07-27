import type { LocalModel } from "@meeki/plugin-local-stt";

import {
  LOCAL_FINAL_BATCH_MODEL,
  LOCAL_LIVE_PREVIEW_MODEL,
} from "~/stt/capabilities";

/** Models required for the Parakeet live preview + Qwen final batch flow. */
export const ON_DEVICE_STT_PACK = [
  LOCAL_LIVE_PREVIEW_MODEL,
  LOCAL_FINAL_BATCH_MODEL,
] as const satisfies readonly LocalModel[];

export function isOnDeviceSttPackModel(
  model?: string | null,
): model is LocalModel {
  return (
    model === LOCAL_LIVE_PREVIEW_MODEL || model === LOCAL_FINAL_BATCH_MODEL
  );
}

/** When downloading a pack member, download the full pack in one action. */
export function modelsForOnDeviceDownload(model: LocalModel): LocalModel[] {
  if (isOnDeviceSttPackModel(model)) {
    return [...ON_DEVICE_STT_PACK];
  }
  return [model];
}
