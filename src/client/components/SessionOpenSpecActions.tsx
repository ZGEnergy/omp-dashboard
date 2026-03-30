import React, { useState } from "react";
import type { DashboardSession, OpenSpecChange } from "../../shared/types.js";
import { ChangeState, deriveChangeState } from "../../shared/types.js";
import { ExploreDialog } from "./ExploreDialog.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DialogPortal } from "./DialogPortal.js";
import { ArtifactLettersButton } from "./openspec-helpers.js";
import { NewChangeDialog } from "./NewChangeDialog.js";

function ActionButton({ label, onClick, testId, disabled }: { label: string; onClick: () => void; testId?: string; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[var(--text-secondary)] disabled:hover:border-[var(--border-secondary)]"
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
  const [newChangeOpen, setNewChangeOpen] = useState(false);

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
        <div className="flex items-center gap-1.5">
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
          {!isEnded && (
            <>
              <ActionButton label="+ Change" onClick={() => setNewChangeOpen(true)} testId="new-change-btn" />
              <ActionButton label="Explore" onClick={() => setExploreOpen(true)} testId="explore-unattached-btn" />
            </>
          )}
        </div>
        {newChangeOpen && (
          <DialogPortal><NewChangeDialog
            onSend={(prompt) => {
              onSendPrompt(prompt);
              setNewChangeOpen(false);
            }}
            onClose={() => setNewChangeOpen(false)}
          /></DialogPortal>
        )}
        {exploreOpen && (
          <DialogPortal><ExploreDialog
            changeName=""
            onSend={(text) => {
              onSendPrompt(`/skill:openspec-explore\n${text}`);
              setExploreOpen(false);
            }}
            onClose={() => setExploreOpen(false)}
          /></DialogPortal>
        )}
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

  const state = deriveChangeState(change);

  return (
    <div className="mt-1 space-y-1" data-testid="session-openspec-actions">
      {/* Line 1: badge + detach + artifact letters right-aligned */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px]" data-testid="attached-badge">📋 <span className="text-blue-400">{attached}</span></span>
        <ActionButton label="Detach" onClick={onDetach} testId="detach-btn" />
        <span className="flex-1" />
        <ArtifactLettersButton artifacts={change.artifacts} changeName={change.name} onReadArtifact={onReadArtifact} />
      </div>
      {/* Line 2: action buttons driven by ChangeState */}
      {!isEnded && (() => {
        const actionsDisabled = session.status === "streaming";
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <ActionButton label="Explore" onClick={() => setExploreOpen(true)} testId="explore-btn" disabled={actionsDisabled} />
            {state === ChangeState.PLANNING && (
              <>
                <ActionButton label="Continue" onClick={() => onSendPrompt(`/opsx:continue ${attached}`)} testId="continue-btn" disabled={actionsDisabled} />
                <ActionButton label="FF" onClick={() => onSendPrompt(`/opsx:ff ${attached}`)} testId="ff-btn" disabled={actionsDisabled} />
              </>
            )}
            {(state === ChangeState.READY || state === ChangeState.IMPLEMENTING) && (
              <ActionButton label="Apply" onClick={() => onSendPrompt(`/opsx:apply ${attached}`)} testId="apply-btn" disabled={actionsDisabled} />
            )}
            {state === ChangeState.COMPLETE && (
              <>
                <ActionButton label="Verify" onClick={() => onSendPrompt(`/opsx:verify ${attached}`)} testId="verify-btn" disabled={actionsDisabled} />
                <ActionButton label="Archive" onClick={() => setArchiveConfirm(true)} testId="archive-btn" disabled={actionsDisabled} />
              </>
            )}
          </div>
        );
      })()}

      {exploreOpen && (
        <DialogPortal><ExploreDialog
          changeName={attached}
          onSend={(text) => {
            onSendPrompt(`/skill:openspec-explore ${attached}\n${text}`);
            setExploreOpen(false);
          }}
          onClose={() => setExploreOpen(false)}
        /></DialogPortal>
      )}

      {archiveConfirm && (
        <DialogPortal><ConfirmDialog
          message={`Archive "${attached}"?`}
          confirmLabel="Archive"
          onConfirm={() => {
            onSendPrompt(`/opsx:archive ${attached}`);
            setArchiveConfirm(false);
          }}
          onCancel={() => setArchiveConfirm(false)}
        /></DialogPortal>
      )}
    </div>
  );
}
