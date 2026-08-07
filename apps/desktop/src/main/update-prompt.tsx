import { Trans } from "@lingui/react/macro";
import { Loader2, XIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@meeki/utils";

import type { DesktopUpdateControl } from "./update-banner";

/**
 * The visible half of the updater.
 *
 * Updates already download on their own — plugins/updater2 checks and fetches
 * every thirty minutes — but the only thing that ever said so was a 28px circle
 * in the sidebar header, which reads as decoration rather than an offer. A
 * finished download would sit installed-ready indefinitely because nothing
 * asked.
 *
 * Anchored bottom-left, out of the way of the note itself, and dismissible: an
 * update prompt that cannot be dismissed is a nag, and the sidebar button is
 * still there for anyone who dismisses this and changes their mind.
 */
export function UpdatePrompt({ update }: { update: DesktopUpdateControl }) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  if (!update.status || !update.version) {
    return null;
  }

  // Dismissal is per version, so the next release asks again.
  if (dismissedVersion === update.version) {
    return null;
  }

  const busy =
    update.status === "downloading" ||
    update.downloadStarting ||
    update.installing;
  const ready = update.status === "ready";
  const failed = update.status === "failed";

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-50 max-w-[280px]">
      <div
        role="status"
        className={cn([
          "pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm backdrop-blur",
          failed
            ? "border-amber-300/70 bg-amber-50/95 dark:border-amber-500/40 dark:bg-amber-950/80"
            : "border-blue-300/70 bg-blue-50/95 dark:border-blue-500/40 dark:bg-blue-950/80",
        ])}
      >
        <button
          type="button"
          disabled={busy}
          onClick={
            ready || failed ? update.installUpdate : update.downloadUpdate
          }
          className={cn([
            "flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium",
            failed
              ? "text-amber-900 dark:text-amber-100"
              : "text-blue-900 dark:text-blue-100",
            busy ? "cursor-default" : "cursor-pointer hover:underline",
          ])}
        >
          {busy ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <span
              className={cn([
                "size-2 shrink-0 rounded-full",
                failed ? "bg-amber-500" : "bg-blue-500",
              ])}
            />
          )}
          <span className="truncate">
            {failed ? (
              <Trans>Update failed — click to retry</Trans>
            ) : update.status === "downloading" ? (
              <Trans>Downloading update…</Trans>
            ) : ready ? (
              <Trans>New update released, click to update</Trans>
            ) : (
              <Trans>New update available, click to download</Trans>
            )}
          </span>
        </button>

        <button
          type="button"
          aria-label="Dismiss update notice"
          onClick={() => setDismissedVersion(update.version)}
          className={cn([
            "shrink-0 rounded p-0.5 transition-opacity hover:opacity-100",
            failed
              ? "text-amber-900/60 dark:text-amber-100/60"
              : "text-blue-900/60 dark:text-blue-100/60",
          ])}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
