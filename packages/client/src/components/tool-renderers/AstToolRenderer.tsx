import { OpenFileButton } from "./OpenFileButton.js";
import type { ToolRendererProps } from "./types.js";

export function AstToolRenderer({ toolName, args, status, result, context }: ToolRendererProps) {
  const filePath = args?.path as string | undefined;
  const pattern = (args?.pattern ?? args?.query ?? args?.rule) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-mono font-bold text-[10px] uppercase">
          {toolName}
        </span>
        {filePath && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[var(--text-primary)]">{filePath}</span>
            <OpenFileButton filePath={filePath} context={context} />
          </div>
        )}
      </div>

      {pattern && (
        <div className="text-[var(--text-secondary)] font-mono bg-[var(--bg-tertiary)] p-1.5 rounded border border-[var(--border-subtle)]">
          <span className="text-[var(--text-muted)]">pattern:</span> {pattern}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">AST operation running…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
