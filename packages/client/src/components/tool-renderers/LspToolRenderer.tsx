import { OpenFileButton } from "./OpenFileButton.js";
import type { ToolRendererProps } from "./types.js";

export function LspToolRenderer({ args, status, result, context }: ToolRendererProps) {
  const command = (args?.command ?? args?.action ?? args?.method) as string | undefined;
  const filePath = (args?.path ?? args?.uri ?? args?.filePath) as string | undefined;
  const symbol = (args?.symbol ?? args?.query) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] uppercase">
          LSP {command ?? ""}
        </span>
        {filePath && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[var(--text-primary)]">{filePath}</span>
            <OpenFileButton filePath={filePath} context={context} />
          </div>
        )}
      </div>

      {symbol && (
        <div className="text-[var(--text-secondary)] font-mono">
          <span className="text-[var(--text-muted)]">symbol:</span> {symbol}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Querying LSP server…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
