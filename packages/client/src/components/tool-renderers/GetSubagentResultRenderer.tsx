/**
 * Custom renderer for the get_subagent_result tool.
 * Shows agent ID and result.
 */
import React from "react";
import type { ToolRendererProps } from "./types.js";
import { MarkdownContent } from "../MarkdownContent.js";

export function GetSubagentResultRenderer({ args, status, result }: ToolRendererProps) {
  const agentId = (args?.agent_id as string) ?? "unknown";
  const isRunning = result?.includes("still running");

  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--text-secondary)]">
        <span className="font-mono">{agentId}</span>
        {isRunning && <span className="ml-2 text-yellow-400">still running</span>}
        {status === "running" && <span className="ml-2 text-yellow-400">fetching…</span>}
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
