import { useLingui } from "@lingui/react/macro";
import { SparklesIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@meeki/utils";

import { useShell } from "~/contexts/shell";

/** Long enough that crossing the sphere on the way somewhere else won't open it. */
const HOVER_INTENT_MS = 150;

/**
 * A round, always-visible entry point. The previous CTA was a 2px sliver in a
 * 180px-wide invisible button, so most people never found it and those who did
 * kept opening it by accident from well off to the side.
 */
export function ChatSphere({ ariaLabel }: { ariaLabel?: string }) {
  const { t } = useLingui();
  const { chat } = useShell();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHover = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => cancelHover, []);

  if (chat.mode !== "FloatingClosed") {
    return null;
  }

  const open = () => {
    cancelHover();
    chat.sendEvent({ type: "OPEN" });
  };

  return (
    <button
      type="button"
      data-chat-sphere-trigger
      aria-label={ariaLabel ?? t`Ask Meeki about your notes`}
      onClick={open}
      onPointerEnter={(event) => {
        // Touch fires enter immediately before click; let the click handle it.
        if (event.pointerType === "touch") {
          return;
        }
        cancelHover();
        hoverTimer.current = setTimeout(open, HOVER_INTENT_MS);
      }}
      onPointerLeave={cancelHover}
      className={cn([
        "group/meeki-sphere flex size-12 items-center justify-center rounded-full",
        "bg-[radial-gradient(circle_at_30%_25%,#4a7c59_0%,#2f5d43_55%,#22432f_100%)]",
        "shadow-[0_6px_18px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.28)]",
        "transition-transform duration-150 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
      ])}
    >
      <SparklesIcon className="size-5 text-white/90" />
    </button>
  );
}

export function FloatingChatSphere({ ariaLabel }: { ariaLabel?: string }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto">
        <ChatSphere ariaLabel={ariaLabel} />
      </div>
    </div>
  );
}
