import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  commands as localSttCommands,
  type LocalModel,
} from "@hypr/plugin-local-stt";
import { sonnerToast } from "@hypr/ui/components/ui/toast";

import { useBillingAccess } from "~/auth/billing-context";
import { useToastAction } from "~/store/zustand/toast-action";
import {
  modelsForOnDeviceDownload,
  ON_DEVICE_STT_PACK,
} from "~/stt/on-device-pack";

type SttSettingsContextType = {
  accordionValue: string;
  setAccordionValue: (value: string) => void;
  startDownload: (model: LocalModel) => void;
  startOnDevicePackDownload: () => void;
  queuedDownloads: LocalModel[];
  startTrial: () => void;
};

const SttSettingsContext = createContext<SttSettingsContextType | null>(null);

const DOWNLOAD_PROGRESS_GRACE_MS = 10_000;

export function SttSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accordionValue, setAccordionValue] = useState<string>("");
  const { upgradeToPro } = useBillingAccess();

  const toastActionTarget = useToastAction((state) => state.target);
  const clearToastActionTarget = useToastAction((state) => state.clearTarget);

  useEffect(() => {
    if (toastActionTarget === "stt") {
      clearToastActionTarget();
    }
  }, [toastActionTarget, clearToastActionTarget]);

  const [queuedDownloads, setQueuedDownloads] = useState<LocalModel[]>([]);
  const queuedDownloadsRef = useRef<Set<LocalModel>>(new Set());

  const enqueueDownload = useCallback((model: LocalModel) => {
    if (queuedDownloadsRef.current.has(model)) {
      return;
    }

    const dequeue = () => {
      queuedDownloadsRef.current.delete(model);
      setQueuedDownloads([...queuedDownloadsRef.current]);
    };

    queuedDownloadsRef.current.add(model);
    setQueuedDownloads([...queuedDownloadsRef.current]);
    void localSttCommands.downloadModel(model).then(
      (result) => {
        if (result.status === "error") {
          sonnerToast.error("Model download couldn’t start", {
            description: result.error,
          });
          dequeue();
          return;
        }

        // The command resolves when the download starts, not when it finishes.
        setTimeout(dequeue, DOWNLOAD_PROGRESS_GRACE_MS);
      },
      (error) => {
        sonnerToast.error("Model download couldn’t start", {
          description: error instanceof Error ? error.message : String(error),
        });
        dequeue();
      },
    );
  }, []);

  const startDownload = useCallback(
    (model: LocalModel) => {
      for (const next of modelsForOnDeviceDownload(model)) {
        enqueueDownload(next);
      }
    },
    [enqueueDownload],
  );

  const startOnDevicePackDownload = useCallback(() => {
    sonnerToast.message("Downloading on-device transcription", {
      description:
        "Parakeet (live preview) and Qwen3 Large (final transcript) from Hugging Face.",
      id: "on-device-stt-pack-download",
    });
    for (const model of ON_DEVICE_STT_PACK) {
      enqueueDownload(model);
    }
  }, [enqueueDownload]);

  const startTrial = useCallback(() => {
    upgradeToPro();
  }, [upgradeToPro]);

  return (
    <SttSettingsContext.Provider
      value={{
        accordionValue,
        setAccordionValue,
        startDownload,
        startOnDevicePackDownload,
        queuedDownloads,
        startTrial,
      }}
    >
      {children}
    </SttSettingsContext.Provider>
  );
}

export function useSttSettings() {
  const context = useContext(SttSettingsContext);
  if (!context) {
    throw new Error("useSttSettings must be used within SttSettingsProvider");
  }
  return context;
}
