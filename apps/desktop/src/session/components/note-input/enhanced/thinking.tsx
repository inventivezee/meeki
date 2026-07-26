import { Trans } from "@lingui/react/macro";
import { BrainIcon } from "lucide-react";

import { Disclosure } from "~/chat/components/message/shared";

/** Reasoning trace shown while a thinking-mode model works. Not persisted. */
export function ThinkingDisclosure({
  reasoning,
  isGenerating,
}: {
  reasoning: string | undefined;
  isGenerating: boolean;
}) {
  const text = reasoning?.trim();
  if (!text) {
    return null;
  }

  return (
    <Disclosure
      icon={<BrainIcon className="h-3 w-3" />}
      title={
        isGenerating ? <Trans>Thinking...</Trans> : <Trans>Thinking</Trans>
      }
    >
      <div className="text-muted-foreground text-sm whitespace-pre-wrap">
        {text}
      </div>
    </Disclosure>
  );
}
