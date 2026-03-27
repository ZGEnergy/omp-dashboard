import React, { useState } from "react";
import Icon from "@mdi/react";
import { mdiRefresh } from "@mdi/js";
import type { OpenSpecData } from "../../shared/types.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { ArtifactLetters } from "./openspec-helpers.js";

interface Props {
  data: OpenSpecData;
  cwd: string;
  onRefresh: () => void;
  onBulkArchive: () => void;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
}

export function FolderOpenSpecSection({ data, cwd, onRefresh, onBulkArchive, onReadArtifact }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

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
          <span>{expanded ? "▼" : "▶"}</span>
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
        <button
          onClick={(e) => { e.stopPropagation(); setBulkArchiveConfirm(true); }}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-orange-400 hover:border-orange-500/50"
          data-testid="folder-bulk-archive-btn"
        >
          Bulk Archive
        </button>
      </div>

      {/* Expanded change list */}
      {expanded && (
        <div className="ml-5 mt-1 space-y-0.5" data-testid="folder-openspec-changes">
          {sortedChanges.map((c) => (
            <div key={c.name} className="flex items-center gap-2 px-2 py-1">
              <span data-testid="change-name" className="text-[11px] font-medium text-[var(--text-secondary)] truncate">
                {c.name}
              </span>
              <ArtifactLetters artifacts={c.artifacts} changeName={c.name} onReadArtifact={onReadArtifact} />
              {c.totalTasks > 0 && (
                <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap ml-auto">
                  {c.completedTasks}/{c.totalTasks} tasks
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {bulkArchiveConfirm && (
        <ConfirmDialog
          message="Bulk archive all completed changes?"
          confirmLabel="Bulk Archive"
          onConfirm={() => {
            onBulkArchive();
            setBulkArchiveConfirm(false);
          }}
          onCancel={() => setBulkArchiveConfirm(false)}
        />
      )}
    </div>
  );
}
