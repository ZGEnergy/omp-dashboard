/**
 * SubagentDetailView — one component, three placements.
 *
 * Renders the full detail view for a subagent (from `SessionState.subagents`).
 * Used by:
 *   - AgentToolRenderer (inline-expanded body)
 *   - SubagentPopoutPage (route /session/:sid/subagent/:aid)
 *   - BackgroundSubagentsPanel rows (row mode = single-line summary)
 *
 * Four-tier rendering precedence (graceful degradation):
 *   Tier 1: `entries[]` present (Phase 2 upstream patch) — full timeline
 *   Tier 2: running, no entries — current activity + counters + footnote
 *   Tier 3: completed/failed, no entries — result/error block
 *   Tier 4: neither — placeholder
 *
 * See change: add-subagent-inspector.
 */
import React from "react";
import { Icon } from "@mdi/react";
import { mdiAlertCircle, mdiArrowLeft, mdiCheckCircle, mdiCircle, mdiCircleOutline, mdiCloseCircle } from "@mdi/js";
import { UI_PRIMITIVE_KEYS } from "@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives.js";
import { useUiPrimitive } from "@blackbelt-technology/dashboard-plugin-runtime";
import { formatTokens, formatDuration } from "@blackbelt-technology/pi-dashboard-client-utils/agent-card-utils";
import type { SubagentState, SubagentTimelineEntry } from "./types.js";

/** Minimal session-state shape this component cares about (just the subagents map). */
export interface SessionStateLike {
  subagents: Map<string, SubagentState>;
}

// ---- Helpers ----

function extractInputPreview(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  switch (toolName.toLowerCase()) {
    case "read":
    case "write":
    case "edit":
      return String(inp.file_path || inp.path || "");
    case "bash":
      return String(inp.command || "").slice(0, 80);
    case "grep":
      return String(inp.pattern || "").slice(0, 40);
    default:
      try {
        return JSON.stringify(input).slice(0, 60);
      } catch {
        return "";
      }
  }
}

function statusIconPath(status: SubagentState["status"]): string {
  switch (status) {
    case "completed": return mdiCheckCircle;
    case "failed": return mdiCloseCircle;
    case "running": return mdiCircle;
    case "created": return mdiCircleOutline;
    default: return mdiAlertCircle;
  }
}

function statusColor(status: SubagentState["status"]): string {
  switch (status) {
    case "completed": return "text-green-400";
    case "failed": return "text-red-400";
    case "running": return "text-yellow-400";
    case "created": return "text-[var(--text-tertiary)]";
    default: return "text-[var(--text-tertiary)]";
  }
}

// ---- Entry renderers (Tier 1) ----

function ToolCallEntry({ entry }: { entry: Extract<SubagentTimelineEntry, { kind: "tool" }> }) {
  const preview = extractInputPreview(entry.toolName, entry.input);
  const hasOutput = entry.output !== undefined;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className={`border-l-2 pl-3 py-1.5 ${entry.isError ? "border-red-500/50" : "border-blue-500/30"}`}>
      <div
        className="flex items-center gap-1.5 cursor-pointer"
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span className={`text-xs font-mono ${entry.isError ? "text-red-400" : "text-blue-400"}`}>
          {entry.toolName}
        </span>
        <span className="text-xs text-[var(--text-tertiary)] truncate">{preview}</span>
        {hasOutput && (
          <span className="text-[10px] text-[var(--text-muted)] ml-auto flex-shrink-0">
            {expanded ? "▾" : "▸"}
          </span>
        )}
      </div>
      {expanded && hasOutput && (
        <pre className="text-[11px] text-[var(--text-secondary)] mt-1 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words bg-[var(--bg-tertiary)] rounded p-2">
          {typeof entry.output === "string" ? entry.output : JSON.stringify(entry.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TextEntry({ text }: { text: string }) {
  const MarkdownContent = useUiPrimitive(UI_PRIMITIVE_KEYS.markdownContent);
  return (
    <div className="py-1.5 pl-3">
      <MarkdownContent content={text} />
    </div>
  );
}

function ThinkingEntry({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="py-1 pl-3">
      <div
        className="flex items-center gap-1 cursor-pointer text-[11px] text-purple-400/70"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>Thinking</span>
      </div>
      {expanded && (
        <pre className="text-[11px] text-[var(--text-muted)] mt-1 whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
          {text}
        </pre>
      )}
    </div>
  );
}

function ErrorEntry({ text }: { text: string }) {
  return <div className="py-1.5 pl-3 text-sm text-red-400">{text}</div>;
}

// ---- Main component ----

export type SubagentDetailMode = "inline" | "popout" | "row";

export interface SubagentDetailViewProps {
  session: SessionStateLike;
  agentId: string;
  /** Default: "inline". `row` collapses to a single-line summary (no body). */
  mode?: SubagentDetailMode;
  /** Optional back-button handler (used in inline-popover-style usage). */
  onBack?: () => void;
}

export function SubagentDetailView({ session, agentId, mode = "inline", onBack }: SubagentDetailViewProps) {
  const MarkdownContent = useUiPrimitive(UI_PRIMITIVE_KEYS.markdownContent);
  const sub = session.subagents.get(agentId);
  if (!sub) {
    return (
      <div className="text-sm text-[var(--text-muted)] py-4 px-3 text-center">
        Subagent not found in this session.
      </div>
    );
  }

  const displayName = sub.displayName || sub.type;
  const hasEntries = Array.isArray(sub.entries) && sub.entries.length > 0;
  const isComplete = sub.status === "completed" || sub.status === "failed";

  // Row mode: single-line summary, no body. Used by BackgroundSubagentsPanel.
  if (mode === "row") {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className={`${statusColor(sub.status)} inline-flex flex-shrink-0`}>
          <Icon path={statusIconPath(sub.status)} size={0.5} />
        </span>
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{displayName}</span>
        {sub.activity && (
          <span className="text-[10px] text-[var(--text-tertiary)] truncate ml-1">{sub.activity}</span>
        )}
      </div>
    );
  }

  // Header (inline + popout share)
  const header = (
    <div className="px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center gap-2 flex-shrink-0">
      {onBack && (
        <button
          onClick={onBack}
          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          title="Back"
        >
          <Icon path={mdiArrowLeft} size={0.7} />
        </button>
      )}
      <span className={`${statusColor(sub.status)} inline-flex`}><Icon path={statusIconPath(sub.status)} size={0.6} /></span>
      <span className="text-sm font-medium text-[var(--text-primary)] truncate">{displayName}</span>
      {sub.modelName && (
        <span className="text-[11px] text-[var(--text-tertiary)] truncate">{sub.modelName}</span>
      )}
      {isComplete && sub.tokens && (
        <span className="text-[11px] text-[var(--text-muted)] ml-auto whitespace-nowrap">
          ↑{formatTokens(sub.tokens.input)} ↓{formatTokens(sub.tokens.output)} · {formatDuration(sub.durationMs ?? 0)}
        </span>
      )}
    </div>
  );

  const containerClasses = mode === "popout"
    ? "flex flex-col h-full overflow-hidden"
    : "flex flex-col max-h-[60vh] overflow-hidden";

  // Body rendering by tier
  const body = (() => {
    // Tier 1: entries available
    if (hasEntries) {
      return (
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {sub.entries!.map((entry, i) => {
            switch (entry.kind) {
              case "tool":
                return <ToolCallEntry key={i} entry={entry} />;
              case "text":
                return <TextEntry key={i} text={entry.text} />;
              case "thinking":
                return <ThinkingEntry key={i} text={entry.text} />;
              case "error":
                return <ErrorEntry key={i} text={entry.text} />;
              default:
                return null;
            }
          })}
          {/* Summary block at bottom for completed agents */}
          {isComplete && sub.result && (
            <div className="mt-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="text-[11px] text-[var(--text-muted)] mb-1">Result</div>
              <MarkdownContent content={sub.result} />
            </div>
          )}
        </div>
      );
    }

    // Tier 2: running, no entries
    if (sub.status === "running") {
      return (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {sub.description && (
            <div className="text-[11px] text-[var(--text-secondary)]">"{sub.description}"</div>
          )}
          {sub.activity && (
            <div className="text-xs text-[var(--text-primary)]">
              <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mr-2">Activity</span>
              {sub.activity}
            </div>
          )}
          <div className="flex gap-4 text-[11px] text-[var(--text-muted)]">
            {typeof sub.toolUses === "number" && (
              <span>{sub.toolUses} tool use{sub.toolUses === 1 ? "" : "s"}</span>
            )}
            {sub.tokens && (
              <span>↑{formatTokens(sub.tokens.input)} ↓{formatTokens(sub.tokens.output)}</span>
            )}
          </div>
          <div className="text-[10px] text-[var(--text-muted)] italic mt-2 pt-2 border-t border-[var(--border-subtle)]">
            Live timeline requires <code className="font-mono">@tintinweb/pi-subagents ≥ next</code>. Showing summary.
          </div>
        </div>
      );
    }

    // Tier 3: completed / failed, no entries
    if (isComplete && (sub.result || sub.error)) {
      return (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {sub.description && (
            <div className="text-[11px] text-[var(--text-secondary)]">"{sub.description}"</div>
          )}
          {sub.error && (
            <div className="text-sm text-red-400">{sub.error}</div>
          )}
          {sub.result && (
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">Result</div>
              <MarkdownContent content={sub.result} />
            </div>
          )}
        </div>
      );
    }

    // Tier 4: nothing useful yet
    return (
      <div className="flex-1 overflow-y-auto px-3 py-6 text-center text-sm text-[var(--text-muted)]">
        No detail available yet.
      </div>
    );
  })();

  return (
    <div className={containerClasses}>
      {header}
      {body}
    </div>
  );
}
