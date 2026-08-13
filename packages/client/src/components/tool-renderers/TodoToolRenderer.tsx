import { mdiCheckboxBlankOutline, mdiCheckboxMarkedOutline } from "@mdi/js";
import { Icon } from "@mdi/react";
import type { ToolRendererProps } from "./types.js";

interface TodoItem {
  id?: string;
  text?: string;
  title?: string;
  completed?: boolean;
  status?: string;
}

export function TodoToolRenderer({ args, status, result }: ToolRendererProps) {
  const action = (args?.action as string) || "todo";
  const items = (Array.isArray(args?.todos) ? args.todos : Array.isArray(args?.items) ? args.items : []) as TodoItem[];
  const singleTitle = (args?.title ?? args?.text ?? args?.item) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase">
          {action}
        </span>
        {singleTitle && <span className="font-medium text-[var(--text-primary)]">{singleTitle}</span>}
      </div>

      {items.length > 0 && (
        <div className="space-y-1.5 p-2 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
          {items.map((item, idx) => {
            const isDone = item.completed || item.status === "completed" || item.status === "done";
            const label = item.text ?? item.title ?? item.id ?? `Item ${idx + 1}`;
            return (
              <div key={idx} className="flex items-center gap-2 text-[var(--text-secondary)]">
                <Icon
                  path={isDone ? mdiCheckboxMarkedOutline : mdiCheckboxBlankOutline}
                  size={0.55}
                  className={isDone ? "text-green-400 shrink-0" : "text-[var(--text-muted)] shrink-0"}
                />
                <span className={isDone ? "line-through text-[var(--text-muted)]" : ""}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {status === "running" && !result && items.length === 0 && (
        <div className="text-[var(--text-muted)] italic">Updating todo list…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
