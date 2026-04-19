import React, { useState } from "react";
import { Icon } from "@mdi/react";
import { mdiAlert, mdiClose, mdiRefresh, mdiContentCopy } from "@mdi/js";
import { CopyButton } from "./CopyButton";

interface Props {
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  /** Character cutoff before collapsing. Defaults to 240. */
  collapseThreshold?: number;
}

/**
 * Banner shown for LLM/provider errors surfaced from `agent_end`.
 * - Truncates long messages with a Show more / Show less toggle.
 * - Optional Retry button (e.g. continue the session).
 * - Always copyable; dismiss button optional.
 */
export function ErrorBanner({ message, onDismiss, onRetry, collapseThreshold = 240 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > collapseThreshold;
  const displayText = !isLong || expanded ? message : `${message.slice(0, collapseThreshold).trimEnd()}…`;

  return (
    <div data-testid="error-banner" className="mt-4 mb-2 mx-auto max-w-2xl">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 flex items-start gap-2">
        <Icon path={mdiAlert} size={0.7} className="text-red-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div
            data-testid="error-banner-text"
            className="text-sm text-red-300 whitespace-pre-wrap break-words"
          >
            {displayText}
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {isLong && (
              <button
                data-testid="error-banner-toggle"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs text-red-300 hover:text-red-200 underline-offset-2 hover:underline"
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
            {onRetry && (
              <button
                data-testid="error-banner-retry"
                onClick={onRetry}
                title="Retry (continue session)"
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-red-500/40 text-red-200 hover:bg-red-500/15"
              >
                <Icon path={mdiRefresh} size={0.55} />
                Retry
              </button>
            )}
            <CopyButton
              text={message}
              icon={<Icon path={mdiContentCopy} size={0.6} />}
              title="Copy error message"
            />
          </div>
        </div>
        {onDismiss && (
          <button
            data-testid="error-banner-dismiss"
            onClick={onDismiss}
            className="text-red-400 hover:text-red-300 shrink-0"
            title="Dismiss"
          >
            <Icon path={mdiClose} size={0.6} />
          </button>
        )}
      </div>
    </div>
  );
}
