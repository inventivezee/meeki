import { Button } from "@meeki/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meeki/ui/components/ui/dialog";

import { displayModelId } from "~/settings/ai/stt/shared";

export type RetranscribeConfirmKind = "same_model" | "different_model";

export function formatSttModelLabel(provider: string, model: string) {
  const modelLabel = displayModelId(model);
  if (!provider || provider === "soniqo" || provider === "hyprnote") {
    return modelLabel;
  }
  return `${provider} · ${modelLabel}`;
}

export function RetranscribeConfirmDialog({
  open,
  kind,
  previousLabel,
  nextLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  kind: RetranscribeConfirmKind;
  previousLabel: string;
  nextLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isSame = kind === "same_model";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="border-border/45 bg-card/95 w-[calc(100vw-48px)] max-w-[360px] gap-0 overflow-hidden rounded-[26px] p-0 shadow-[0_24px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:rounded-[26px] [&>button:last-child]:hidden">
        <DialogHeader className="items-center gap-2 px-5 pt-7 text-center sm:text-center">
          <DialogTitle className="text-foreground text-[13px] leading-5 font-semibold tracking-normal">
            {isSame ? "Batch already done" : "Replace transcript?"}
          </DialogTitle>
          <DialogDescription className="text-foreground max-w-[300px] text-center text-[13px] leading-[1.36]">
            {isSame ? (
              <>
                This session was already batched with{" "}
                <span className="font-medium">{previousLabel}</span>. You can
                run it again with the same model.
              </>
            ) : (
              <>
                This will replace the transcript from{" "}
                <span className="font-medium">{previousLabel}</span> with a new
                batch using <span className="font-medium">{nextLabel}</span>.
                Any summary generated from the old transcript may also be
                regenerated.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 px-4 pt-4 pb-4 sm:grid-cols-2 sm:justify-normal">
          <Button
            variant="ghost"
            className="bg-accent/80 text-foreground hover:bg-accent hover:text-foreground h-8 rounded-full px-4 text-xs font-medium shadow-none"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-full px-4 text-xs font-medium shadow-sm dark:bg-white dark:text-black dark:hover:bg-white/90"
            onClick={onConfirm}
          >
            {isSame ? "Run again" : "Replace & batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
