import { Trans } from "@lingui/react/macro";
import { Loader2 } from "lucide-react";

import { MessageBubble, MessageContainer } from "./shared";

import { useLocalLlmWarmup } from "~/ai/local-llm-warmup";
import { ModelWarmingUp } from "~/shared/ui/model-warming-up";

export function LoadingMessage() {
  const warmup = useLocalLlmWarmup();

  return (
    <MessageContainer align="start">
      <MessageBubble variant="loading">
        {warmup ? (
          <ModelWarmingUp className="min-w-48" />
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">
              <Trans>Thinking...</Trans>
            </span>
          </div>
        )}
      </MessageBubble>
    </MessageContainer>
  );
}
