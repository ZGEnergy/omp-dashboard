import type { ToolRendererProps } from "./types.js";

export function ThinkToolRenderer({ args, status, result }: ToolRendererProps) {
  const thought = (args?.thought ?? args?.reasoning ?? args?.text) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-1.5 text-[var(--text-muted)] font-medium text-[11px] uppercase tracking-wider">
        <span>Reasoning / Thought</span>
      </div>

      {thought && (
        <div className="p-2.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] italic whitespace-pre-wrap border border-[var(--border-subtle)] leading-relaxed">
          {thought}
        </div>
      )}

      {status === "running" && !thought && !result && (
        <div className="text-[var(--text-muted)] italic">Thinking…</div>
      )}

      {result && (
        <div className="text-[var(--text-secondary)] whitespace-pre-wrap pt-1">{result}</div>
      )}
    </div>
  );
}
