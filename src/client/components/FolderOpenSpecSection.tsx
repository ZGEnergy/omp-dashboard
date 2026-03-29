import React, { useState } from "react";
import Icon from "@mdi/react";
import { mdiRefresh } from "@mdi/js";
import type { OpenSpecData, DashboardSession } from "../../shared/types.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DialogPortal } from "./DialogPortal.js";
import { NewChangeDialog } from "./NewChangeDialog.js";
import { ArtifactLetters } from "./openspec-helpers.js";

interface Props {
  data: OpenSpecData;
  cwd: string;
  onRefresh: () => void;
  onBulkArchive: () => void;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
  /** Sessions in this folder group (for + New targeting and session links) */
  sessions?: DashboardSession[];
  /** Send a prompt to a specific session */
  onSendPrompt?: (sessionId: string, text: string) => void;
  /** Navigate to a session */
  onNavigateToSession?: (sessionId: string) => void;
}

export function FolderOpenSpecSection({ data, cwd, onRefresh, onBulkArchive, onReadArtifact, sessions, onSendPrompt, onNavigateToSession }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [newChangeOpen, setNewChangeOpen] = useState(false);

  if (!data.initialized) return null;

  const activeSession = sessions?.find((s) => s.status !== "ended");
  const canCreateNew = !!(activeSession && onSendPrompt);

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
        <button
          onClick={(e) => { e.stopPropagation(); setNewChangeOpen(true); }}
          disabled={!canCreateNew}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-green-400 hover:border-green-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="folder-new-change-btn"
        >
          + Change
        </button>
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
                <ArtifactLetters artifacts={c.artifacts} changeName={c.name} onReadArtifact={onReadArtifact} />
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
                {c.totalTasks > 0 && (
                  <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap ml-auto">
                    {c.completedTasks}/{c.totalTasks} tasks
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bulkArchiveConfirm && (
        <DialogPortal><ConfirmDialog
          message="Bulk archive all completed changes?"
          confirmLabel="Bulk Archive"
          onConfirm={() => {
            onBulkArchive();
            setBulkArchiveConfirm(false);
          }}
          onCancel={() => setBulkArchiveConfirm(false)}
        /></DialogPortal>
      )}

      {newChangeOpen && canCreateNew && (
        <DialogPortal><NewChangeDialog
          onSend={(prompt) => {
            onSendPrompt!(activeSession!.id, prompt);
            setNewChangeOpen(false);
          }}
          onClose={() => setNewChangeOpen(false)}
        /></DialogPortal>
      )}
    </div>
  );
}
