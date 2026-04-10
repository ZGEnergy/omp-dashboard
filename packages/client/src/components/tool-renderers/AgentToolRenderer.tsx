/**
 * Custom renderer for the Agent tool (from @tintinweb/pi-subagents).
 * Shows a rich card with live progress while running, and stats + result when complete.
 */
import React from "react";
import type { ToolRendererProps } from "./types.js";
import { AgentCardShell } from "../AgentCardShell.js";
import { formatDuration } from "../agent-card-utils.js";
import { ElapsedBadge } from "../ElapsedBadge.js";
import { MarkdownContent } from "../MarkdownContent.js";

/** Shape of AgentDetails sent by pi-subagents via partialResult.details */
interface AgentDetails {
  displayName?: string;
  description?: string;
  subagentType?: string;
  status?: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  toolUses?: number;
  tokens?: string;
  turnCount?: number;
  maxTurns?: number;
  durationMs?: number;
  modelName?: string;
  tags?: string[];
  agentId?: string;
  error?: string;
}

/** Map AgentDetails status to AgentCardShell status key */
function mapStatus(details: AgentDetails | undefined, toolStatus: string): string {
  if (!details?.status) return toolStatus === "error" ? "error" : toolStatus === "complete" ? "complete" : "running";
  switch (details.status) {
    case "running":
    case "queued":
      return "running";
    case "completed":
    case "steered":
      return "complete";
    case "error":
    case "aborted":
      return "error";
    case "stopped":
      return "stopped";
    case "background":
      return "background";
    default:
      return "running";
  }
}

/** Build a stats string from AgentDetails */
function buildStats(d: AgentDetails): string {
  const parts: string[] = [];
  if (d.modelName) parts.push(d.modelName);
  if (d.tags?.length) parts.push(...d.tags);
  if (d.turnCount != null && d.turnCount > 0) {
    parts.push(d.maxTurns != null ? `⟳${d.turnCount}≤${d.maxTurns}` : `⟳${d.turnCount}`);
  }
  if (d.toolUses != null && d.toolUses > 0) parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
  if (d.tokens) parts.push(d.tokens);
  return parts.join(" · ");
}

/** Prompt display block */
function PromptBlock({ text }: { text: string }) {
  return (
    <div className="mt-1.5">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Prompt</div>
      <pre className="whitespace-pre-wrap text-[11px] text-[var(--text-secondary)] max-h-40 overflow-auto">
        {text.slice(0, 1000)}
      </pre>
    </div>
  );
}

/** Result display block with markdown rendering */
function ResultBlock({ text }: { text: string }) {
  return (
    <div className="mt-1.5">
      <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Result</div>
      <div className="max-h-80 overflow-auto text-[12px]">
        <MarkdownContent content={text} />
      </div>
    </div>
  );
}

export function AgentToolRenderer({ args, status, result, toolDetails }: ToolRendererProps) {
  const details = toolDetails as AgentDetails | undefined;

  // Derive display values
  const displayName = details?.displayName ?? (args?.subagent_type as string) ?? "Agent";
  const description = details?.description ?? (args?.description as string) ?? "";
  const cardStatus = mapStatus(details, status);
  const promptText = args?.prompt ? String(args.prompt) : undefined;

  // --- Fallback: no toolDetails (replayed/older sessions) ---
  if (!details) {
    return (
      <AgentCardShell name={displayName} status={cardStatus}>
        {description && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">"{description}"</div>
        )}
        {promptText && <PromptBlock text={promptText} />}
        {result && <ResultBlock text={result} />}
      </AgentCardShell>
    );
  }

  const statsText = buildStats(details);

  // --- Background agent ---
  if (details.status === "background") {
    return (
      <AgentCardShell name={displayName} status="background"
        stats={details.agentId ? <span className="font-mono">ID: {details.agentId}</span> : undefined}
      >
        {description && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">"{description}"</div>
        )}
        <div className="text-[11px] text-blue-400 mt-1">Running in background</div>
      </AgentCardShell>
    );
  }

  // --- Running ---
  if (details.status === "running" || details.status === "queued") {
    return (
      <AgentCardShell name={displayName} status="running"
        headerRight={<ElapsedBadge startedAt={details.durationMs ? Date.now() - details.durationMs : undefined} />}
        stats={statsText ? <span>{statsText}</span> : undefined}
      >
        {description && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">"{description}"</div>
        )}
        {details.activity && (
          <div className="text-[10px] text-[var(--text-tertiary)] mt-1 truncate">▸ {details.activity}</div>
        )}
        {promptText && <PromptBlock text={promptText} />}
      </AgentCardShell>
    );
  }

  // --- Completed / Steered ---
  if (details.status === "completed" || details.status === "steered") {
    const durationText = details.durationMs ? formatDuration(details.durationMs) : "";
    return (
      <AgentCardShell name={displayName} status="complete"
        headerRight={durationText ? <span className="text-[11px] text-[var(--text-tertiary)]">{durationText}</span> : undefined}
        stats={statsText ? <span>{statsText}</span> : undefined}
      >
        {description && (
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">"{description}"</div>
        )}
        {details.status === "steered" && (
          <div className="text-[11px] text-orange-400 mt-0.5">Wrapped up (turn limit)</div>
        )}
        {promptText && <PromptBlock text={promptText} />}
        {result && <ResultBlock text={result} />}
      </AgentCardShell>
    );
  }

  // --- Error / Aborted / Stopped ---
  const isError = details.status === "error" || details.status === "aborted";
  const durationText = details.durationMs ? formatDuration(details.durationMs) : "";
  return (
    <AgentCardShell name={displayName} status={isError ? "error" : "stopped"}
      headerRight={durationText ? <span className="text-[11px] text-[var(--text-tertiary)]">{durationText}</span> : undefined}
      stats={statsText ? <span>{statsText}</span> : undefined}
    >
      {description && (
        <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">"{description}"</div>
      )}
      {details.status === "error" && details.error && (
        <div className="text-[11px] text-red-400 mt-1">Error: {details.error}</div>
      )}
      {details.status === "aborted" && (
        <div className="text-[11px] text-orange-400 mt-1">Aborted (max turns exceeded)</div>
      )}
      {details.status === "stopped" && (
        <div className="text-[11px] text-[var(--text-muted)] mt-1">Stopped</div>
      )}
      {promptText && <PromptBlock text={promptText} />}
      {result && <ResultBlock text={result} />}
    </AgentCardShell>
  );
}
