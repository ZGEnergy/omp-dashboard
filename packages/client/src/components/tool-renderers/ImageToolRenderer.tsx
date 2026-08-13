import { ToolResultImages } from "./ToolResultImages.js";
import type { ToolRendererProps } from "./types.js";

export function ImageToolRenderer({ toolName, args, status, result, images }: ToolRendererProps) {
  const promptOrPath = (args?.prompt ?? args?.path ?? args?.url) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 font-mono font-bold text-[10px] uppercase">
          {toolName}
        </span>
        {promptOrPath && <span className="text-[var(--text-primary)] italic">"{promptOrPath}"</span>}
      </div>

      {images && images.length > 0 && (
        <div className="pt-1">
          <ToolResultImages images={images} alt={toolName} />
        </div>
      )}

      {status === "running" && !result && (!images || images.length === 0) && (
        <div className="text-[var(--text-muted)] italic">Processing image…</div>
      )}

      {result && (
        <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] whitespace-pre-wrap">
          {result}
        </div>
      )}
    </div>
  );
}
