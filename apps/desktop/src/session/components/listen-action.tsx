import { Trans } from "@lingui/react/macro";
import { useCallback } from "react";

import { Spinner } from "@meeki/ui/components/ui/spinner";

import { OptionsMenu } from "./floating/options-menu";
import { ActionableTooltipContent, FloatingButton } from "./floating/shared";
import {
  RecordingIcon,
  useCurrentNoteHasContent,
  useListenButtonState,
} from "./shared";

import { useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { useStartListening } from "~/stt/useStartListening";
import {
  isMainWebviewWindow,
  requestMainListenerControl,
} from "~/stt/window-control";

export function ListenActionButton({ sessionId }: { sessionId: string }) {
  const { shouldRender, recording, finalizing, isDisabled, warningMessage } =
    useListenButtonState(sessionId);
  const loading = useListener(
    (state) => state.live.loading && state.live.sessionId === sessionId,
  );

  // Stop used to render only while starting up. Once capture was actually
  // running, loading went false and shouldRender was !active, so the control
  // vanished — mid-meeting there was nothing on screen saying it was recording
  // and no way to stop it from here.
  if (loading || recording) {
    return <StopListeningButton sessionId={sessionId} starting={loading} />;
  }

  if (finalizing) {
    return (
      <FloatingButton disabled icon={<Spinner />}>
        <Trans>Stopping...</Trans>
      </FloatingButton>
    );
  }

  if (!shouldRender) {
    return null;
  }

  return (
    <StartListeningButton
      sessionId={sessionId}
      isDisabled={isDisabled}
      warningMessage={warningMessage}
    />
  );
}

function StopListeningButton({
  sessionId,
  starting,
}: {
  sessionId: string;
  starting?: boolean;
}) {
  const stop = useListener((state) => state.stop);

  const handleStop = useCallback(() => {
    // Starts are proxied to the main window, so stops must be too — a local
    // stop cannot end a session the main window owns.
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("stop", sessionId);
      return;
    }

    stop();
  }, [sessionId, stop]);

  return (
    <FloatingButton
      onClick={handleStop}
      icon={starting ? <Spinner /> : <RecordingIcon pulse />}
      className="border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400"
      tooltip={{ content: <Trans>Stop recording</Trans> }}
    >
      {starting ? <Trans>Starting...</Trans> : <Trans>Stop recording</Trans>}
    </FloatingButton>
  );
}

function StartListeningButton({
  sessionId,
  isDisabled,
  warningMessage,
}: {
  sessionId: string;
  isDisabled: boolean;
  warningMessage: string;
}) {
  const startListening = useStartListening(sessionId);
  const openNew = useTabs((state) => state.openNew);
  const noteHasContent = useCurrentNoteHasContent(sessionId, { type: "raw" });

  const handleStart = useCallback(() => {
    if (!isMainWebviewWindow()) {
      void requestMainListenerControl("start", sessionId);
      return;
    }

    void startListening();
  }, [sessionId, startListening]);

  const handleConfigure = useCallback(() => {
    handleStart();
    openNew({ type: "settings", state: { tab: "transcription" } });
  }, [handleStart, openNew]);

  return (
    <div>
      <OptionsMenu
        sessionId={sessionId}
        disabled={isDisabled}
        warningMessage={warningMessage}
        hideUploadActions={noteHasContent}
        onConfigure={handleConfigure}
      >
        <FloatingButton
          onClick={handleStart}
          disabled={isDisabled}
          className="w-[148px] justify-start gap-2 pr-7 pl-3"
          tooltip={
            warningMessage
              ? {
                  side: "top",
                  content: (
                    <ActionableTooltipContent
                      message={warningMessage}
                      action={{
                        label: "Configure",
                        handleClick: handleConfigure,
                      }}
                    />
                  ),
                }
              : undefined
          }
        >
          <span className="flex items-center gap-1.5">
            <RecordingIcon /> Start listening
          </span>
        </FloatingButton>
      </OptionsMenu>
    </div>
  );
}
