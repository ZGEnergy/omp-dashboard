import React, { useState } from "react";
import { Icon } from "@mdi/react";
import { mdiRefresh, mdiChevronDown, mdiChevronRight, mdiArchiveOutline, mdiFileDocumentOutline } from "@mdi/js";
import type { OpenSpecData, DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { ArtifactLettersButton } from "./openspec-helpers.js";

interface Props {
  data: OpenSpecData;
  cwd: string;
  onRefresh: () => void;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
  /** Sessions in this folder group (for session links) */
  sessions?: DashboardSession[];
  /** Navigate to a session */
  onNavigateToSession?: (sessionId: string) => void;
  /** Open the main specs browser */
  onOpenSpecs?: () => void;
  /** Open the archive browser */
  onOpenArchive?: () => void;
}

export function FolderOpenSpecSection({ data, cwd, onRefresh, onReadArtifact, sessions, onNavigateToSession, onOpenSpecs, onOpenArchive }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!data.initialized) return null;

  const sortedChanges = [
    ...data.changes.filter((c) => c.status !== "complete"),
    ...data.changes.filter((c) => c.status === "complete"),
  ];

  return (
    <div data-testid="folder-openspec-section" onClick={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mt-1 ml-5">
        <button
          data-testid="folder-openspec-header"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase hover:text-[var(--text-secondary)]"
        >
          <Icon path={expanded ? mdiChevronDown : mdiChevronRight} size={0.45} />
          <span>OpenSpec ({data.changes.length} changes)</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRefresh(); }}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          title="Refresh"
          data-testid="folder-openspec-refresh"
        >
          <Icon path={mdiRefresh} size={0.5} />
        </button>
        <span className="flex-1" />
        {onOpenArchive && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenArchive(); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50"
            data-testid="folder-archive-btn"
          >
            <Icon path={mdiArchiveOutline} size={0.4} className="inline mr-0.5" />Archive
          </button>
        )}
        {onOpenSpecs && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSpecs(); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50"
            data-testid="folder-specs-btn"
          >
            <Icon path={mdiFileDocumentOutline} size={0.4} className="inline mr-0.5" />Specs
          </button>
        )}
      </div>

      {/* Expanded change list */}
      {expanded && (
        <div className="ml-5 mt-1 space-y-0.5" data-testid="folder-openspec-changes">
          {sortedChanges.map((c) => {
            const linkedSessions = sessions?.filter((s) => s.attachedProposal === c.name) ?? [];
            return (
              <div key={c.name} className="flex items-center gap-2 px-2 py-1">
                <span data-testid="change-name" className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
                  {c.name}
                </span>
                {linkedSessions.length > 0 && (
                  <span className="flex items-center gap-1">
                    {linkedSessions.map((s) => (
                      <button
                        key={s.id}
                        data-testid="session-link"
                        onClick={(e) => { e.stopPropagation(); onNavigateToSession?.(s.id); }}
                        className="text-[9px] px-1 py-0.5 rounded bg-[var(--bg-tertiary)] text-blue-400 hover:text-blue-300 truncate max-w-[80px]"
                        title={s.name || s.id}
                      >
                        {s.name || s.id.slice(0, 8)}
                      </button>
                    ))}
                  </span>
                )}
                {c.totalTasks > 0 ? (
                  <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap ml-auto">
                    {c.completedTasks}/{c.totalTasks} tasks
                  </span>
                ) : (
                  <span className="ml-auto" />
                )}
                <ArtifactLettersButton artifacts={c.artifacts} changeName={c.name} onReadArtifact={onReadArtifact} />
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
