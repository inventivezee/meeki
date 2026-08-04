import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  events as localLlmEvents,
  type GgufLlmModel,
} from "@meeki/plugin-local-llm";
import {
  commands as localSttCommands,
  events as localSttEvents,
  type ServerStatus,
  type LocalModel,
} from "@meeki/plugin-local-stt";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { useConfigValues } from "~/shared/config";
import type { DownloadProgress } from "~/sidebar/toast/types";
import { useTabs } from "~/store/zustand/tabs";
import {
  isConfiguredSttModel,
  isHyprnoteLocalSttModel,
} from "~/stt/capabilities";

/** What one surface's own downloads are doing. */
export interface OwnDownloads {
  /** In-flight or paused entries among the requested keys, in the order asked. */
  entries: DownloadProgress[];
  /** The one to show. Null when none of the caller's models are downloading. */
  current: DownloadProgress | null;
  paused: boolean;
}

interface NotificationState {
  hasActiveBanner: boolean;
  hasActiveEnhancement: boolean;
  hasActiveDownload: boolean;
  downloadingModel: string | null;
  activeDownloads: DownloadProgress[];
  /**
   * Downloads among the given model keys. Surfaces must use this rather than
   * indexing activeDownloads: that array is Map insertion order, so a card
   * reading [0] reports whichever model emitted first — which is how the
   * on-device setup card ended up showing an STT percentage under a heading
   * about the whole bundle.
   */
  downloadsFor: (keys: readonly string[]) => OwnDownloads;
  notificationCount: number;
  shouldShowBadge: boolean;
  localSttStatus: ServerStatus | null;
  isLocalSttModel: boolean;
}

const NotificationContext = createContext<NotificationState | null>(null);

type TrackedModel = LocalModel | GgufLlmModel;

type DownloadSnapshot = {
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  paused: boolean;
};

/// Mirrors SoniqoModel::display_name and GgufLlmModel::display_name. The table
/// used to cover only the STT models, and the `?? model` fallback printed a raw
/// id — which is how "soniqo-qwen3-large" reached a user-facing card.
const MODEL_DISPLAY_NAMES: Partial<Record<TrackedModel, string>> = {
  "soniqo-parakeet-streaming": "Soniqo Parakeet Streaming",
  "soniqo-parakeet-batch": "Soniqo Parakeet Batch",
  "soniqo-omnilingual": "Soniqo Omnilingual",
  "soniqo-qwen3-small": "Soniqo Qwen3 0.6B",
  "soniqo-qwen3-large": "Soniqo Qwen3 1.7B",
  "am-parakeet-v2": "Parakeet v2",
  "am-parakeet-v3": "Parakeet v3",
  "am-whisper-large-v3": "Whisper Large v3",
  QuantizedTinyEn: "Whisper Tiny (English)",
  QuantizedSmallEn: "Whisper Small (English)",
  "qwen3.6-35b-a3b": "Qwen 3.6 35B A3B",
  "qwen3.6-35b-a3b-q4km": "Qwen 3.6 35B A3B (Q4_K_M)",
  "gemma-4-26b-a4b": "Gemma 4 26B A4B",
  "gemma-4-12b": "Gemma 4 12B",
  "qwen3-4b": "Qwen 3 4B",
  "llama-3.3-70b": "Llama 3.3 70B",
  Llama3p2_3bQ4: "Llama 3.2 3B Q4",
  Gemma3_4bQ4: "Gemma 3 4B Q4",
  HyprLLM: "HyprLLM",
};

function displayName(model: TrackedModel) {
  // Never fall back to the key: a raw id in the UI is a bug, not a label.
  return MODEL_DISPLAY_NAMES[model] ?? "a language model";
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const {
    current_stt_provider,
    current_stt_model,
    current_llm_provider,
    current_llm_model,
  } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
    "current_llm_provider",
    "current_llm_model",
  ] as const);

  const hasConfigBanner =
    !isConfiguredSttModel(current_stt_provider, current_stt_model) ||
    !current_llm_provider ||
    !current_llm_model;

  const sttModel = isHyprnoteLocalSttModel(
    current_stt_provider,
    current_stt_model,
  )
    ? current_stt_model
    : null;
  const isLocalSttModel = !!sttModel;

  const localSttQuery = useQuery({
    enabled: isLocalSttModel,
    queryKey: ["local-stt-status", sttModel],
    refetchInterval: 1000,
    queryFn: async () => {
      if (!sttModel) return null;

      const serverResult = await localSttCommands.getServerForModel(sttModel);
      if (serverResult.status !== "ok") return null;

      return serverResult.data?.status ?? null;
    },
  });

  const localSttStatus = isLocalSttModel ? (localSttQuery.data ?? null) : null;

  const [activeDownloads, setActiveDownloads] = useState<
    Map<TrackedModel, DownloadSnapshot>
  >(new Map());

  useEffect(() => {
    // Both plugins emit the same payload shape. Listening app-wide rather than
    // per-component is what lets a settings tab re-attach to a download that
    // started before it mounted.
    const subscribe = (
      listen: typeof localSttEvents.downloadProgressPayload.listen,
    ) =>
      listen((event) => {
        const { model: eventModel, status } = event.payload;
        const isFailed = typeof status === "object" && "failed" in status;

        if (isFailed) {
          const modelName = displayName(eventModel);
          sonnerToast.error(`Couldn’t download ${modelName}`, {
            description: status.failed,
          });
        }

        setActiveDownloads((prev) => {
          const next = new Map(prev);
          if (isFailed || status === "completed") {
            next.delete(eventModel);
          } else if (typeof status === "object" && "paused" in status) {
            const { downloadedBytes, totalBytes } = status.paused;
            next.set(eventModel, {
              progress:
                totalBytes > 0
                  ? Math.round((downloadedBytes / totalBytes) * 100)
                  : 0,
              downloadedBytes,
              totalBytes,
              paused: true,
            });
          } else if (typeof status === "object" && "downloading" in status) {
            const { percent, downloadedBytes, totalBytes } = status.downloading;
            next.set(eventModel, {
              progress: Math.max(0, Math.min(100, percent)),
              downloadedBytes,
              totalBytes,
              paused: false,
            });
          }
          return next;
        });
      });

    const unlisteners = [
      subscribe(localSttEvents.downloadProgressPayload.listen),
      subscribe(localLlmEvents.downloadProgressPayload.listen),
    ];

    return () => {
      for (const unlisten of unlisteners) {
        void unlisten.then((fn) => fn());
      }
    };
  }, []);

  const hasActiveEnhancement = false;

  const currentTab = useTabs(
    (state: {
      currentTab: ReturnType<typeof useTabs.getState>["currentTab"];
    }) => state.currentTab,
  );
  const isAiTab =
    currentTab?.type === "settings" &&
    ["transcription", "intelligence"].includes(currentTab.state?.tab ?? "");

  const value = useMemo<NotificationState>(() => {
    const hasActiveBanner = hasConfigBanner && !isAiTab;
    const hasActiveDownload = activeDownloads.size > 0;

    const downloadsArray: DownloadProgress[] = Array.from(
      activeDownloads.entries(),
    ).map(([model, snapshot]) => ({
      model,
      displayName: displayName(model),
      ...snapshot,
    }));

    const firstDownload = downloadsArray[0];
    const downloadingModel = firstDownload?.displayName ?? null;

    const notificationCount =
      (hasActiveBanner ? 1 : 0) +
      (hasActiveEnhancement ? 1 : 0) +
      (hasActiveDownload ? 1 : 0);

    const downloadsFor = (keys: readonly string[]): OwnDownloads => {
      const entries = keys
        .map((key) => downloadsArray.find((entry) => entry.model === key))
        .filter((entry): entry is DownloadProgress => entry !== undefined);
      return {
        entries,
        current: entries[0] ?? null,
        paused: entries.some((entry) => entry.paused),
      };
    };

    return {
      hasActiveBanner,
      hasActiveEnhancement,
      hasActiveDownload,
      downloadingModel,
      activeDownloads: downloadsArray,
      downloadsFor,
      notificationCount,
      shouldShowBadge: notificationCount > 0,
      localSttStatus,
      isLocalSttModel,
    };
  }, [
    hasConfigBanner,
    hasActiveEnhancement,
    activeDownloads,
    isAiTab,
    localSttStatus,
    isLocalSttModel,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  hasActiveBanner: false,
  hasActiveEnhancement: false,
  hasActiveDownload: false,
  downloadingModel: null,
  activeDownloads: [],
  downloadsFor: () => ({ entries: [], current: null, paused: false }),
  notificationCount: 0,
  shouldShowBadge: false,
  localSttStatus: null,
  isLocalSttModel: false,
};

export function useNotifications() {
  const context = useContext(NotificationContext);
  return context ?? DEFAULT_NOTIFICATION_STATE;
}
