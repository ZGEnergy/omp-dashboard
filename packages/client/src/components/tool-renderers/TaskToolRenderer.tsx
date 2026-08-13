import type { ToolRendererProps } from "./types.js";

export function TaskToolRenderer({ args, status, result }: ToolRendererProps) {
  const name = args?.name as string | undefined;
  const agent = (args?.agent as string) || "task";
  const taskDesc = (args?.task as string) || (args?.description as string);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] uppercase">
          {agent}
        </span>
        {name && <span className="font-semibold text-[var(--text-primary)]">{name}</span>}
      </div>

      {taskDesc && (
        <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] whitespace-pre-wrap">
          {taskDesc}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Task running…</div>
      )}

      {result && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase font-semibold text-[var(--text-muted)]">Result</div>
          <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)] font-mono">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
