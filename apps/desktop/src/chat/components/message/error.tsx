import { Trans, useLingui } from "@lingui/react/macro";
import { ExternalLink, RotateCcw } from "lucide-react";

import { commands as openerCommands } from "@meeki/plugin-opener2";

import { ActionButton, MessageBubble, MessageContainer } from "./shared";

import { env } from "~/env";

const WEB_APP_BASE_URL = env.VITE_APP_URL ?? "http://localhost:3000";

/**
 * The SDK types this as an Error, but a transport failure can surface as a
 * plain object or a string — and reading `.message` off one of those crashed
 * the whole app, because this runs inside render and takes the error boundary
 * with it. The one place guaranteed to be handed a broken value should not be
 * the one place that assumes a good one.
 */
function errorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return "";
}

function isContextLengthError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    (lowerMessage.includes("n_keep") && lowerMessage.includes("n_ctx")) ||
    (lowerMessage.includes("context") && lowerMessage.includes("exceeds")) ||
    lowerMessage.includes("context length") ||
    lowerMessage.includes("context size")
  );
}

export function ErrorMessage({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useLingui();
  const message = errorText(error);
  const showContextLengthHelp = isContextLengthError(message);

  const handleOpenFaq = () => {
    void openerCommands.openUrl(
      `${WEB_APP_BASE_URL}/docs/faq/local-llm-setup#context-length-error`,
      null,
    );
  };

  return (
    <MessageContainer align="start">
      <MessageBubble variant="error" withActionButton={!!onRetry}>
        <p className="text-sm">
          {message || t`Something went wrong. Please try again.`}
        </p>
        {showContextLengthHelp && (
          <button
            onClick={handleOpenFaq}
            className="mt-2 flex items-center gap-1 text-xs text-red-700 underline hover:text-red-900"
          >
            <ExternalLink className="h-3 w-3" />
            <Trans>Learn how to fix this</Trans>
          </button>
        )}
        {onRetry && (
          <ActionButton
            onClick={onRetry}
            variant="error"
            icon={RotateCcw}
            label={t`Retry`}
          />
        )}
      </MessageBubble>
    </MessageContainer>
  );
}
