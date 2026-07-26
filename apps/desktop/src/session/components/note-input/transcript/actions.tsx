import { useCallback, useState, type ReactNode } from "react";

import { commands as fsSyncCommands } from "@hypr/plugin-fs-sync";
import { sonnerToast } from "@hypr/ui/components/ui/toast";

import {
  formatSttModelLabel,
  RetranscribeConfirmDialog,
  type RetranscribeConfirmKind,
} from "./retranscribe-confirm";

import { withCloudsyncActivity } from "~/db/cloudsync-activity";
import { getEnhancerService } from "~/services/enhancer";
import {
  getLocalFinalBatchModel,
  isLocalSoniqoSttModel,
} from "~/stt/capabilities";
import { useListener } from "~/stt/contexts";
import { getLatestBatchTranscript } from "~/stt/queries";
import { getBatchProvider } from "~/stt/useRunBatch";
import { isStoppedTranscriptionError, useRunBatch } from "~/stt/useRunBatch";
import { useSTTConnection } from "~/stt/useSTTConnection";

type PendingConfirm = {
  kind: RetranscribeConfirmKind;
  previousLabel: string;
  nextLabel: string;
  audioPath: string;
  batchOptions: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  };
};

function resolveIntendedBatchTarget(conn: {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}) {
  if (isLocalSoniqoSttModel(conn.provider, conn.model)) {
    const model = getLocalFinalBatchModel(conn.model);
    return {
      provider: "soniqo",
      model,
      baseUrl: "soniqo://local",
      apiKey: "",
      label: formatSttModelLabel("soniqo", model),
    };
  }

  const provider = getBatchProvider(conn.provider, conn.model);
  if (!provider) {
    return null;
  }

  return {
    provider,
    model: conn.model,
    baseUrl: conn.baseUrl,
    apiKey: conn.apiKey,
    label: formatSttModelLabel(conn.provider, conn.model),
  };
}

export function useRegenerateTranscript(sessionId: string): {
  regenerateTranscript: () => Promise<void>;
  confirmDialog: ReactNode;
} {
  const runBatch = useRunBatch(sessionId);
  const { conn } = useSTTConnection();
  const handleBatchFailed = useListener((state) => state.handleBatchFailed);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const runRetranscribe = useCallback(
    async (
      audioPath: string,
      batchOptions: PendingConfirm["batchOptions"],
      replaceInterpretation: boolean,
    ) => {
      try {
        await withCloudsyncActivity(
          "transcription",
          `${sessionId}:retranscription:${crypto.randomUUID()}`,
          async () => {
            await runBatch(audioPath, {
              promotion: { scope: "whole_session" },
              ...batchOptions,
            });
            const enhancer = getEnhancerService();
            if (replaceInterpretation) {
              await enhancer?.requestAutoEnhance(sessionId, "regenerate");
            } else {
              await enhancer?.queueAutoEnhanceIfSummaryEmpty(sessionId);
            }
          },
        );
      } catch (error) {
        if (isStoppedTranscriptionError(error)) {
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        handleBatchFailed(sessionId, msg);
        sonnerToast.error("Re-transcription failed", {
          id: `transcript-regenerate-failed-${sessionId}`,
          description: msg,
        });
      }
    },
    [handleBatchFailed, runBatch, sessionId],
  );

  const regenerateTranscript = useCallback(async () => {
    const result = await fsSyncCommands.audioPath(sessionId);
    if (result.status === "error") {
      sonnerToast.error("Recording not found. It may have been deleted.", {
        id: `transcript-regenerate-audio-missing-${sessionId}`,
      });
      return;
    }

    if (!conn) {
      sonnerToast.error("Configure a speech-to-text model in Settings first.", {
        id: `transcript-regenerate-no-stt-${sessionId}`,
      });
      return;
    }

    const next = resolveIntendedBatchTarget(conn);
    if (!next) {
      sonnerToast.error(
        "The selected speech-to-text model cannot run batch transcription.",
        {
          id: `transcript-regenerate-unsupported-${sessionId}`,
        },
      );
      return;
    }

    const audioPath = result.data;
    const batchOptions = {
      model: next.model,
      baseUrl: next.baseUrl,
      apiKey: next.apiKey,
    };

    const previous = await getLatestBatchTranscript(sessionId);
    if (!previous) {
      await runRetranscribe(audioPath, batchOptions, false);
      return;
    }

    const sameModel =
      previous.provider === next.provider && previous.model === next.model;

    setPending({
      kind: sameModel ? "same_model" : "different_model",
      previousLabel: formatSttModelLabel(previous.provider, previous.model),
      nextLabel: next.label,
      audioPath,
      batchOptions,
    });
  }, [conn, runRetranscribe, sessionId]);

  const confirmDialog = (
    <RetranscribeConfirmDialog
      open={pending !== null}
      kind={pending?.kind ?? "same_model"}
      previousLabel={pending?.previousLabel ?? ""}
      nextLabel={pending?.nextLabel ?? ""}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) {
          return;
        }
        const { audioPath, batchOptions, kind } = pending;
        setPending(null);
        void runRetranscribe(
          audioPath,
          batchOptions,
          kind === "different_model",
        );
      }}
    />
  );

  return { regenerateTranscript, confirmDialog };
}
