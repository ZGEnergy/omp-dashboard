import type { ToolRendererProps } from "./types.js";

export function KnowledgeToolRenderer({ toolName, args, status, result }: ToolRendererProps) {
  const keyOrQuery = (args?.key ?? args?.query ?? args?.topic ?? args?.subject) as string | undefined;
  const value = (args?.value ?? args?.content ?? args?.memory) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 font-mono font-bold text-[10px] uppercase">
          {toolName}
        </span>
        {keyOrQuery && <span className="font-semibold text-[var(--text-primary)]">{keyOrQuery}</span>}
      </div>

      {value && (
        <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] whitespace-pre-wrap">
          {value}
        </div>
      )}

      {status === "running" && !result && !value && (
        <div className="text-[var(--text-muted)] italic">Accessing knowledge base…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
