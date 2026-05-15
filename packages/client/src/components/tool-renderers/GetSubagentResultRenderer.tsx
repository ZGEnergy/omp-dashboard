/**
 * Custom renderer for the get_subagent_result tool.
 * Shows agent ID and result, plus a "Show details" button that opens
 * the subagent popout route in a new tab (add-subagent-inspector).
 */
import React from "react";
import { Icon } from "@mdi/react";
import { mdiOpenInNew } from "@mdi/js";
import type { ToolRendererProps } from "./types.js";
import { MarkdownContent } from "../MarkdownContent.js";

export function GetSubagentResultRenderer({ args, status, result, context }: ToolRendererProps) {
  const agentId = (args?.agent_id as string) ?? "unknown";
  const isRunning = result?.includes("still running");
  const sessionId = context?.sessionId;
  const popoutUrl = sessionId && agentId !== "unknown"
    ? `/session/${sessionId}/subagent/${agentId}`
    : undefined;

  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
        <span className="font-mono">{agentId}</span>
        {isRunning && <span className="text-yellow-400">still running</span>}
        {status === "running" && <span className="text-yellow-400">fetching…</span>}
        {popoutUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(popoutUrl, "_blank");
            }}
            className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--text-tertiary)] hover:text-blue-400 hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Show subagent details (opens in new tab)"
            data-testid="get-subagent-result-show-details"
          >
            <Icon path={mdiOpenInNew} size={0.45} /> Show details
          </button>
        )}
      </div>
      {result && !isRunning && (
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Result</div>
          <div className="max-h-80 overflow-auto text-[12px]">
            <MarkdownContent content={result} />
          </div>
        </div>
      )}
    </div>
  );
}
