import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, DownloadIcon, RotateCwIcon } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import {
  commands as updaterCommands,
  events as updaterEvents,
  type Result,
} from "@meeki/plugin-updater2";
import { sonnerToast } from "@meeki/ui/components/ui/toast";
import { cn } from "@meeki/utils";

import { useMountEffect } from "~/shared/hooks/useMountEffect";
import { useDevtoolsOtaPreview } from "~/store/zustand/devtools-ota-preview";

export type UpdateBannerStatus =
  | "available"
  | "downloading"
  | "ready"
  | "failed";

export type DesktopUpdateControl = {
  status: UpdateBannerStatus | null;
  version: string | null;
  progress: number | null;
  errorMessage: string | null;
  downloadStarting: boolean;
  installing: boolean;
  downloadUpdate: () => void;
  installUpdate: () => void;
};

type UpdateEventState = {
  status: UpdateBannerStatus;
  version: string;
  downloadedBytes: number;
  contentLength: number | null;
  errorMessage: string | null;
};

type UpdateCheckState = {
  version: string;
  ready: boolean;
} | null;

const UPDATE_CHECK_QUERY_KEY = ["updater2", "check"] as const;
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useDesktopUpdateControl(): DesktopUpdateControl {
  const [eventState, setEventState] = useState<UpdateEventState | null>(null);
  const [acknowledgedVersion, setAcknowledgedVersion] = useState<string | null>(
    null,
  );
  const devtoolsPreview = useDevtoolsOtaPreview((state) => state.preview);
  const showDevtoolsOtaPreview = useDevtoolsOtaPreview(
    (state) => state.showPreview,
  );
  const clearDevtoolsOtaPreview = useDevtoolsOtaPreview(
    (state) => state.clearPreview,
  );

  useMountEffect(() => {
    let cancelled = false;
    const unlistenFns: Array<() => void> = [];

    const listen = async () => {
      const [
        unlistenAvailable,
        unlistenDownloading,
        unlistenProgress,
        unlistenReady,
        unlistenFailed,
        unlistenUpdated,
      ] = await Promise.all([
        updaterEvents.updateAvailableEvent.listen(({ payload }) => {
          setEventState((current) =>
            current?.version === payload.version &&
            (current.status === "downloading" ||
              current.status === "ready" ||
              current.status === "failed")
              ? current
              : {
                  status: "available",
                  version: payload.version,
                  downloadedBytes: 0,
                  contentLength: null,
                  errorMessage: null,
                },
          );
        }),
        updaterEvents.updateDownloadingEvent.listen(({ payload }) => {
          setEventState({
            status: "downloading",
            version: payload.version,
            downloadedBytes: 0,
            contentLength: null,
            errorMessage: null,
          });
        }),
        updaterEvents.updateDownloadProgressEvent.listen(({ payload }) => {
          setEventState((current) => {
            const downloadedBytes =
              current?.version === payload.version
                ? current.downloadedBytes + payload.chunk_length
                : payload.chunk_length;

            return {
              status: "downloading",
              version: payload.version,
              downloadedBytes,
              contentLength: payload.content_length,
              errorMessage: null,
            };
          });
        }),
        updaterEvents.updateReadyEvent.listen(({ payload }) => {
          setEventState((previous) => {
            // The bytes being cached is not news after an install failed: a
            // periodic check re-emits this, and clobbering "failed" is what
            // made the icon oscillate between download and restart forever.
            if (previous?.status === "failed") {
              return previous;
            }
            return {
              status: "ready",
              version: payload.version,
              downloadedBytes: 0,
              contentLength: null,
              errorMessage: null,
            };
          });
        }),
        updaterEvents.updateDownloadFailedEvent.listen(({ payload }) => {
          setEventState({
            status: "failed",
            version: payload.version,
            downloadedBytes: 0,
            contentLength: null,
            errorMessage: "Failed to download update.",
          });
        }),
        updaterEvents.updatedEvent.listen(({ payload }) => {
          setAcknowledgedVersion(payload.current);
          setEventState(null);
        }),
      ]);

      if (cancelled) {
        unlistenAvailable();
        unlistenDownloading();
        unlistenProgress();
        unlistenReady();
        unlistenFailed();
        unlistenUpdated();
        return;
      }

      unlistenFns.push(
        unlistenAvailable,
        unlistenDownloading,
        unlistenProgress,
        unlistenReady,
        unlistenFailed,
        unlistenUpdated,
      );
    };

    void listen();

    return () => {
      cancelled = true;
      unlistenFns.forEach((unlisten) => unlisten());
    };
  });

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- The state setter reconciles updater events and is not part of the update-check identity.
  const updateCheck = useQuery({
    queryKey: UPDATE_CHECK_QUERY_KEY,
    queryFn: async (): Promise<UpdateCheckState> => {
      const version = unwrapResult(await updaterCommands.check());

      if (!version) {
        setEventState((current) =>
          current?.status === "available" ? null : current,
        );
        return null;
      }

      const nextUpdate = {
        version,
        ready: unwrapResult(await updaterCommands.isDownloaded(version)),
      };

      setEventState((current) =>
        current?.status === "available" && current.version !== version
          ? null
          : current,
      );

      return nextUpdate;
    },
    refetchInterval: UPDATE_CHECK_INTERVAL_MS,
    retry: false,
    staleTime: UPDATE_CHECK_INTERVAL_MS,
  });

  const { mutate: downloadUpdate, isPending: downloadStarting } = useMutation({
    mutationFn: async (version: string) =>
      unwrapResult(await updaterCommands.download(version)),
    onMutate: (version) => {
      setEventState({
        status: "downloading",
        version,
        downloadedBytes: 0,
        contentLength: null,
        errorMessage: null,
      });
    },
    onError: (error, version) => {
      setEventState({
        status: "failed",
        version,
        downloadedBytes: 0,
        contentLength: null,
        errorMessage: readErrorMessage(error),
      });
    },
    onSuccess: (_data, version) => {
      setEventState((current) =>
        current?.status === "ready"
          ? current
          : {
              status: "ready",
              version,
              downloadedBytes: 0,
              contentLength: null,
              errorMessage: null,
            },
      );
    },
  });

  const { mutate: installUpdate, isPending: installing } = useMutation({
    mutationFn: async (version: string) => {
      const result = unwrapResult(await updaterCommands.install(version));
      unwrapResult(await updaterCommands.postinstall(result));
    },
    onError: (error, version) => {
      const message = readErrorMessage(error);
      setEventState({
        status: "failed",
        version,
        downloadedBytes: 0,
        contentLength: null,
        errorMessage: message,
      });
      // A 28px icon button has nowhere to put this, and it was going nowhere
      // else — errorMessage was returned by the hook and read by no one.
      sonnerToast.error("Couldn’t install the update", {
        id: "update-install-failed",
        description: message,
      });
    },
  });

  const checkedUpdate =
    updateCheck.data && updateCheck.data.version !== acknowledgedVersion
      ? updateCheck.data
      : null;
  const version = eventState?.version ?? checkedUpdate?.version ?? null;
  const eventStatus =
    eventState?.status === "available" &&
    checkedUpdate?.version === eventState.version &&
    checkedUpdate.ready
      ? "ready"
      : eventState?.status;
  const status: UpdateBannerStatus | null = eventStatus
    ? eventStatus
    : checkedUpdate
      ? checkedUpdate.ready
        ? "ready"
        : "available"
      : null;
  const progress = useMemo(() => {
    if (
      !eventState ||
      eventState.status !== "downloading" ||
      !eventState.contentLength
    ) {
      return null;
    }

    return Math.max(
      0,
      Math.min(1, eventState.downloadedBytes / eventState.contentLength),
    );
  }, [eventState]);

  const handleDownload = useCallback(() => {
    if (!version) {
      return;
    }
    downloadUpdate(version);
  }, [downloadUpdate, version]);

  const handleInstall = useCallback(() => {
    if (!version) {
      return;
    }
    installUpdate(version);
  }, [installUpdate, version]);

  const handleDevtoolsDownload = useCallback(() => {
    showDevtoolsOtaPreview("downloading");
  }, [showDevtoolsOtaPreview]);

  const handleDevtoolsInstall = useCallback(() => {
    clearDevtoolsOtaPreview();
  }, [clearDevtoolsOtaPreview]);

  if (devtoolsPreview) {
    return {
      status: devtoolsPreview.status,
      version: devtoolsPreview.version,
      progress: devtoolsPreview.progress,
      errorMessage:
        devtoolsPreview.status === "failed"
          ? "Devtools OTA failure preview."
          : null,
      downloadStarting: false,
      installing: false,
      downloadUpdate: handleDevtoolsDownload,
      installUpdate: handleDevtoolsInstall,
    };
  }

  return {
    status,
    version,
    progress,
    errorMessage: eventState?.errorMessage ?? null,
    downloadStarting,
    installing,
    downloadUpdate: handleDownload,
    installUpdate: handleInstall,
  };
}

export function SidebarTimelineUpdateButton({
  update,
}: {
  update: DesktopUpdateControl;
}) {
  if (!update.status || !update.version) {
    return null;
  }

  const isDownloading = update.status === "downloading";
  const isReady = update.status === "ready";
  const label = sidebarUpdateLabel(update.status, update.progress);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tauri-drag-region="false"
      disabled={isDownloading || update.downloadStarting || update.installing}
      className={cn([
        "relative flex h-7 min-h-7 w-7 min-w-7 shrink-0 items-center justify-center rounded-full p-0",
        "bg-blue-500 text-white shadow-sm transition-colors hover:bg-blue-600",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden",
        "disabled:cursor-default disabled:bg-blue-500 disabled:text-white disabled:opacity-70 disabled:hover:bg-blue-500",
      ])}
      onClick={
        isReady || update.status === "failed"
          ? update.installUpdate
          : update.downloadUpdate
      }
    >
      {isDownloading ? (
        <SidebarCircularProgress progress={update.progress} />
      ) : (
        <span className="relative z-10 flex items-center justify-center">
          {sidebarActionIcon(update.status)}
        </span>
      )}
    </button>
  );
}

function SidebarCircularProgress({ progress }: { progress: number | null }) {
  const pct = Math.max(0, Math.min(1, progress ?? 0));
  const radius = 7.5;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 -rotate-90"
      viewBox="0 0 18 18"
    >
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />
      <circle
        cx="9"
        cy="9"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - pct)}
        className="transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  );
}

function sidebarUpdateLabel(
  status: UpdateBannerStatus,
  progress: number | null,
): string {
  if (status === "ready") {
    return "Restart to update";
  }

  if (status === "downloading") {
    if (progress === null) {
      return "Downloading update";
    }

    return `Downloading update, ${Math.round(progress * 100)}% complete`;
  }

  if (status === "failed") {
    return "Retry update";
  }

  return "Download update";
}

function sidebarActionIcon(status: UpdateBannerStatus): ReactNode {
  if (status === "ready") {
    return <RotateCwIcon size={14} aria-hidden="true" />;
  }

  // Distinct from "available": they were pixel-identical, so a failed install
  // was indistinguishable from an update waiting to be fetched.
  if (status === "failed") {
    return <AlertTriangleIcon size={14} aria-hidden="true" />;
  }

  return <DownloadIcon size={14} aria-hidden="true" />;
}

function unwrapResult<T>(result: Result<T, string>): T {
  if (result.status === "ok") {
    return result.data;
  }

  throw new Error(result.error);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown update error.";
}
