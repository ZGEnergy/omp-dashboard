import React from "react";
import Ansi from "ansi-to-react";
import type { ToolRendererProps } from "./types.js";

export function BashToolRenderer({ args, status, result }: ToolRendererProps) {
  const command = args?.command as string | undefined;
  const timeout = args?.timeout as number | undefined;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--accent-green)] font-mono">$</span>
        <span className="text-xs text-[var(--text-secondary)] font-mono truncate">{command ?? "command"}</span>
        {timeout && <span className="text-[10px] text-[var(--text-muted)]">(timeout: {timeout}s)</span>}
      </div>

      {status === "running" && !result && (
        <div className="text-xs text-[var(--text-muted)] italic">Running…</div>
      )}

      {result && (
        <div className="max-h-80 overflow-auto rounded bg-[var(--bg-code)] p-2">
          <pre className="whitespace-pre-wrap text-xs font-mono">
            <Ansi>{result}</Ansi>
          </pre>
        </div>
      )}
    </div>
  );
}
