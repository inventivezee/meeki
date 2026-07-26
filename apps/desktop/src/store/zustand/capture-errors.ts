import { create } from "zustand";

export type CaptureErrorNotification = {
  id: string;
  message: string;
  variant: "error" | "warning";
};

type CaptureErrorsState = {
  errors: CaptureErrorNotification[];
  report: (error: CaptureErrorNotification) => boolean;
  dismiss: (id: string) => void;
  clear: () => void;
};

export const useCaptureErrors = create<CaptureErrorsState>((set, get) => ({
  errors: [],
  report: (error) => {
    if (get().errors.some((entry) => entry.id === error.id)) {
      return false;
    }
    set((state) => ({ errors: [...state.errors, error] }));
    return true;
  },
  dismiss: (id) => {
    set((state) => ({
      errors: state.errors.filter((entry) => entry.id !== id),
    }));
  },
  clear: () => set({ errors: [] }),
}));

export function reportCaptureErrorOnce(error: CaptureErrorNotification) {
  return useCaptureErrors.getState().report(error);
}

export function captureTranscriptIncompleteErrorId(sessionId: string) {
  return `capture-error:transcript-incomplete:${sessionId}`;
}

export function captureBatchFailedErrorId(sessionId: string) {
  return `capture-error:batch-failed:${sessionId}`;
}
