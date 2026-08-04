import { useCallback, useEffect, useState } from "react";

import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { events as localSttEvents } from "@meeki/plugin-local-stt";
import { commands as listenerCommands } from "@meeki/plugin-transcription";

import {
  clearCaptureLifecycleMarker,
  loadCaptureLifecycleMarker,
  loadCaptureLifecycleMarkers,
} from "./capture-lifecycle-storage";
import { listenCaptureRecoveryRequests } from "./capture-recovery-requests";
import { useListener } from "./contexts";
import {
  hasMicrophone,
  NO_MICROPHONE_MESSAGE,
} from "./microphone-availability";
import { useResumeListeningLifecycle } from "./useStartListening";

import { reportCaptureErrorOnce } from "~/store/zustand/capture-errors";

const CAPTURE_RECOVERY_RETRY_MS = 2_000;
const MAX_CAPTURE_RECOVERY_RETRIES = 3;

export function LiveCaptureRecovery() {
  const [recoveryTokens, setRecoveryTokens] = useState<Record<string, number>>(
    {},
  );
  const completeRecovery = useCallback(
    (sessionId: string, recoveryToken: number) => {
      setRecoveryTokens((current) => {
        if (current[sessionId] !== recoveryToken) {
          return current;
        }
        const next = { ...current };
        delete next[sessionId];
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const addSessionIds = (
      ids: Array<string | null>,
      restartExisting = false,
    ) => {
      if (!active) {
        return;
      }
      setRecoveryTokens((current) => {
        const next = { ...current };
        for (const sessionId of ids) {
          if (!sessionId) {
            continue;
          }
          if (restartExisting || !(sessionId in next)) {
            next[sessionId] = (next[sessionId] ?? 0) + 1;
          }
        }
        return next;
      });
    };

    void listenCaptureRecoveryRequests((sessionId) => {
      addSessionIds([sessionId], true);
    })
      .then((stopListening) => {
        if (!active) {
          stopListening();
          return;
        }
        unlisten = stopListening;
      })
      .catch((error) => {
        console.error(
          "[listener] failed to listen for capture recovery requests",
          error,
        );
      });

    void listenerCommands
      .getCaptureSnapshot()
      .then((result) => {
        if (result.status === "error") {
          console.error(
            "[listener] failed to recover active capture:",
            result.error,
          );
          return;
        }
        addSessionIds([
          result.data.activeSessionId,
          ...result.data.finalizingSessionIds,
        ]);
      })
      .catch((error) => {
        console.error("[listener] failed to recover active capture:", error);
      });

    void loadCaptureLifecycleMarkers()
      .then((markers) => {
        addSessionIds(markers.map((marker) => marker.sessionId));
      })
      .catch((error) => {
        console.error(
          "[listener] failed to load capture recovery state",
          error,
        );
      });

    // A batch pass that failed for a missing model is waiting on exactly one
    // event, and it is not a timer. When the download finishes, replay the
    // durable markers — the audio is still on disk, so the transcript can
    // still be produced without the user relaunching or asking.
    const downloadUnlisten = localSttEvents.downloadProgressPayload.listen(
      (event) => {
        if (event.payload.status !== "completed") {
          return;
        }
        void loadCaptureLifecycleMarkers()
          .then((markers) => {
            addSessionIds(
              markers.map((marker) => marker.sessionId),
              true,
            );
          })
          .catch((error) => {
            console.error(
              "[listener] failed to replay capture recovery after a model download",
              error,
            );
          });
      },
    );

    return () => {
      active = false;
      unlisten?.();
      void downloadUnlisten.then((stop) => stop());
    };
  }, []);

  return Object.entries(recoveryTokens).map(([sessionId, recoveryToken]) => (
    <LiveCaptureSessionRecovery
      key={`${sessionId}:${recoveryToken}`}
      sessionId={sessionId}
      recoveryToken={recoveryToken}
      onComplete={completeRecovery}
    />
  ));
}

function LiveCaptureSessionRecovery({
  sessionId,
  recoveryToken,
  onComplete,
}: {
  sessionId: string;
  recoveryToken: number;
  onComplete: (sessionId: string, recoveryToken: number) => void;
}) {
  const resumeListeningLifecycle = useResumeListeningLifecycle(sessionId);
  const finishFinalization = useListener(
    (state) => state.finishCaptureRecoveryFinalization,
  );

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const recover = async () => {
      attempts += 1;
      let result: "attached" | "inactive" | "error";
      try {
        result = await resumeListeningLifecycle();
      } catch (error) {
        console.error("[listener] capture recovery attempt failed", error);
        result = "error";
      }
      if (!active) {
        return;
      }
      if (result === "error" && attempts < MAX_CAPTURE_RECOVERY_RETRIES) {
        retryTimer = setTimeout(() => {
          void recover();
        }, CAPTURE_RECOVERY_RETRY_MS);
        return;
      }
      if (result === "error") {
        console.warn(
          "[listener] giving up capture recovery after repeated failures",
          { sessionId, attempts },
        );
        // A vanished input device is the common cause; without this the only
        // thing the user ever sees is a transcription failure after the fact.
        if (!(await hasMicrophone())) {
          reportCaptureErrorOnce({
            id: `capture-no-microphone:${sessionId}`,
            message: NO_MICROPHONE_MESSAGE,
            variant: "error",
          });
        }
        try {
          const marker = await loadCaptureLifecycleMarker(sessionId);
          if (marker) {
            // The marker is the only durable record that this session still
            // needs a transcript, and it is replayed at every launch. Three
            // retries two seconds apart is an unwinnable budget against a
            // multi-gigabyte model download, and clearing it here is what
            // turned a temporary failure into a permanently lost transcript.
            // Keep it whenever the audio survives; there is still something to
            // recover from.
            const audio = await fsSyncCommands.audioPath(sessionId);
            const audioSurvives = audio.status === "ok" && !!audio.data;

            if (audioSurvives) {
              console.warn(
                "[listener] keeping capture recovery marker; audio is still on disk",
                { sessionId },
              );
              // Released so a later attempt in this same run is not rejected
              // before it starts.
              finishFinalization(sessionId);
            } else {
              await clearCaptureLifecycleMarker(sessionId, marker.transcriptId);
            }
          }
        } catch (error) {
          console.error(
            "[listener] failed to clear capture recovery after giving up",
            error,
          );
        }
      }
      onComplete(sessionId, recoveryToken);
    };

    void recover();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [onComplete, recoveryToken, resumeListeningLifecycle, sessionId]);

  return null;
}
