import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { create } from "zustand";

import { Button } from "@meeki/ui/components/ui/button";
import { Checkbox } from "@meeki/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meeki/ui/components/ui/dialog";

export type BulkImportChoice = { transcribe: boolean; summarize: boolean };

type PromptState = {
  request: {
    count: number;
    resolve: (choice: BulkImportChoice | null) => void;
  } | null;
};

const usePrompt = create<PromptState>(() => ({ request: null }));

/**
 * Asks what to do with a batch before any of it is copied.
 *
 * Transcribing several hundred recordings is many hours of compute, so it is a
 * decision, not a default — but asking after the import has already finished
 * means the answer arrives long after the user has walked away. This runs while
 * they are still at the keyboard.
 *
 * Resolves `null` if they cancel, which abandons the import entirely: nothing
 * has been copied yet.
 */
export function askBulkImportChoice(
  count: number,
): Promise<BulkImportChoice | null> {
  return new Promise((resolve) => {
    usePrompt.setState({ request: { count, resolve } });
  });
}

export function BulkImportPrompt() {
  const request = usePrompt((state) => state.request);

  if (!request) {
    return null;
  }

  return <BulkImportPromptDialog key={request.count} request={request} />;
}

function BulkImportPromptDialog({
  request,
}: {
  request: NonNullable<PromptState["request"]>;
}) {
  const { t } = useLingui();
  const [transcribe, setTranscribe] = useState(true);
  const [summarize, setSummarize] = useState(true);

  const settle = (choice: BulkImportChoice | null) => {
    usePrompt.setState({ request: null });
    request.resolve(choice);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          settle(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Import {request.count} recordings</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Each recording becomes its own note. Processing them runs one at a
              time and can take many hours; you can stop it at any point and
              pick up where it left off.
            </Trans>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <ChoiceRow
            id="bulk-import-transcribe"
            label={t`Transcribe all`}
            hint={t`Turn every recording into a transcript.`}
            checked={transcribe}
            onChange={(next) => {
              setTranscribe(next);
              // A summary is written from a transcript, so it cannot outlive
              // the choice not to make one.
              if (!next) {
                setSummarize(false);
              }
            }}
          />
          <ChoiceRow
            id="bulk-import-summarize"
            label={t`Summarize all`}
            hint={
              transcribe
                ? t`Write a summary note from each transcript.`
                : t`Needs transcripts.`
            }
            checked={summarize}
            disabled={!transcribe}
            onChange={setSummarize}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => settle(null)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button onClick={() => settle({ transcribe, summarize })}>
            <Trans>Import</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceRow({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={
        disabled
          ? "flex cursor-not-allowed items-start gap-3 opacity-50"
          : "flex cursor-pointer items-start gap-3"
      }
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
        className="mt-0.5"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </span>
    </label>
  );
}
