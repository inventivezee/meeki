import { Trans } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { cn } from "@hypr/utils";

import { useLocalLlmWarmup } from "~/ai/local-llm-warmup";

const TICK_MS = 250;
/** The estimate is disk-bound and routinely wrong; never claim to be finished. */
const CEILING_PERCENT = 95;

/**
 * Shown while the on-device model reloads after sleeping. The countdown is a
 * soft estimate, so once it runs out the bar stops advancing and switches to an
 * indeterminate pulse rather than sitting at 100% pretending to be done.
 */
export function ModelWarmingUp({ className }: { className?: string }) {
  const warmup = useLocalLlmWarmup();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!warmup) {
      setElapsedMs(0);
      return;
    }

    const update = () => setElapsedMs(Date.now() - warmup.startedAt);
    update();
    const timer = setInterval(update, TICK_MS);
    return () => clearInterval(timer);
  }, [warmup]);

  if (!warmup) {
    return null;
  }

  const overrun = elapsedMs >= warmup.estimateMs;
  const percent = overrun
    ? CEILING_PERCENT
    : Math.max(
        4,
        Math.round((elapsedMs / warmup.estimateMs) * CEILING_PERCENT),
      );
  const secondsLeft = Math.max(
    1,
    Math.ceil((warmup.estimateMs - elapsedMs) / 1_000),
  );

  return (
    <div
      className={cn(["flex flex-col gap-1.5", className])}
      role="status"
      aria-live="polite"
    >
      <p className="text-muted-foreground text-xs leading-5">
        {overrun ? (
          <Trans>Loading the on-device model — still going...</Trans>
        ) : (
          <Trans>Loading the on-device model — about {secondsLeft}s left</Trans>
        )}
      </p>
      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={overrun ? undefined : percent}
      >
        <div
          className={cn([
            "bg-foreground/80 h-full rounded-full transition-[width] duration-300 ease-out",
            overrun && "animate-pulse",
          ])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
