import { ToolResultImages } from "./ToolResultImages.js";
import type { ToolRendererProps } from "./types.js";

export function BrowserToolRenderer({ args, status, result, images }: ToolRendererProps) {
  const action = (args?.action as string) || "browse";
  const url = (args?.url as string) || (args?.target as string);
  const selector = args?.selector as string | undefined;
  const text = args?.text as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold text-[10px] uppercase">
          {action}
        </span>
        {url && <span className="font-mono text-[var(--text-primary)] truncate max-w-lg">{url}</span>}
      </div>

      {(selector || text) && (
        <div className="flex gap-3 text-[var(--text-tertiary)] text-[11px]">
          {selector && <div><span className="font-semibold text-[var(--text-muted)]">Selector:</span> <code className="bg-[var(--bg-tertiary)] px-1 rounded">{selector}</code></div>}
          {text && <div><span className="font-semibold text-[var(--text-muted)]">Text:</span> {text}</div>}
        </div>
      )}

      {images && images.length > 0 && (
        <div className="pt-1">
          <ToolResultImages images={images} alt="Browser screenshot" />
        </div>
      )}

      {status === "running" && !result && (!images || images.length === 0) && (
        <div className="text-[var(--text-muted)] italic">Browser active…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
