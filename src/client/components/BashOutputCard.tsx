import React from "react";
import { Icon } from "@mdi/react";
import { mdiConsole } from "@mdi/js";

interface Props {
  command: string;
  output: string;
  exitCode: number;
  excludeFromContext: boolean;
  timestamp?: number;
}

export function BashOutputCard({ command, output, exitCode, excludeFromContext }: Props) {
  const isSuccess = exitCode === 0;

  return (
    <div className="mt-2 mb-2">
      <div className="bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl shadow-md overflow-hidden max-w-[90%]">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-secondary)]">
          <Icon path={mdiConsole} size={0.6} className="text-[var(--text-tertiary)]" />
          <code className="text-xs font-mono text-[var(--text-primary)] flex-1 truncate">
            {excludeFromContext ? "!!" : "!"}{command}
          </code>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              isSuccess
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            exit {exitCode}
          </span>
          {excludeFromContext && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">
              silent
            </span>
          )}
        </div>
        {/* Output */}
        {output && (
          <pre className="px-3 py-2 text-xs font-mono text-[var(--text-secondary)] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-all">
            {output}
          </pre>
        )}
      </div>
    </div>
  );
}
