import React, { useState } from "react";
import { Icon } from "@mdi/react";
import {
  mdiCompassOutline,
  mdiChevronRight,
  mdiFastForward,
  mdiPlayCircleOutline,
  mdiCheckCircleOutline,
  mdiArchiveOutline,
  mdiArchiveArrowUp,
  mdiLinkOff,
  mdiPlus,
  mdiPaperclip,
} from "@mdi/js";
import type { DashboardSession, OpenSpecChange } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { ChangeState, deriveChangeState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { ExploreDialog } from "./ExploreDialog.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { DialogPortal } from "./DialogPortal.js";
import { ArtifactLettersButton } from "./openspec-helpers.js";
import { NewChangeDialog } from "./NewChangeDialog.js";
import { SearchableSelectDialog, type SelectOption } from "./SearchableSelectDialog.js";

function ActionButton({ label, icon, onClick, testId, disabled }: { label: string; icon?: string; onClick: () => void; testId?: string; disabled?: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-[var(--text-secondary)] disabled:hover:border-[var(--border-secondary)]"
      data-testid={testId}
    >
      {icon && <Icon path={icon} size={0.4} className="inline mr-0.5" />}{label}
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
  onBulkArchive?: () => void;
}

export function SessionOpenSpecActions({ session, changes, onAttach, onDetach, onSendPrompt, onReadArtifact, onBulkArchive }: Props) {
  const [exploreOpen, setExploreOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [attachingName, setAttachingName] = useState<string | null>(null);
  const [newChangeOpen, setNewChangeOpen] = useState(false);
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);

  const attached = session.attachedProposal;
  const isEnded = session.status === "ended";
  const hasCompletedChanges = changes.some((c) => c.status === "complete");
  const actionsDisabledGlobal = session.status === "streaming";

  const bulkArchiveButton = hasCompletedChanges && onBulkArchive ? (
    <ActionButton
      label="Bulk Archive"
      icon={mdiArchiveArrowUp}
      onClick={() => setBulkArchiveConfirm(true)}
      testId="bulk-archive-btn"
      disabled={actionsDisabledGlobal}
    />
  ) : null;

  const bulkArchiveDialog = bulkArchiveConfirm ? (
    <DialogPortal><ConfirmDialog
      message="Bulk archive all completed changes?"
      confirmLabel="Bulk Archive"
      onConfirm={() => {
        onBulkArchive?.();
        setBulkArchiveConfirm(false);
      }}
      onCancel={() => setBulkArchiveConfirm(false)}
    /></DialogPortal>
  ) : null;

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

    const changeOptions: SelectOption[] = [
      ...changes.filter((c) => c.status !== "complete"),
      ...changes.filter((c) => c.status === "complete"),
    ].map((c) => {
      const state = deriveChangeState(c);
      const stateLabels: Record<string, string> = {
        PLANNING: "Planning",
        READY: "Ready to implement",
        IMPLEMENTING: `Implementing — ${c.completedTasks}/${c.totalTasks} tasks`,
        COMPLETE: `Complete — ${c.completedTasks}/${c.totalTasks} tasks`,
      };
      const desc = stateLabels[state] || c.status;
      const artifactNames = c.artifacts.map(a => a.id).join(", ");
      return {
        value: c.name,
        label: c.name,
        description: artifactNames ? `${desc} · ${artifactNames}` : desc,
        badge: c.status === "complete" ? "✓" : c.status === "in-progress" ? `${c.completedTasks}/${c.totalTasks}` : undefined,
        badgeColor: c.status === "complete" ? "text-green-400" : "text-blue-400",
      };
    });

    return (
      <div className="mt-1" data-testid="session-openspec-actions">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">OpenSpec:</span>
          <button
            data-testid="attach-combo"
            disabled={changes.length === 0}
            onClick={(e) => { e.stopPropagation(); setAttachPickerOpen(true); }}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-blue-500/50 disabled:opacity-40"
          >
            <Icon path={mdiPaperclip} size={0.4} className="inline mr-0.5" />{changes.length === 0 ? "No changes" : "Attach change..."}
          </button>
          {!isEnded && (
            <>
              <ActionButton label="Change" icon={mdiPlus} onClick={() => setNewChangeOpen(true)} testId="new-change-btn" />
              <ActionButton label="Explore" icon={mdiCompassOutline} onClick={() => setExploreOpen(true)} testId="explore-unattached-btn" />
              {bulkArchiveButton}
            </>
          )}
        </div>
        {bulkArchiveDialog}
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
        {attachPickerOpen && (
          <SearchableSelectDialog
            title="Attach OpenSpec Change"
            options={changeOptions}
            placeholder="Search changes..."
            emptyMessage="No changes available"
            onSelect={(value) => {
              setAttachingName(value);
              onAttach(value);
              setAttachPickerOpen(false);
            }}
            onCancel={() => setAttachPickerOpen(false)}
          />
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
          <span className="text-[10px] text-[var(--text-muted)]">OpenSpec:</span>
          <span className="text-[11px] text-[var(--text-tertiary)]"><Icon path={mdiPaperclip} size={0.4} className="inline mr-0.5" />{attached}</span>
          <span className="flex-1" />
          <ActionButton label="Detach" icon={mdiLinkOff} onClick={onDetach} testId="detach-btn" />
        </div>
      </div>
    );
  }

  const state = deriveChangeState(change);

  return (
    <div className="mt-1 space-y-1" data-testid="session-openspec-actions">
      {/* Line 1: badge + detach + artifact letters right-aligned */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--text-muted)]">OpenSpec:</span>
        <span className="text-[11px]" data-testid="attached-badge"><Icon path={mdiPaperclip} size={0.4} className="inline mr-0.5" /><span className="text-blue-400">{attached}</span></span>
        <ActionButton label="Detach" icon={mdiLinkOff} onClick={onDetach} testId="detach-btn" />
        <span className="flex-1" />
        <ArtifactLettersButton artifacts={change.artifacts} changeName={change.name} onReadArtifact={onReadArtifact} />
      </div>
      {/* Line 2: action buttons driven by ChangeState */}
      {!isEnded && (() => {
        const actionsDisabled = session.status === "streaming";
        return (
          <div className="flex items-center gap-1 flex-wrap">
            <ActionButton label="Explore" icon={mdiCompassOutline} onClick={() => setExploreOpen(true)} testId="explore-btn" disabled={actionsDisabled} />
            {state === ChangeState.PLANNING && (
              <>
                <ActionButton label="Continue" icon={mdiChevronRight} onClick={() => onSendPrompt(`/opsx:continue ${attached}`)} testId="continue-btn" disabled={actionsDisabled} />
                <ActionButton label="FF" icon={mdiFastForward} onClick={() => onSendPrompt(`/opsx:ff ${attached}`)} testId="ff-btn" disabled={actionsDisabled} />
              </>
            )}
            {(state === ChangeState.READY || state === ChangeState.IMPLEMENTING) && (
              <ActionButton label="Apply" icon={mdiPlayCircleOutline} onClick={() => onSendPrompt(`/opsx:apply ${attached}`)} testId="apply-btn" disabled={actionsDisabled} />
            )}
            {state === ChangeState.COMPLETE && (
              <>
                <ActionButton label="Verify" icon={mdiCheckCircleOutline} onClick={() => onSendPrompt(`/opsx:verify ${attached}`)} testId="verify-btn" disabled={actionsDisabled} />
                <ActionButton label="Archive" icon={mdiArchiveOutline} onClick={() => setArchiveConfirm(true)} testId="archive-btn" disabled={actionsDisabled} />
              </>
            )}
            {bulkArchiveButton}
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
      {bulkArchiveDialog}
    </div>
  );
}
