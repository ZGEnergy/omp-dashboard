import React, { useState, type ReactNode } from "react";
import Icon from "@mdi/react";
import { mdiFlash, mdiOpenInNew, mdiPencil, mdiPencilOutline, mdiSourceBranch, mdiClose, mdiEyeOffOutline, mdiEyeOutline, mdiConsoleLine, mdiRobotOutline, mdiCodeTags, mdiApplicationOutline } from "@mdi/js";
import type { DashboardSession } from "../../shared/types.js";
import { getSessionDisplayName } from "../lib/session-display-name.js";
import { formatRelativeTime, formatTokens } from "../lib/format.js";
import type { DetectedEditor } from "../lib/editor-api.js";
import { ContextUsageBar } from "./ContextUsageBar.js";
import type { ContextUsageInfo } from "./SessionList.js";
import type { OpenSpecData, OpenSpecChange } from "../../shared/types.js";
import { SessionOpenSpecActions } from "./SessionOpenSpecActions.js";
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
  dashboard: "text-blue-400",
  terminal: "text-cyan-400",
  unknown: "text-[var(--text-tertiary)]",
};

const sourceIcons: Record<string, string> = {
  tui: mdiConsoleLine,
  dashboard: mdiRobotOutline,
  tmux: mdiApplicationOutline,
  zed: mdiCodeTags,
  terminal: mdiConsoleLine,
};

const sourceLabels: Record<string, string> = {
  tui: "TUI",
  dashboard: "Headless",
  tmux: "tmux",
  zed: "Zed",
  terminal: "Terminal",
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
  openspecChanges,
  onSendPrompt,
  onAttachProposal,
  onDetachProposal,
  onReadArtifact,
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
  openspecChanges?: OpenSpecChange[];
  onSendPrompt?: (text: string) => void;
  onAttachProposal?: (changeName: string) => void;
  onDetachProposal?: () => void;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
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
      className={`px-3 py-2.5 cursor-pointer rounded-xl shadow-md shadow-[var(--shadow-card)] border border-[var(--border-subtle)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 bg-[var(--bg-tertiary)] ${
        isSelected ? "border-l-2 border-l-blue-500/40" : ""
      } ${isHidden ? "opacity-40" : ""}`}
    >
      <div className="flex gap-2">
      {/* Left gutter: source icon vertically centered */}
      <div className="flex flex-col items-center flex-shrink-0 w-4 pt-1">
        <span
          className={`w-2 h-2 rounded-full ${statusColors[session.status] ?? "bg-[var(--bg-surface)]"}`}
        />
        <span className="flex-1" />
        <span
          className={`${sourceBadgeColors[session.source] ?? "text-[var(--text-tertiary)]"}`}
          title={sourceLabels[session.source] ?? session.source}
        >
          <Icon path={sourceIcons[session.source] ?? mdiConsoleLine} size={0.55} />
        </span>
        <span className="flex-1" />
      </div>
      {/* Card content */}
      <div className="flex-1 min-w-0">
      {/* Line 1: name + time */}
      <div className="flex items-center gap-2">
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
        {/* Hide/unhide button */}
        {isHidden ? (
          <button
            onClick={(e) => { e.stopPropagation(); onUnhide(session.id); }}
            className="text-[var(--text-tertiary)] hover:text-green-400 p-0.5 flex-shrink-0"
            title="Show session"
            data-testid="session-unhide-btn"
          >
            <Icon path={mdiEyeOutline} size={0.45} />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onHide(session.id); }}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-muted)] p-0.5 flex-shrink-0"
            title="Hide session"
            data-testid="session-hide-btn"
          >
            <Icon path={mdiEyeOffOutline} size={0.45} />
          </button>
        )}
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

      {/* Line 2: model + thinking level + source/fork right-aligned */}
      <div className="flex items-center mt-0.5 gap-1.5">
        {session.model && (
          <span className="text-xs text-[var(--text-tertiary)] truncate">
            {session.model}{session.thinkingLevel ? ` (${session.thinkingLevel})` : ""}
          </span>
        )}
        <span className="flex-1" />
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
      </div>

      {/* Line 3: activity + cost */}
      <div className="flex items-center justify-between mt-0.5 text-[11px] gap-2">
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
              ? openspecChanges?.find((c) => c.name === session.openspecChange)?.completedTasks
              : undefined
          }
          totalTasks={
            session.openspecChange
              ? openspecChanges?.find((c) => c.name === session.openspecChange)?.totalTasks
              : undefined
          }
        />
      ) : null}

      {/* Line 4: context usage bar */}
      <div className="mt-1">
        <ContextUsageBar
          tokens={contextUsage?.tokens ?? null}
          contextWindow={contextUsage?.contextWindow}
        />
      </div>

      {/* Line 4: git info (only for single-session groups) */}
      {showGitInfo && <GitInfo session={session} />}

      {/* Thin divider before action row */}
      {editors && editors.length > 0 && onOpenEditor && (
        <div className="border-t border-[var(--border-secondary)] mt-1.5 pt-1.5 flex items-center gap-2">
          <EditorButtons editors={editors} onOpen={onOpenEditor} />
        </div>
      )}

      {/* OpenSpec attach/actions */}
      {openspecChanges && onSendPrompt && onAttachProposal && onDetachProposal && (
        <SessionOpenSpecActions
          session={session}
          changes={openspecChanges}
          onAttach={onAttachProposal}
          onDetach={onDetachProposal}
          onSendPrompt={onSendPrompt}
          onReadArtifact={onReadArtifact}
        />
      )}
      </div>{/* end card content */}
      </div>{/* end flex row */}
    </li>
  );
}
