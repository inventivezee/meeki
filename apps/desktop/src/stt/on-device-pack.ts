import { useSyncExternalStore } from "react";

import type { LocalModel } from "@meeki/plugin-local-stt";

import {
  LOCAL_FINAL_BATCH_MODEL,
  LOCAL_LIVE_PREVIEW_MODEL,
} from "~/stt/capabilities";

export const DEFAULT_BATCH_MODEL = LOCAL_FINAL_BATCH_MODEL;

/**
 * Batch models the setup card offers. Live captions always use Parakeet, so
 * this is only about the transcript that gets saved.
 */
export const BATCH_MODEL_CHOICES = [
  {
    model: "soniqo-qwen3-large",
    label: "Qwen3 ASR 1.7B",
    description:
      "Most accurate, and handles 52 languages. The default unless you are short on disk.",
    sizeBytes: 1_700 * 1024 * 1024,
    recommended: true,
  },
  {
    model: "soniqo-qwen3-small",
    label: "Qwen3 ASR 0.6B",
    description:
      "Same languages, noticeably less accurate, a third of the size.",
    sizeBytes: 600 * 1024 * 1024,
    recommended: false,
  },
  {
    model: "soniqo-parakeet-batch",
    label: "Parakeet Batch",
    description:
      "Fastest, but only 25 European languages. Good if you always work in English.",
    sizeBytes: 600 * 1024 * 1024,
    recommended: false,
  },
] as const satisfies readonly {
  model: LocalModel;
  label: string;
  description: string;
  sizeBytes: number;
  recommended: boolean;
}[];

const PREFERRED_BATCH_MODEL_KEY = "meeki.preferred-batch-stt-model";
const listeners = new Set<() => void>();

export function setPreferredBatchModel(model: LocalModel) {
  localStorage.setItem(PREFERRED_BATCH_MODEL_KEY, String(model));
  for (const listener of listeners) {
    listener();
  }
}

function readPreferredBatchModel(): LocalModel {
  const stored = localStorage.getItem(PREFERRED_BATCH_MODEL_KEY);
  const known = BATCH_MODEL_CHOICES.some((choice) => choice.model === stored);
  return known ? (stored as LocalModel) : DEFAULT_BATCH_MODEL;
}

export function usePreferredBatchModel(): LocalModel {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readPreferredBatchModel,
    () => DEFAULT_BATCH_MODEL,
  );
}

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
