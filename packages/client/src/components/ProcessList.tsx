import React from "react";
import { Icon } from "@mdi/react";
import { mdiClose, mdiCog } from "@mdi/js";

export interface ProcessEntry {
  pid: number;
  pgid: number;
  command: string;
  elapsedMs: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes.toString().padStart(2, "0")}m`;
}

function truncateCommand(command: string, maxLen = 40): string {
  if (command.length <= maxLen) return command;
  return command.slice(0, maxLen - 1) + "…";
}

interface ProcessListProps {
  processes: ProcessEntry[];
  onKill: (pgid: number) => void;
  compact?: boolean;
}

export function ProcessList({ processes, onKill, compact }: ProcessListProps) {
  if (processes.length === 0) return null;

  if (compact) {
    // Mobile: inline entries without header
    return (
      <div className="mt-1 space-y-0.5">
        {processes.map((p) => (
          <div key={p.pid} className="flex items-center gap-1.5 text-[11px]">
            <Icon path={mdiCog} size={0.4} className="text-[var(--text-muted)] flex-shrink-0" />
            <span className="text-[var(--text-secondary)] truncate flex-1" title={p.command}>
              {truncateCommand(p.command, 30)}
            </span>
            <span className="text-[var(--text-tertiary)] flex-shrink-0">{formatElapsed(p.elapsedMs)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onKill(p.pgid); }}
              className="text-[var(--text-muted)] hover:text-red-400 flex-shrink-0 p-0.5"
              title="Kill process"
            >
              <Icon path={mdiClose} size={0.35} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] mb-0.5">
        <Icon path={mdiCog} size={0.4} />
        <span>Processes</span>
      </div>
      {processes.map((p) => (
        <div key={p.pid} className="flex items-center gap-1.5 text-[11px] ml-1 pl-2 border-l border-[var(--border-subtle)]">
          <span className="text-[var(--text-secondary)] truncate flex-1" title={p.command}>
            {truncateCommand(p.command)}
          </span>
          <span className="text-[var(--text-tertiary)] flex-shrink-0">{formatElapsed(p.elapsedMs)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onKill(p.pgid); }}
            className="text-[var(--text-muted)] hover:text-red-400 flex-shrink-0 p-0.5"
            title="Kill process"
          >
            <Icon path={mdiClose} size={0.4} />
          </button>
        </div>
      ))}
    </div>
  );
}
