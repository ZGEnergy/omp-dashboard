/**
 * Custom renderer for the steer_subagent tool.
 * Shows the agent ID and the steering message.
 */
import React from "react";
import type { ToolRendererProps } from "./types.js";

export function SteerSubagentRenderer({ args, result }: ToolRendererProps) {
  const agentId = (args?.agent_id as string) ?? "unknown";
  const message = (args?.message as string) ?? "";

  return (
    <div className="space-y-1">
      <div className="text-xs text-[var(--text-secondary)]">
        Agent: <span className="font-mono">{agentId}</span>
      </div>
      {message && (
        <div className="text-[11px] text-[var(--text-secondary)] italic ml-2">
          "{message.slice(0, 200)}"
        </div>
      )}
      {result && (
        <div className="text-[11px] text-[var(--text-muted)] mt-1">{result}</div>
      )}
    </div>
  );
}
