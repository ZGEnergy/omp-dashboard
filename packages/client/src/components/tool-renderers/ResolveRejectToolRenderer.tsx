import { mdiAlertCircle, mdiCheckCircle } from "@mdi/js";
import { Icon } from "@mdi/react";
import type { ToolRendererProps } from "./types.js";

export function ResolveRejectToolRenderer({ toolName, args, result }: ToolRendererProps) {
  const isResolve = toolName === "resolve";
  const reason = (args?.reason ?? args?.label ?? args?.action ?? args?.summary) as string | undefined;

  return (
    <div
      data-testid={isResolve ? "resolve-banner" : "reject-banner"}
      className={`p-3 rounded-lg border flex items-start gap-2.5 ${
        isResolve
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
          : "bg-rose-500/10 border-rose-500/30 text-rose-300"
      }`}
    >
      <Icon
        path={isResolve ? mdiCheckCircle : mdiAlertCircle}
        size={0.7}
        className={`mt-0.5 shrink-0 ${isResolve ? "text-emerald-400" : "text-rose-400"}`}
      />
      <div className="space-y-1 min-w-0 flex-1">
        <div className="font-semibold text-xs uppercase tracking-wider">
          {isResolve ? "Task Resolved" : "Task Rejected"}
        </div>
        {reason && <div className="text-xs font-medium text-[var(--text-primary)]">{reason}</div>}
        {result && <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{result}</div>}
      </div>
    </div>
  );
}
