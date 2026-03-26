import React, { useState, type ReactNode } from "react";
import Icon from "@mdi/react";
import { mdiFlash, mdiOpenInNew, mdiPencil, mdiPencilOutline, mdiSourceBranch, mdiClose, mdiEyeOffOutline, mdiEyeOutline } from "@mdi/js";
import type { DashboardSession } from "../../shared/types.js";
import { getSessionDisplayName } from "../lib/session-display-name.js";
import { formatRelativeTime, formatTokens } from "../lib/format.js";
import type { DetectedEditor } from "../lib/editor-api.js";
import { ContextUsageBar } from "./ContextUsageBar.js";
import type { ContextUsageInfo } from "./SessionList.js";
import type { OpenSpecData } from "../../shared/types.js";
import { OpenSpecSection } from "./OpenSpecSection.js";
import { OpenSpecActivityBadge } from "./OpenSpecActivityBadge.js";
import { InlineRenameInput } from "./InlineRenameInput.js";

export const statusColors: Record<string, string> = {
  active: "bg-green-500",
  streaming: "bg-yellow-500 animate-pulse",
  idle: "bg-green-500",
  ended: "bg-[var(--bg-surface)]",
};

export const sourceBadgeColors: Record<string, string> = {
  tui: "text-blue-400",
  zed: "text-purple-400",
  tmux: "text-orange-400",
  dashboard: "text-green-400",
  unknown: "text-[var(--text-tertiary)]",
};

export function ActivityIndicator({ session }: { session: DashboardSession }) {
  if (session.status === "ended") return null;

  if (session.currentTool) {
    return <span className="text-yellow-400 truncate inline-flex items-center gap-0.5"><Icon path={mdiFlash} size={0.5} /> {session.currentTool}</span>;
  }

  if (session.status === "streaming") {
    return <span className="text-green-400">Thinking…</span>;
  }

  if (session.status === "idle") {
    return <span className="text-[var(--text-tertiary)]">Waiting for input</span>;
  }

  return null;
}

export function TokenStats({ session }: { session: DashboardSession }) {
  const hasStats = (session.tokensIn ?? 0) > 0 || (session.tokensOut ?? 0) > 0;
  if (!hasStats) return null;

  return (
    <span className="text-[var(--text-tertiary)] whitespace-nowrap">
      {formatTokens(session.tokensIn ?? 0)}↑ {formatTokens(session.tokensOut ?? 0)}↓
      {(session.cacheRead ?? 0) > 0 && (
        <span className="ml-1">R{formatTokens(session.cacheRead ?? 0)}</span>
      )}
      {(session.cacheWrite ?? 0) > 0 && (
        <span className="ml-1">W{formatTokens(session.cacheWrite ?? 0)}</span>
      )}
      {session.cost != null && session.cost > 0 && (
        <span className="ml-1">${session.cost.toFixed(2)}</span>
      )}
    </span>
  );
}

export function GitInfo({ session }: { session: DashboardSession }) {
  if (!session.gitBranch) return null;

  return (
    <div className="text-[11px] mt-0.5 ml-4 flex items-center gap-1.5 text-[var(--text-tertiary)]">
      <Icon path={mdiSourceBranch} size={0.5} />
      {session.gitBranchUrl ? (
        <a href={session.gitBranchUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
          {session.gitBranch}
        </a>
      ) : (
        <span className="truncate">{session.gitBranch}</span>
      )}
      {session.gitPrNumber != null && (
        <>
          <span className="text-[var(--text-muted)]">·</span>
          {session.gitPrUrl ? (
            <a href={session.gitPrUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              #{session.gitPrNumber}
            </a>
          ) : (
            <span>#{session.gitPrNumber}</span>
          )}
        </>
      )}
    </div>
  );
}

export function GroupGitInfo({ sessions }: { sessions: DashboardSession[] }) {
  const session = sessions.find((s) => s.gitBranch);
  if (!session?.gitBranch) return null;

  return (
    <div className="text-[11px] flex items-center gap-1.5 text-[var(--text-tertiary)]">
      <Icon path={mdiSourceBranch} size={0.5} />
      {session.gitBranchUrl ? (
        <a href={session.gitBranchUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate">
          {session.gitBranch}
        </a>
      ) : (
        <span className="truncate">{session.gitBranch}</span>
      )}
      {session.gitPrNumber != null && (
        <>
          <span className="text-[var(--text-muted)]">·</span>
          {session.gitPrUrl ? (
            <a href={session.gitPrUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              #{session.gitPrNumber}
            </a>
          ) : (
            <span>#{session.gitPrNumber}</span>
          )}
        </>
      )}
    </div>
  );
}

const editorIcons: Record<string, ReactNode> = {
  zed: <Icon path={mdiOpenInNew} size={0.5} />,
  vscode: <Icon path={mdiOpenInNew} size={0.5} />,
  idea: <Icon path={mdiOpenInNew} size={0.5} />,
};

export function EditorButtons({
  editors,
  onOpen,
}: {
  editors: DetectedEditor[];
  onOpen: (editorId: string) => void;
}) {
  if (editors.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {editors.map((editor) => (
        <button
          key={editor.id}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(editor.id);
          }}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-blue-400 hover:border-blue-500/50"
          title={`Open in ${editor.name}`}
        >
          <span className="inline-flex items-center gap-0.5">{editorIcons[editor.id] ?? <Icon path={mdiOpenInNew} size={0.5} />} {editor.name}</span>
        </button>
      ))}
    </div>
  );
}

export function SessionCard({
  session,
  selectedId,
  onSelect,
  now,
  showGitInfo,
  isHidden,
  onHide,
  onUnhide,
  editors,
  onOpenEditor,
  contextUsage,
  openspecData,
  onSendPrompt,
  onOpenSpecRefresh,
  onAttachProposal,
  onDetachProposal,
  onRename,
  onShutdown,
  onResume,
}: {
  session: DashboardSession;
  selectedId?: string;
  onSelect: (id: string) => void;
  now: number;
  showGitInfo: boolean;
  isHidden: boolean;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  editors?: DetectedEditor[];
  onOpenEditor?: (editorId: string) => void;
  contextUsage?: ContextUsageInfo;
  openspecData?: OpenSpecData;
  onSendPrompt?: (text: string) => void;
  onOpenSpecRefresh?: () => void;
  onAttachProposal?: (changeName: string) => void;
  onDetachProposal?: () => void;
  onRename?: (name: string) => void;
  onShutdown?: (id: string) => void;
  onResume?: (mode: "continue" | "fork") => void;
}) {
  const isSelected = selectedId === session.id;
  const [isRenaming, setIsRenaming] = useState(false);
  const canRename = session.status !== "ended" && !!onRename;
  const isAlive = session.status !== "ended";

  function handleConfirmRename(name: string) {
    setIsRenaming(false);
    onRename?.(name);
  }

  return (
    <li
      onClick={() => onSelect(session.id)}
      className={`px-3 py-2.5 cursor-pointer rounded-xl shadow-md shadow-[var(--shadow-card)] border border-[var(--border-subtle)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${
        isSelected ? "bg-[var(--bg-tertiary)] border-l-2 border-l-blue-500/40" : ""
      } ${isHidden ? "opacity-40" : ""}`}
    >
      {/* Line 1: status dot + name + time */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[session.status] ?? "bg-[var(--bg-surface)]"}`}
        />
        {isRenaming ? (
          <InlineRenameInput
            currentName={getSessionDisplayName(session)}
            onConfirm={handleConfirmRename}
            onCancel={() => setIsRenaming(false)}
            className="flex-1"
          />
        ) : (
          <span
            className={`text-sm truncate flex-1 ${canRename ? "cursor-text" : ""}`}
            onDoubleClick={(e) => {
              if (canRename) {
                e.stopPropagation();
                setIsRenaming(true);
              }
            }}
          >
            {getSessionDisplayName(session)}
          </span>
        )}
        {canRename && !isRenaming && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-0.5 flex-shrink-0"
            title="Rename session"
          >
            <Icon path={mdiPencilOutline} size={0.45} />
          </button>
        )}
        <span className="text-[10px] text-[var(--text-muted)]">
          {formatRelativeTime(now - session.startedAt)}
        </span>
        {isAlive && onShutdown && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (session.status === "streaming") {
                if (!window.confirm("Session is currently running. Exit anyway?")) return;
              }
              onShutdown(session.id);
            }}
            className="text-[var(--text-muted)] hover:text-red-400 p-0.5 flex-shrink-0"
            title="Exit pi session"
            data-testid="session-close-btn"
          >
            <Icon path={mdiClose} size={0.5} />
          </button>
        )}
      </div>

      {/* Line 2: model + thinking level */}
      {session.model && (
        <div className="text-xs text-[var(--text-tertiary)] mt-0.5 ml-4 truncate">
          {session.model}{session.thinkingLevel ? ` (${session.thinkingLevel})` : ""}
        </div>
      )}

      {/* Line 3: activity + cost */}
      <div className="flex items-center justify-between mt-0.5 ml-4 text-[11px] gap-2">
        <ActivityIndicator session={session} />
        {session.cost != null && session.cost > 0 && (
          <span className="text-[var(--text-tertiary)]">${session.cost.toFixed(2)}</span>
        )}
      </div>

      {/* OpenSpec activity badge */}
      {session.openspecPhase ? (
        <OpenSpecActivityBadge
          phase={session.openspecPhase!}
          changeName={session.openspecChange ?? undefined}
          completedTasks={
            session.openspecChange
              ? openspecData?.changes?.find((c) => c.name === session.openspecChange)?.completedTasks
              : undefined
          }
          totalTasks={
            session.openspecChange
              ? openspecData?.changes?.find((c) => c.name === session.openspecChange)?.totalTasks
              : undefined
          }
        />
      ) : session.attachedProposal ? (
        <div className="text-[11px] mt-0.5 ml-4 text-[var(--text-tertiary)]">
          📋 {session.attachedProposal}
        </div>
      ) : null}

      {/* Line 4: context usage bar */}
      <div className="mt-1 ml-4">
        <ContextUsageBar
          tokens={contextUsage?.tokens ?? null}
          contextWindow={contextUsage?.contextWindow}
        />
      </div>

      {/* Line 4: git info (only for single-session groups) */}
      {showGitInfo && <GitInfo session={session} />}

      {/* Thin divider before action row */}
      <div className="border-t border-[var(--border-secondary)] mt-1.5 pt-1.5 ml-4 flex items-center gap-2">
        {/* Editor buttons (left) */}
        {editors && editors.length > 0 && onOpenEditor && (
          <EditorButtons editors={editors} onOpen={onOpenEditor} />
        )}
        {/* Source badge */}
        <span className={`text-[10px] ${sourceBadgeColors[session.source] ?? "text-[var(--text-tertiary)]"}`}>
          {session.source}
        </span>
        {/* Fork: all sessions; Resume: ended or hidden */}
        {onResume && session.sessionFile && (
          <>
            {(!isAlive || isHidden) && (
              <button
                onClick={(e) => { e.stopPropagation(); onResume("continue"); }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 hover:bg-green-500/10"
                title="Resume session (continue same session)"
              >
                Resume
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onResume("fork"); }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              title="Fork session (new session from this point)"
            >
              Fork
            </button>
          </>
        )}
        {/* Spacer */}
        <span className="flex-1" />
        {/* Hide/unhide button (right) */}
        {isHidden ? (
          <button
            onClick={(e) => { e.stopPropagation(); onUnhide(session.id); }}
            className="text-[var(--text-tertiary)] hover:text-green-400 p-0.5"
            title="Show session"
            data-testid="session-unhide-btn"
          >
            <Icon path={mdiEyeOutline} size={0.45} />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onHide(session.id); }}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-muted)] p-0.5"
            title="Hide session"
            data-testid="session-hide-btn"
          >
            <Icon path={mdiEyeOffOutline} size={0.45} />
          </button>
        )}
      </div>

      {/* Accordion expanded section */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: isSelected ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {isSelected && openspecData?.initialized && (
            <div className="mt-2 pt-2 border-t border-[var(--border-secondary)]">
              <OpenSpecSection
                data={openspecData}
                attachedProposal={session.attachedProposal}
                onSendPrompt={onSendPrompt}
                onRefresh={onOpenSpecRefresh}
                onAttach={onAttachProposal}
                onDetach={onDetachProposal}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
