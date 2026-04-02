import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Icon } from "@mdi/react";
import { mdiChevronRight, mdiChevronDown, mdiChevronLeft, mdiPlus, mdiPin, mdiPinOff, mdiConsoleLine, mdiCog, mdiPuzzleOutline } from "@mdi/js";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableSessionCard } from "./SortableSessionCard.js";
import { SortablePinnedGroup } from "./SortablePinnedGroup.js";
import type { DashboardSession, OpenSpecData, CommandInfo, FlowInfo } from "../../shared/types.js";
import type { TerminalSession } from "../../shared/terminal-types.js";
import { TerminalCard } from "./TerminalCard.js";
import {
  getActiveOnly,
  setActiveOnly as persistActiveOnly,
  getCollapsedGroups,
  setCollapsedGroups,
  pruneStaleCollapsedGroups,
  removeLegacyHiddenSessions,
} from "../lib/session-filter-storage.js";
import { SessionCard, GroupGitInfo, EditorButtons, branchCache } from "./SessionCard.js";
import { PlaceholderSessionCard } from "./PlaceholderSessionCard.js";
import { FolderOpenSpecSection } from "./FolderOpenSpecSection.js";
import { ThemeToggle } from "./ThemeToggle.js";
import { ThemePicker } from "./ThemePicker.js";
import { useEditors } from "../lib/use-editors.js";
import { openEditor } from "../lib/editor-api.js";
import { Toast, useToast } from "./Toast.js";
import { PinDirectoryDialog } from "./PinDirectoryDialog.js";
import { DialogPortal } from "./DialogPortal.js";
import { BranchSwitchDialog } from "./BranchSwitchDialog.js";
import { truncatePathMiddle } from "../lib/truncate-path.js";
import { TunnelButton } from "./TunnelButton.js";
import { InstallButton } from "./InstallButton.js";
import { useInstallPrompt } from "../hooks/useInstallPrompt.js";


export interface ContextUsageInfo {
  tokens: number | null;
  contextWindow: number;
}

interface Props {
  sessions: DashboardSession[];
  selectedId?: string;
  onSelect: (sessionId: string) => void;
  contextUsageMap?: Map<string, ContextUsageInfo>;
  openspecMap?: Map<string, OpenSpecData>;
  sessionOrderMap?: Map<string, string[]>;
  onReorderSessions?: (cwd: string, sessionIds: string[]) => void;
  onSendPrompt?: (sessionId: string, text: string) => void;
  onOpenSpecRefresh?: (cwd: string) => void;
  onAttachProposal?: (sessionId: string, changeName: string) => void;
  onBulkArchive?: (cwd: string) => void;
  onReadArtifact?: (cwd: string, changeName: string, artifactId: string) => void;
  onOpenPiResources?: (cwd: string) => void;
  onDetachProposal?: (sessionId: string) => void;
  onRename?: (sessionId: string, name: string) => void;
  onShutdown?: (sessionId: string) => void;
  onResume?: (sessionId: string, mode: "continue" | "fork") => void;
  onHideSession?: (sessionId: string) => void;
  onUnhideSession?: (sessionId: string) => void;
  onSpawnSession?: (cwd: string) => void;
  spawningCwds?: Set<string>;
  spawnResult?: { success: boolean; message: string } | null;
  onSpawnResultSeen?: () => void;
  pinnedDirectories?: string[];
  onPinDirectory?: (dirPath: string) => void;
  onUnpinDirectory?: (dirPath: string) => void;
  onReorderPinnedDirs?: (paths: string[]) => void;
  terminals?: TerminalSession[];
  onCreateTerminal?: (cwd: string) => void;
  onKillTerminal?: (terminalId: string) => void;
  onRenameTerminal?: (terminalId: string, title: string) => void;
  onCollapseSidebar?: () => void;
  commandsMap?: Map<string, CommandInfo[]>;
  flowsMap?: Map<string, FlowInfo[]>;
  onOpenSpecs?: (cwd: string) => void;
}

/** Sort sessions within a group by server order, then by startedAt descending for unordered ones. */
function sortSessionsByOrder(sessions: DashboardSession[], order?: string[]): DashboardSession[] {
  if (!order || order.length === 0) {
    return [...sessions].sort((a, b) => b.startedAt - a.startedAt);
  }
  const orderIndex = new Map(order.map((id, i) => [id, i]));
  const ordered: DashboardSession[] = [];
  const unordered: DashboardSession[] = [];
  for (const s of sessions) {
    if (orderIndex.has(s.id)) {
      ordered.push(s);
    } else {
      unordered.push(s);
    }
  }
  ordered.sort((a, b) => orderIndex.get(a.id)! - orderIndex.get(b.id)!);
  unordered.sort((a, b) => b.startedAt - a.startedAt);
  return [...ordered, ...unordered];
}

/** Get unified order of session + terminal IDs for a group. */
function getUnifiedOrder(sessions: DashboardSession[], terminals: TerminalSession[], order?: string[]): string[] {
  const allIds = new Set([...sessions.map((s) => s.id), ...terminals.map((t) => t.id)]);
  if (!order || order.length === 0) {
    // Default: terminals first (newest first), then sessions (newest first)
    return [
      ...terminals.sort((a, b) => b.createdAt - a.createdAt).map((t) => t.id),
      ...sessions.sort((a, b) => b.startedAt - a.startedAt).map((s) => s.id),
    ];
  }
  const ordered = order.filter((id) => allIds.has(id));
  const unordered = [...allIds].filter((id) => !new Set(ordered).has(id));
  return [...ordered, ...unordered];
}

export interface DirectoryGroup {
  cwd: string;
  sessions: DashboardSession[];
  pinned: boolean;
}

/** Group sessions by cwd, with pinned directories first (in pinned order), then unpinned sorted by recency. */
export function groupSessionsByDirectory(
  sessions: DashboardSession[],
  orderMap?: Map<string, string[]>,
  pinnedDirectories?: string[],
): { pinned: DirectoryGroup[]; unpinned: DirectoryGroup[] } {
  const groups = new Map<string, DashboardSession[]>();
  for (const session of sessions) {
    const existing = groups.get(session.cwd);
    if (existing) {
      existing.push(session);
    } else {
      groups.set(session.cwd, [session]);
    }
  }

  const pinnedSet = new Set(pinnedDirectories ?? []);

  // Build pinned groups in pinned order (including zero-session groups)
  const pinned: DirectoryGroup[] = [];
  for (const dir of pinnedDirectories ?? []) {
    pinned.push({
      cwd: dir,
      sessions: sortSessionsByOrder(groups.get(dir) ?? [], orderMap?.get(dir)),
      pinned: true,
    });
  }

  // Build unpinned groups sorted by most recent activity
  const unpinned = Array.from(groups.entries())
    .filter(([cwd]) => !pinnedSet.has(cwd))
    .map(([cwd, groupSessions]) => ({
      cwd,
      sessions: sortSessionsByOrder(groupSessions, orderMap?.get(cwd)),
      pinned: false,
    }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.startedAt));
      const bMax = Math.max(...b.sessions.map((s) => s.startedAt));
      return bMax - aMax;
    });

  return { pinned, unpinned };
}

/** Apply filter pipeline: active-only → hidden → visible sessions */
export function filterSessions(
  sessions: DashboardSession[],
  activeOnly: boolean,
  showHidden: boolean,
): DashboardSession[] {
  return sessions.filter((s) => {
    if (activeOnly && s.status === "ended") return false;
    if (s.hidden && !showHidden) return false;
    return true;
  });
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 rounded border ${
        active
          ? "border-blue-500/50 text-blue-400 bg-blue-500/10"
          : "border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

export function SessionList({ sessions, selectedId, onSelect, contextUsageMap, openspecMap, sessionOrderMap, onReorderSessions, onSendPrompt, onOpenSpecRefresh, onAttachProposal, onDetachProposal, onBulkArchive, onReadArtifact, onOpenPiResources, onRename, onShutdown, onResume, onHideSession, onUnhideSession, onSpawnSession, spawningCwds, spawnResult, onSpawnResultSeen, pinnedDirectories, onPinDirectory, onUnpinDirectory, onReorderPinnedDirs, terminals, onCreateTerminal, onKillTerminal, onRenameTerminal, onCollapseSidebar, commandsMap, flowsMap, onOpenSpecs }: Props) {
  const now = Date.now();
  const [, navigate] = useLocation();
  const { messages, showToast, dismissToast } = useToast();
  const installPrompt = useInstallPrompt();


  // Detect editors for all unique cwds (sessions + pinned directories)
  const cwds = useMemo(() => [...sessions.map((s) => s.cwd), ...(pinnedDirectories ?? [])], [sessions, pinnedDirectories]);
  const editorMap = useEditors(cwds);

  const handleOpenEditor = useCallback(async (cwd: string, editorId: string) => {
    const result = await openEditor(cwd, editorId);
    if (!result.success) {
      showToast(result.error ?? "Failed to open editor");
    }
  }, [showToast]);

  // Remove legacy client-side hidden storage on mount
  useEffect(() => {
    removeLegacyHiddenSessions();
  }, []);

  // Show toast for spawn results
  useEffect(() => {
    if (spawnResult) {
      showToast(spawnResult.success ? spawnResult.message : `Spawn failed: ${spawnResult.message}`);
      onSpawnResultSeen?.();
    }
  }, [spawnResult, showToast, onSpawnResultSeen]);

  // Pin directory dialog state
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [branchDialogCwd, setBranchDialogCwd] = useState<string | null>(null);

  // Filter state - active-only defaults to ON
  const [activeOnly, setActiveOnly] = useState(() => getActiveOnly());
  const [showHidden, setShowHidden] = useState(false);

  // Collapsed groups state
  const [collapsedGroups, setCollapsedGroupsState] = useState(() => getCollapsedGroups());

  // Prune stale collapsed groups when sessions change
  useEffect(() => {
    if (sessions.length === 0) return;
    const knownCwds = new Set(sessions.map((s) => s.cwd));
    const prunedGroups = pruneStaleCollapsedGroups(knownCwds);
    setCollapsedGroupsState(prunedGroups);
  }, [sessions.length]);

  const handleActiveOnlyToggle = useCallback(() => {
    setActiveOnly((prev) => {
      const next = !prev;
      persistActiveOnly(next);
      return next;
    });
  }, []);

  const handleHide = useCallback((id: string) => {
    onHideSession?.(id);
  }, [onHideSession]);

  const handleToggleCollapse = useCallback((cwd: string) => {
    setCollapsedGroupsState((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) {
        next.delete(cwd);
      } else {
        next.add(cwd);
      }
      setCollapsedGroups(next);
      return next;
    });
  }, []);

  const handleUnhide = useCallback((id: string) => {
    onUnhideSession?.(id);
  }, [onUnhideSession]);

  const filteredSessions = useMemo(
    () => filterSessions(sessions, activeOnly, showHidden),
    [sessions, activeOnly, showHidden],
  );

  const hiddenCount = useMemo(() => {
    const afterActiveFilter = activeOnly
      ? sessions.filter((s) => s.status !== "ended")
      : sessions;
    return afterActiveFilter.filter((s) => s.hidden).length;
  }, [sessions, activeOnly]);

  // Build a map of terminals by cwd for quick lookup
  const terminalsByCwd = useMemo(() => {
    const map = new Map<string, TerminalSession[]>();
    for (const t of terminals ?? []) {
      const existing = map.get(t.cwd);
      if (existing) existing.push(t);
      else map.set(t.cwd, [t]);
    }
    return map;
  }, [terminals]);

  const { pinned: pinnedGroups, unpinned: unpinnedGroups } = useMemo(
    () => groupSessionsByDirectory(filteredSessions, sessionOrderMap, pinnedDirectories),
    [filteredSessions, sessionOrderMap, pinnedDirectories],
  );
  const allGroups = useMemo(() => [...pinnedGroups, ...unpinnedGroups], [pinnedGroups, unpinnedGroups]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    // Cross-type drag is a no-op
    if (activeType !== overType) return;

    if (activeType === "session") {
      for (const group of allGroups) {
        // Unified IDs: sessions + terminals in order
        const groupTerminals = terminalsByCwd.get(group.cwd) ?? [];
        const allIds = getUnifiedOrder(group.sessions, groupTerminals, sessionOrderMap?.get(group.cwd));
        const oldIndex = allIds.indexOf(active.id as string);
        const newIndex = allIds.indexOf(over.id as string);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(allIds, oldIndex, newIndex);
          onReorderSessions?.(group.cwd, newOrder);
          break;
        }
      }
    } else if (activeType === "pinned-group") {
      const ids = pinnedGroups.map((g) => g.cwd);
      const oldIndex = ids.indexOf(active.id as string);
      const newIndex = ids.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(ids, oldIndex, newIndex);
        onReorderPinnedDirs?.(newOrder);
      }
    }
  }, [allGroups, pinnedGroups, onReorderSessions, onReorderPinnedDirs]);

  function renderGroup(group: DirectoryGroup, isPinned: boolean) {
    const dirName = truncatePathMiddle(group.cwd, 45);
    const isCollapsed = collapsedGroups.has(group.cwd);

    return (
      <div key={group.cwd} className="bg-[var(--bg-secondary)] rounded-lg p-2">
        <div
          className="px-2 py-1.5 min-h-[44px] md:min-h-0 cursor-pointer rounded hover:bg-[var(--bg-hover)]"
          onClick={() => handleToggleCollapse(group.cwd)}
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-flex text-[var(--text-tertiary)]">
              <Icon path={isCollapsed ? mdiChevronRight : mdiChevronDown} size={0.6} />
            </span>
            <span className="text-xs font-medium text-[var(--text-secondary)] truncate flex items-center gap-1">
              {isPinned ? <Icon path={mdiPin} size={0.5} className="text-yellow-400 shrink-0" /> : "📁"} {dirName}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">({group.sessions.length + (terminalsByCwd.get(group.cwd)?.length ?? 0)})</span>
            {/* Pin/Unpin button */}
            {isPinned ? (
              <button
                onClick={(e) => { e.stopPropagation(); onUnpinDirectory?.(group.cwd); }}
                className="ml-auto px-1 py-0.5 rounded text-[var(--text-tertiary)] hover:text-yellow-400"
                title="Unpin directory"
                data-testid="unpin-dir-btn"
              >
                <Icon path={mdiPinOff} size={0.55} />
              </button>
            ) : onPinDirectory && (
              <button
                onClick={(e) => { e.stopPropagation(); onPinDirectory(group.cwd); }}
                className="ml-auto px-1 py-0.5 rounded text-[var(--text-muted)] hover:text-yellow-400"
                title="Pin directory"
                data-testid="pin-dir-btn"
              >
                <Icon path={mdiPin} size={0.55} />
              </button>
            )}
          </div>
          <GroupGitInfo
            sessions={group.sessions}
            cwd={group.cwd}
            onBranchClick={() => setBranchDialogCwd(group.cwd)}
          />
          <div className="mt-1 ml-5 flex items-center gap-1">
            {editorMap.get(group.cwd)?.length ? (
              <EditorButtons
                editors={editorMap.get(group.cwd)!}
                onOpen={(editorId) => handleOpenEditor(group.cwd, editorId)}
              />
            ) : null}
            {onSpawnSession && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSpawnSession(group.cwd);
                }}
                disabled={spawningCwds?.has(group.cwd)}
                className={`text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] ${
                  spawningCwds?.has(group.cwd)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:text-green-400 hover:border-green-500/50"
                }`}
                title="New pi session"
                data-testid="spawn-session-btn"
              >
                <span className="inline-flex items-center gap-0.5">
                  <Icon path={mdiPlus} size={0.5} /> Session
                </span>
              </button>
            )}
            {onCreateTerminal && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateTerminal(group.cwd);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-secondary)] hover:text-cyan-400 hover:border-cyan-500/50"
                title="New terminal"
                data-testid="create-terminal-btn"
              >
                <span className="inline-flex items-center gap-0.5">
                  <Icon path={mdiPlus} size={0.5} /> Terminal
                </span>
              </button>
            )}
            {onOpenPiResources && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPiResources(group.cwd);
                }}
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-muted)] hover:text-purple-400 hover:border-purple-500/50"
                title="Pi Resources"
                data-testid="pi-resources-btn"
              >
                <Icon path={mdiPuzzleOutline} size={0.5} />
              </button>
            )}
          </div>
          {openspecMap?.get(group.cwd)?.initialized && (
            <FolderOpenSpecSection
              data={openspecMap.get(group.cwd)!}
              cwd={group.cwd}
              onRefresh={() => onOpenSpecRefresh?.(group.cwd)}
              onReadArtifact={onReadArtifact ? (changeName, artifactId) => onReadArtifact(group.cwd, changeName, artifactId) : undefined}
              sessions={group.sessions}
              onNavigateToSession={onSelect}
              onOpenSpecs={onOpenSpecs ? () => onOpenSpecs(group.cwd) : undefined}
            />
          )}

        </div>
        {/* Session + terminal cards — animated collapse */}
        <div className={`group-collapse ${isCollapsed ? "collapsed" : "expanded"}`}>
        <div className="space-y-1 pt-1">
          {spawningCwds?.has(group.cwd) && <PlaceholderSessionCard />}
          {(() => {
            const groupTerminals = terminalsByCwd.get(group.cwd) ?? [];
            const unifiedIds = getUnifiedOrder(group.sessions, groupTerminals, sessionOrderMap?.get(group.cwd));
            const sessionMap = new Map(group.sessions.map((s) => [s.id, s]));
            const terminalMap = new Map(groupTerminals.map((t) => [t.id, t]));
            return (
              <SortableContext items={unifiedIds} strategy={verticalListSortingStrategy}>
                {unifiedIds.map((id) => {
                  const session = sessionMap.get(id);
                  if (session) {
                    return (
                      <SortableSessionCard key={id} id={id}>
                        <SessionCard
                          session={session}
                          selectedId={selectedId}
                          onSelect={onSelect}
                          now={now}
                          showGitInfo={group.sessions.length === 1 && groupTerminals.length === 0}
                          isHidden={!!session.hidden}
                          onHide={handleHide}
                          onUnhide={handleUnhide}

                          contextUsage={contextUsageMap?.get(session.id)}
                          openspecChanges={openspecMap?.get(session.cwd)?.changes}
                          onSendPrompt={onSendPrompt ? (text) => onSendPrompt(session.id, text) : undefined}
                          onAttachProposal={onAttachProposal ? (changeName) => onAttachProposal(session.id, changeName) : undefined}
                          onDetachProposal={onDetachProposal ? () => onDetachProposal(session.id) : undefined}
                          onReadArtifact={onReadArtifact ? (changeName, artifactId) => onReadArtifact(session.cwd, changeName, artifactId) : undefined}
                          onBulkArchive={onBulkArchive ? () => onBulkArchive(session.cwd) : undefined}
                          onRename={onRename ? (name) => onRename(session.id, name) : undefined}
                          onShutdown={onShutdown}
                          onResume={onResume ? (mode) => onResume(session.id, mode) : undefined}
                          commands={commandsMap?.get(session.id)}
                          flows={flowsMap?.get(session.id)}
                        />
                      </SortableSessionCard>
                    );
                  }
                  const terminal = terminalMap.get(id);
                  if (terminal) {
                    return (
                      <SortableSessionCard key={id} id={id}>
                        <TerminalCard
                          terminal={terminal}
                          selectedId={selectedId}
                          onSelect={(termId) => navigate(`/terminal/${termId}`)}
                          onClose={onKillTerminal}
                          onRename={onRenameTerminal}
                          now={now}
                        />
                      </SortableSessionCard>
                    );
                  }
                  return null;
                })}
              </SortableContext>
            );
          })()}
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full border-r border-[var(--border-primary)] flex flex-col min-h-0 h-full">
      <div className="p-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-lg font-bold text-blue-500 hover:text-blue-400 transition-colors leading-none" title="Home">π</button>
          <div className="flex gap-1 items-center">
            <ThemePicker />
            <ThemeToggle />
            <ToggleButton active={activeOnly} onClick={handleActiveOnlyToggle}>
              Active only
            </ToggleButton>
            <ToggleButton active={showHidden} onClick={() => setShowHidden((p) => !p)}>
              Show hidden
            </ToggleButton>
            {onPinDirectory && (
              <button
                onClick={() => setShowPinDialog(true)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-secondary)] text-[var(--text-tertiary)] hover:text-yellow-400 hover:border-yellow-500/50"
                title="Pin a directory"
                data-testid="pin-dir-dialog-btn"
              >
                📌+
              </button>
            )}
            {onCollapseSidebar && (
              <button
                onClick={onCollapseSidebar}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                title="Collapse sidebar"
                data-testid="sidebar-collapse"
              >
                <Icon path={mdiChevronLeft} size={0.6} />
              </button>
            )}
            <InstallButton canInstall={installPrompt.canInstall} isInstalled={installPrompt.isInstalled} prompt={installPrompt.prompt} />
            <TunnelButton />
            <button
              onClick={() => navigate("/settings")}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              title="Settings"
              data-testid="settings-btn"
            >
              <Icon path={mdiCog} size={0.6} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
      {filteredSessions.length === 0 && pinnedGroups.length === 0 ? (
        <div className="p-4 text-sm text-[var(--text-tertiary)]">No active sessions</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <ul className="flex flex-col gap-2 p-2">
          {/* Pinned directory groups */}
          {pinnedGroups.length > 0 && (
            <SortableContext items={pinnedGroups.map((g) => g.cwd)} strategy={verticalListSortingStrategy}>
              {pinnedGroups.map((group) => (
                <SortablePinnedGroup key={group.cwd} id={group.cwd}>
                  {renderGroup(group, true)}
                </SortablePinnedGroup>
              ))}
            </SortableContext>
          )}
          {/* Gap between pinned and unpinned is handled by flex gap */}
          {/* Unpinned directory groups */}
          {unpinnedGroups.map((group) => renderGroup(group, false))}
        </ul>
        </DndContext>
      )}
      {hiddenCount > 0 && !showHidden && (
        <div className="p-2 text-center text-[11px] text-[var(--text-muted)]">
          {hiddenCount} hidden
        </div>
      )}
      {showPinDialog && onPinDirectory && (
        <DialogPortal><PinDirectoryDialog
          onPin={(dirPath) => {
            onPinDirectory(dirPath);
            setShowPinDialog(false);
          }}
          onCancel={() => setShowPinDialog(false)}
        /></DialogPortal>
      )}
      {branchDialogCwd && (
        <BranchSwitchDialog
          cwd={branchDialogCwd}
          onClose={() => {
            branchCache.delete(branchDialogCwd);
            setBranchDialogCwd(null);
          }}
        />
      )}
      <Toast messages={messages} onDismiss={dismissToast} />

      </div>
    </div>
  );
}
