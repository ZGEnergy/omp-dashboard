import type { ToolRendererProps } from "./types.js";

export function GithubToolRenderer({ args, status, result }: ToolRendererProps) {
  const op = (args?.op ?? args?.action ?? args?.command) as string | undefined;
  const repo = args?.repo as string | undefined;
  const issueOrPr = (args?.issue ?? args?.pr ?? args?.number) as string | number | undefined;
  const title = (args?.title ?? args?.subject) as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-300 font-mono font-bold text-[10px] uppercase">
          github {op ?? ""}
        </span>
        {repo && <span className="font-mono text-[var(--text-secondary)]">{repo}</span>}
        {issueOrPr && <span className="font-mono font-semibold text-[var(--accent)]">#{issueOrPr}</span>}
      </div>

      {title && (
        <div className="font-semibold text-[var(--text-primary)]">
          {title}
        </div>
      )}

      {status === "running" && !result && (
        <div className="text-[var(--text-muted)] italic">GitHub request in progress…</div>
      )}

      {result && (
        <pre className="p-2 rounded bg-[var(--bg-code)] text-[var(--text-secondary)] font-mono whitespace-pre-wrap max-h-60 overflow-auto border border-[var(--border-subtle)]">
          {result}
        </pre>
      )}
    </div>
  );
}
