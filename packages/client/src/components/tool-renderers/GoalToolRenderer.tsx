import type { ToolRendererProps } from "./types.js";

export function GoalToolRenderer({ args, status, result }: ToolRendererProps) {
  const objective = (args?.objective ?? args?.goal ?? args?.title) as string | undefined;
  const goalStatus = (args?.status as string) || "active";

  const statusStyles: Record<string, string> = {
    active: "bg-sky-500/20 text-sky-300",
    accomplished: "bg-emerald-500/20 text-emerald-300",
    abandoned: "bg-rose-500/20 text-rose-300",
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${statusStyles[goalStatus] ?? "bg-slate-500/20 text-slate-300"}`}>
          {goalStatus}
        </span>
        <span className="font-semibold text-[var(--text-primary)]">Goal</span>
      </div>

      {objective && (
        <div className="p-2 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] font-medium">
          {objective}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">Evaluating goal…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
