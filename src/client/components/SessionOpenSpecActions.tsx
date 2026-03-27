import React, { useState } from "react";
import type { DashboardSession, OpenSpecChange } from "../../shared/types.js";
import { ExploreDialog } from "./ExploreDialog.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { ArtifactLetters, allArtifactsDone } from "./openspec-helpers.js";

function ActionButton({ label, onClick, testId }: { label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50"
      data-testid={testId}
    >
      {label}
    </button>
  );
}

interface Props {
  session: DashboardSession;
  changes: OpenSpecChange[];
  onAttach: (changeName: string) => void;
  onDetach: () => void;
  onSendPrompt: (text: string) => void;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
}

export function SessionOpenSpecActions({ session, changes, onAttach, onDetach, onSendPrompt, onReadArtifact }: Props) {
  const [exploreOpen, setExploreOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [attachingName, setAttachingName] = useState<string | null>(null);

  const attached = session.attachedProposal;
  const isEnded = session.status === "ended";

  // Clear attaching state once the session reflects the attachment
  if (attachingName && attached === attachingName) {
    setAttachingName(null);
  }

  // Not attached: show combo box or attaching indicator
  if (!attached) {
    if (attachingName) {
      return (
        <div className="mt-1 text-[10px] text-blue-400 animate-pulse" data-testid="session-openspec-actions">
          Attaching: {attachingName}…
        </div>
      );
    }

    const sorted = [
      ...changes.filter((c) => c.status !== "complete"),
      ...changes.filter((c) => c.status === "complete"),
    ];

    return (
      <div className="mt-1" data-testid="session-openspec-actions">
        <select
          data-testid="attach-combo"
          disabled={changes.length === 0}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setAttachingName(e.target.value);
              onAttach(e.target.value);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
        >
          <option value="">{changes.length === 0 ? "No changes" : "Attach change..."}</option>
          {sorted.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
    );
  }

  // Attached: find the change
  const change = changes.find((c) => c.name === attached);

  // Attached but change not found in data
  if (!change) {
    return (
      <div className="mt-1" data-testid="session-openspec-actions">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-tertiary)]">📋 {attached}</span>
          <span className="flex-1" />
          <ActionButton label="Detach" onClick={onDetach} testId="detach-btn" />
        </div>
      </div>
    );
  }

  const isComplete = change.status === "complete";
  const canApply = allArtifactsDone(change.artifacts);

  return (
    <div className="mt-1 space-y-1" data-testid="session-openspec-actions">
      {/* Line 1: badge + artifact letters + detach right-aligned */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[var(--text-tertiary)]" data-testid="attached-badge">📋 {attached}</span>
        <ArtifactLetters artifacts={change.artifacts} changeName={change.name} onReadArtifact={onReadArtifact} />
        <span className="flex-1" />
        <ActionButton label="Detach" onClick={onDetach} testId="detach-btn" />
      </div>
      {/* Line 2: action buttons */}
      {!isEnded && (
        <div className="flex items-center gap-1 flex-wrap">
          {change.artifacts.length > 0 && (
            <ActionButton
              label="Read"
              onClick={() => onReadArtifact?.(change.name, change.artifacts[0].id)}
              testId="read-btn"
            />
          )}
          <ActionButton label="Explore" onClick={() => setExploreOpen(true)} testId="explore-btn" />
          {!isComplete && (
            <>
              <ActionButton label="Continue" onClick={() => onSendPrompt(`/opsx:continue ${attached}`)} testId="continue-btn" />
              <ActionButton label="FF" onClick={() => onSendPrompt(`/opsx:ff ${attached}`)} testId="ff-btn" />
            </>
          )}
          {canApply && (
            <ActionButton label="Apply" onClick={() => onSendPrompt(`/opsx:apply ${attached}`)} testId="apply-btn" />
          )}
          {isComplete && (
            <ActionButton label="Archive" onClick={() => setArchiveConfirm(true)} testId="archive-btn" />
          )}
        </div>
      )}

      {exploreOpen && (
        <ExploreDialog
          changeName={attached}
          onSend={(text) => {
            onSendPrompt(`/skill:openspec-explore ${attached}\n${text}`);
            setExploreOpen(false);
          }}
          onClose={() => setExploreOpen(false)}
        />
      )}

      {archiveConfirm && (
        <ConfirmDialog
          message={`Archive "${attached}"?`}
          confirmLabel="Archive"
          onConfirm={() => {
            onSendPrompt(`/opsx:archive ${attached}`);
            setArchiveConfirm(false);
          }}
          onCancel={() => setArchiveConfirm(false)}
        />
      )}
    </div>
  );
}
