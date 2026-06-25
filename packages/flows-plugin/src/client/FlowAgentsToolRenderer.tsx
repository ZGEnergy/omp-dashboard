/**
 * Tool renderer for the `flow_agents` authoring tool (main-session timeline).
 *
 * Renders from the real tool contract:
 *   op:"list"  → result is a catalog array `[{ name, description, … }]`.
 *   op:"write" → result is `{ written, name, path, diagnostics[] }` /
 *                `{ written:false, error }`.
 * The agent markdown body for the "view agent file" sub-row comes from the
 * tool ARGS (`toolInput.content`), not the result.
 *
 * See change: rework-flows-plugin-for-new-pi-flows.
 */
import React, { useState } from "react";

interface AgentCatalogEntry { name?: string }
interface AgentWriteResult {
  written?: boolean;
  name?: string;
  path?: string;
  diagnostics?: Array<{ message?: string } | string>;
  error?: string;
}

function diagText(d: { message?: string } | string): string {
  return typeof d === "string" ? d : (d.message ?? JSON.stringify(d));
}

export function FlowAgentsToolRenderer({
  toolInput,
  status,
  result,
}: {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  status?: "running" | "complete" | "error";
  result?: string;
}) {
  const [showFile, setShowFile] = useState(false);
  const op = toolInput.op === "write" ? "write" : "list";
  const content = typeof toolInput.content === "string" ? toolInput.content : "";

  let parsed: unknown = null;
  try { if (result) parsed = JSON.parse(result); } catch { parsed = null; }

  // ── list ──
  if (op === "list") {
    const catalog = Array.isArray(parsed) ? (parsed as AgentCatalogEntry[]) : [];
    const names = catalog.map((a) => a?.name).filter((n): n is string => typeof n === "string");
    return (
      <div className="border border-[var(--border-primary)] rounded-md bg-[var(--bg-secondary)] p-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-purple-400">⊙</span>
          <span className="font-semibold">flow_agents</span>
          <span className="text-[var(--text-muted)]">list · {names.length} agents</span>
        </div>
        {names.length > 0 && (
          <div className="mt-1 font-mono text-[var(--text-tertiary)]">{names.join(" · ")}</div>
        )}
      </div>
    );
  }

  // ── write ──
  const wr = (parsed && typeof parsed === "object" ? parsed : {}) as AgentWriteResult;
  const written = wr.written === true;
  const isError = status === "error" || wr.written === false;
  const diagnostics = (wr.diagnostics ?? []).map(diagText);

  return (
    <div className="border border-[var(--border-primary)] rounded-md bg-[var(--bg-secondary)] p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-purple-400">⊙</span>
        <span className="font-semibold">flow_agents</span>
        <span className="text-[var(--text-muted)]">write</span>
        {written && wr.name && <span className="font-mono text-green-400">{wr.name}</span>}
        {written && <span className="text-[var(--text-muted)]">saved</span>}
        {isError && <span className="text-red-400">not written</span>}
      </div>

      {isError && (
        <pre className="mt-2 font-mono text-[11px] text-red-400 whitespace-pre-wrap">
          {diagnostics.length > 0 ? diagnostics.join("\n") : (wr.error ?? "Unknown error")}
        </pre>
      )}

      {content && (
        <div className="mt-2">
          <button
            onClick={() => setShowFile((v) => !v)}
            className="text-[11px] text-[var(--text-tertiary)] hover:text-blue-400 font-mono"
          >
            {showFile ? "▾" : "▸"} View agent file {wr.path ? `· ${wr.path.split("/").pop()}` : ""}
          </button>
          {showFile && (
            <pre className="mt-1 font-mono text-[11px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-2 overflow-auto max-h-[260px] whitespace-pre">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
