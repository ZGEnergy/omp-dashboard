import { LinkifiedText } from "./LinkifiedText.js";
import type { ToolRendererProps } from "./types.js";

export function SearchToolRenderer({ toolName, args, status, result, context }: ToolRendererProps) {
  const query = (args?.query ?? args?.pattern ?? args?.glob ?? args?.search) as string | undefined;
  const path = (args?.path ?? args?.domain ?? args?.dir) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold text-[10px] uppercase">
          {toolName}
        </span>
        {query && <span className="font-mono font-semibold text-[var(--text-primary)]">"{query}"</span>}
        {path && <span className="text-[var(--text-muted)] font-mono">in {path}</span>}
      </div>

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Searching…</div>
      )}

      {result && (
        <div className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          <LinkifiedText text={result} context={context} />
        </div>
      )}
    </div>
  );
}
