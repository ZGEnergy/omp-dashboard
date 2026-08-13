import type { ToolRendererProps } from "./types.js";

export function HubToolRenderer({ args, status, result }: ToolRendererProps) {
  const op = (args?.op as string) || "hub";
  const target = (args?.to as string) || (args?.from as string) || (args?.name as string) || (args?.id as string);
  const message = (args?.message as string) || (args?.text as string);

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[10px] uppercase">
          {op}
        </span>
        {target && (
          <span className="font-mono text-[var(--text-primary)]">
            <span className="text-[var(--text-muted)]">target:</span> {target}
          </span>
        )}
      </div>

      {message && (
        <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] whitespace-pre-wrap">
          {message}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Hub operating…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
