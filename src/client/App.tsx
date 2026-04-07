import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRoute, useLocation, Redirect, Switch, Route } from "wouter";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useSidebarState } from "./hooks/useSidebarState.js";
import { SessionList } from "./components/SessionList.js";
import { ResizableSidebar } from "./components/ResizableSidebar.js";
import { HamburgerButton, MobileOverlay } from "./components/MobileOverlay.js";
import { MobileShell } from "./components/MobileShell.js";
import { useMobile } from "./hooks/useMobile.js";
import { getMobileDepth } from "./lib/mobile-depth.js";
import { ChatView } from "./components/ChatView.js";
import { FlowDashboard } from "./components/FlowDashboard.js";
import { FlowAgentDetail } from "./components/FlowAgentDetail.js";
import { MarkdownPreviewView } from "./components/MarkdownPreviewView.js";
import { PiResourcesView } from "./components/PiResourcesView.js";
import { SpecsBrowserView } from "./components/SpecsBrowserView.js";
import { ArchiveBrowserView } from "./components/ArchiveBrowserView.js";
import { useOpenSpecReader } from "./hooks/useOpenSpecReader.js";
import type { OpenSpecArtifact } from "../shared/types.js";
import { SessionHeader } from "./components/SessionHeader.js";
import { TokenStatsBar } from "./components/TokenStatsBar.js";
import { CommandInput } from "./components/CommandInput.js";
import { StatusBar } from "./components/StatusBar.js";
import { LandingPage } from "./components/LandingPage.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { ZrokInstallGuide } from "./components/ZrokInstallGuide.js";
import { InstallBanner } from "./components/InstallBanner.js";
import { useInstallPrompt } from "./hooks/useInstallPrompt.js";
import { TerminalView } from "./components/TerminalView.js";
import { TerminalsView } from "./components/TerminalsView.js";
import { EditorView } from "./components/EditorView.js";
import { decodeFolderPath, encodeFolderPath } from "./lib/folder-encoding.js";
import { FileDiffView } from "./components/FileDiffView.js";
import { createInitialState, reduceEvent, resolveInteractiveRequest, type SessionState } from "./lib/event-reducer.js";
import { useMessageHandler } from "./hooks/useMessageHandler.js";
import { useEditors } from "./lib/use-editors.js";
import { useContentViews } from "./hooks/useContentViews.js";
import { useSessionActions } from "./hooks/useSessionActions.js";
import { useOpenSpecActions } from "./hooks/useOpenSpecActions.js";
import type { DashboardSession, CommandInfo, FlowInfo, FileEntry, OpenSpecData, ModelInfo, ImageContent } from "../shared/types.js";
import { SearchableSelectDialog, type SelectOption } from "./components/SearchableSelectDialog.js";
import { FlowLaunchDialog } from "./components/FlowLaunchDialog.js";
import type { TerminalSession } from "../shared/terminal-types.js";
import type { EditorInstanceStatus } from "../shared/editor-types.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import type { ServerToBrowserMessage } from "../shared/browser-protocol.js";
import type { ToolContext } from "./components/tool-renderers/index.js";
import type { ContextUsageInfo } from "./components/SessionList.js";

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsPort = window.location.port ? `:${window.location.port}` : "";
const WS_URL = `${wsProtocol}//${window.location.hostname}${wsPort}/ws`;



function OpenSpecPreview({
  cwd,
  changeName,
  initialArtifact,
  artifacts,
  onBack,
}: {
  cwd: string;
  changeName: string;
  initialArtifact: string;
  artifacts: OpenSpecArtifact[];
  onBack: () => void;
}) {
  const reader = useOpenSpecReader(cwd, changeName, initialArtifact, artifacts);
  return (
    <MarkdownPreviewView
      title={reader.title}
      content={reader.content}
      isLoading={reader.isLoading}
      error={reader.error}
      tabs={reader.tabs}
      activeTab={reader.activeTab}
      onTabChange={reader.setActiveTab}
      onBack={onBack}
    />
  );
}

export default function App() {
  const { send, onMessage, status } = useWebSocket(WS_URL);
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/session/:id");
  const [termMatch, termParams] = useRoute("/terminal/:id");
  const [folderTermMatch, folderTermParams] = useRoute("/folder/:encodedCwd/terminals");
  const [folderEditorMatch, folderEditorParams] = useRoute("/folder/:encodedCwd/editor");
  const [settingsMatch] = useRoute("/settings");
  const [tunnelSetupMatch] = useRoute("/tunnel-setup");
  const selectedId = match ? params?.id : undefined;
  const selectedTerminalId = termMatch ? termParams?.id : undefined;
  const folderTermCwd = folderTermMatch ? decodeFolderPath(folderTermParams?.encodedCwd ?? "") : null;
  const folderEditorCwd = folderEditorMatch ? decodeFolderPath(folderEditorParams?.encodedCwd ?? "") : null;
  const sidebar = useSidebarState();
  const isMobile = useMobile();
  const installPrompt = useInstallPrompt();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessions, setSessions] = useState<Map<string, DashboardSession>>(new Map());
  const [sessionStates, setSessionStates] = useState<Map<string, SessionState>>(new Map());
  const [sessionCommands, setSessionCommands] = useState<Map<string, CommandInfo[]>>(new Map());
  const [sessionFlows, setSessionFlows] = useState<Map<string, FlowInfo[]>>(new Map());
  const [fileResults, setFileResults] = useState<{ query: string; files: FileEntry[] } | null>(null);
  const [openspecMap, setOpenspecMap] = useState<Map<string, OpenSpecData>>(new Map());
  const [modelsMap, setModelsMap] = useState<Map<string, ModelInfo[]>>(new Map());
  const [spawnResult, setSpawnResult] = useState<{ success: boolean; message: string } | null>(null);
  const [spawningCwds, setSpawningCwds] = useState<Set<string>>(new Set());
  const spawningCwdsRef = useRef<Set<string>>(spawningCwds);
  spawningCwdsRef.current = spawningCwds;
  const spawnTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [sessionOrderMap, setSessionOrderMap] = useState<Map<string, string[]>>(new Map());
  const [pinnedDirectories, setPinnedDirectories] = useState<string[]>([]);
  const [terminals, setTerminals] = useState<Map<string, TerminalSession>>(new Map());
  const pendingTerminalCwdRef = useRef<string | null>(null);
  const [editorStatuses, setEditorStatuses] = useState<Map<string, { id: string; status: EditorInstanceStatus }>>(new Map());
  const [editorAvailable, setEditorAvailable] = useState<boolean | undefined>(undefined);
  const subscribedRef = useRef(new Set<string>());
  const [flowDetailAgent, setFlowDetailAgent] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    cwd: string;
    changeName: string;
    artifactId: string;
    artifacts: OpenSpecArtifact[];
  } | null>(null);
  const [specsBrowserCwd, setSpecsBrowserCwd] = useState<string | null>(null);
  const [archiveBrowserCwd, setArchiveBrowserCwd] = useState<string | null>(null);
  const [diffViewSessionId, setDiffViewSessionId] = useState<string | null>(null);
  const {
    piResourcesState, setPiResourcesState,
    piResourceFilePreview, setPiResourceFilePreview,
    readmePreview, setReadmePreview,
    handleOpenPiResources,
    handleViewPiResourceFile,
    handleViewReadme,
  } = useContentViews();

  const clearSpawningCwd = useCallback((cwd: string) => {
    setSpawningCwds((prev) => {
      if (!prev.has(cwd)) return prev;
      const next = new Set(prev);
      next.delete(cwd);
      return next;
    });
    const timer = spawnTimeoutsRef.current.get(cwd);
    if (timer) {
      clearTimeout(timer);
      spawnTimeoutsRef.current.delete(cwd);
    }
  }, []);

  const handleMessage = useMessageHandler(
    { setSessions, setSessionStates, setSessionCommands, setSessionFlows, setFileResults, setOpenspecMap, setModelsMap, setSpawnResult, setSessionOrderMap, setPinnedDirectories, setTerminals, setEditorStatuses },
    { send, navigate, clearSpawningCwd, spawningCwdsRef, subscribedRef, pendingTerminalCwdRef },
  );

  useEffect(() => {
    return onMessage(handleMessage);
  }, [onMessage, handleMessage]);

  // Detect code-server binary availability on mount
  useEffect(() => {
    fetch("/api/editor/detect")
      .then((r) => r.json())
      .then((d) => { if (d.success) setEditorAvailable(d.data.available); })
      .catch(() => {});
  }, []);

  // Clear subscriptions on reconnect so sessions get re-subscribed
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (status === "connected" && prevStatusRef.current !== "connected") {
      subscribedRef.current.clear();
      setSessionOrderMap(new Map());
      setTerminals(new Map());
      // Fetch current editor statuses
      fetch("/api/editor/status")
        .then((r) => r.json())
        .then((data) => {
          if (data.success && Array.isArray(data.data)) {
            const map = new Map<string, { id: string; status: EditorInstanceStatus }>();
            for (const inst of data.data) {
              if (inst.status !== "stopped") {
                map.set(inst.cwd, { id: inst.id, status: inst.status });
              }
            }
            setEditorStatuses(map);
          }
        })
        .catch(() => {});
    }
    prevStatusRef.current = status;
  }, [status]);

  // Redirect to / if session ID in URL is not found after sessions have loaded
  const sessionsLoaded = sessions.size > 0;
  useEffect(() => {
    if (selectedId && sessionsLoaded && !sessions.has(selectedId)) {
      navigate("/", { replace: true });
    }
  }, [selectedId, sessionsLoaded, sessions, navigate]);

  // Clear preview when session changes + lazy subscribe ended sessions
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    if (selectedId !== prevSelectedRef.current) {
      setPreviewState(null);
      setSpecsBrowserCwd(null);
      setArchiveBrowserCwd(null);
      setDiffViewSessionId(null);
      prevSelectedRef.current = selectedId;
    }
    // Lazy subscribe: load events for ended sessions when first selected.
    // Also re-subscribes the selected session after reconnect (status change
    // clears subscribedRef, and adding `status` here re-triggers the effect).
    if (selectedId && !subscribedRef.current.has(selectedId) && status === "connected") {
      subscribedRef.current.add(selectedId);
      send({ type: "subscribe", sessionId: selectedId, lastSeq: 0 });
    }
  }, [selectedId, send, status]);

  const selectedState = selectedId
    ? sessionStates.get(selectedId) ?? createInitialState()
    : createInitialState();

  const selectedCommands = selectedId
    ? sessionCommands.get(selectedId) ?? []
    : [];

  const selectedFlows = selectedId
    ? sessionFlows.get(selectedId) ?? []
    : [];

  const selectedSession = selectedId ? sessions.get(selectedId) : undefined;
  const selectedCwd = selectedSession?.cwd;
  const editorCwds = useMemo(() => selectedCwd ? [selectedCwd] : [], [selectedCwd]);
  const editorMap = useEditors(editorCwds);
  const toolContext: ToolContext = useMemo(() => ({
    cwd: selectedCwd,
    editors: selectedCwd ? editorMap.get(selectedCwd) ?? [] : [],
  }), [selectedCwd, editorMap]);

  const contextUsageMap = useMemo(() => {
    const map = new Map<string, ContextUsageInfo>();
    // First: populate from event-reduced state (live sessions)
    for (const [id, state] of sessionStates) {
      if (state.contextUsage) {
        map.set(id, state.contextUsage);
      }
    }
    // Second: fill in from server-persisted session data (covers all sessions)
    for (const [id, session] of sessions) {
      if (!map.has(id) && session.contextWindow && session.contextTokens !== undefined) {
        map.set(id, { tokens: session.contextTokens ?? null, contextWindow: session.contextWindow });
      }
    }
    return map;
  }, [sessionStates, sessions]);

  const sessionActions = useSessionActions({
    selectedId, send, navigate, setMobileOpen,
    setSessions, setSessionStates, setSpawningCwds, setTerminals,
    clearSpawningCwd, spawnTimeoutsRef, pendingTerminalCwdRef, terminals,
  });
  const {
    handleAbort, handleCancelPending, handleRespondToUi, handleSend,
    handleSelect, handleRenameSession, handleShutdownSession,
    handleSendPromptToSession, handleResumeSession, handleSpawnSession,
    handleHideSession, handleUnhideSession,
    handleCreateTerminal, handleKillTerminal, handleRenameTerminal, handleTerminalTitle,
    handleListFiles,
  } = sessionActions;

  // Flow picker state (for /flows command intercept)
  const [flowPickerOpen, setFlowPickerOpen] = useState(false);
  const [flowNewOpen, setFlowNewOpen] = useState(false);
  const [flowLaunchTarget, setFlowLaunchTarget] = useState<FlowInfo | null>(null);

  // Wrap handleSend to intercept /flows commands
  const wrappedHandleSend = useCallback((text: string, images?: ImageContent[]) => {
    const trimmed = text.trim();
    if (trimmed === "/flows") {
      setFlowPickerOpen(true);
      return;
    }
    if (trimmed === "/flows:new") {
      setFlowNewOpen(true);
      return;
    }
    handleSend(text, images);
  }, [handleSend]);

  const openspecActions = useOpenSpecActions({ send, openspecMap, setPreviewState });
  const {
    handleOpenSpecRefresh, handleBulkArchive, handleReadArtifact,
    handleAttachProposal, handleDetachProposal,
  } = openspecActions;

  const sessionList = (
    <SessionList
      sessions={Array.from(sessions.values())}
      terminals={Array.from(terminals.values())}
      selectedId={selectedId ?? selectedTerminalId}
      onSelect={handleSelect}
      contextUsageMap={contextUsageMap}
      openspecMap={openspecMap}
      sessionOrderMap={sessionOrderMap}
      onReorderSessions={(cwd, sessionIds) => {
        setSessionOrderMap((prev) => {
          const next = new Map(prev);
          next.set(cwd, sessionIds);
          return next;
        });
        send({ type: "reorder_sessions", cwd, sessionIds });
      }}
      onSendPrompt={handleSendPromptToSession}
      onOpenSpecRefresh={handleOpenSpecRefresh}
      onBulkArchive={handleBulkArchive}
      onReadArtifact={handleReadArtifact}
      onOpenPiResources={handleOpenPiResources}
      onOpenSpecs={(cwd) => setSpecsBrowserCwd(cwd)}
      onOpenArchive={(cwd) => setArchiveBrowserCwd(cwd)}
      onViewReadme={handleViewReadme}
      onAttachProposal={handleAttachProposal}
      onDetachProposal={handleDetachProposal}
      onRename={handleRenameSession}
      onShutdown={handleShutdownSession}
      onResume={handleResumeSession}
      onHideSession={handleHideSession}
      onUnhideSession={handleUnhideSession}
      onSpawnSession={handleSpawnSession}
      spawningCwds={spawningCwds}
      spawnResult={spawnResult}
      onSpawnResultSeen={() => setSpawnResult(null)}
      pinnedDirectories={pinnedDirectories}
      onPinDirectory={(dirPath) => {
        setPinnedDirectories((prev) => prev.includes(dirPath) ? prev : [...prev, dirPath]);
        send({ type: "pin_directory", path: dirPath });
      }}
      onUnpinDirectory={(dirPath) => {
        setPinnedDirectories((prev) => prev.filter((p) => p !== dirPath));
        send({ type: "unpin_directory", path: dirPath });
      }}
      onReorderPinnedDirs={(paths) => {
        setPinnedDirectories(paths);
        send({ type: "reorder_pinned_dirs", paths });
      }}
      onCreateTerminal={handleCreateTerminal}
      onKillTerminal={handleKillTerminal}
      onRenameTerminal={handleRenameTerminal}
      onCollapseSidebar={sidebar.toggleCollapse}
      commandsMap={sessionCommands}
      flowsMap={sessionFlows}
      onOpenTerminals={(cwd) => navigate(`/folder/${encodeFolderPath(cwd)}/terminals`)}
      onOpenEditor={(cwd) => navigate(`/folder/${encodeFolderPath(cwd)}/editor`)}
      editorStatuses={editorStatuses}
      editorAvailable={editorAvailable}
    />
  );

  const connectionBanner = (
    <>
      {status === "connecting" && (
        <div className="bg-yellow-600/20 text-yellow-400 text-xs px-3 py-1 text-center">
          Connecting...
        </div>
      )}
      {status === "offline" && (
        <div className="bg-red-600/20 text-red-400 text-xs px-3 py-1 text-center">
          Server offline
        </div>
      )}
      {status === "auth_required" && (
        <div className="bg-amber-600/20 text-amber-400 text-xs px-3 py-1 text-center">
          Session expired —{" "}
          <a href={`/auth/login?return=${encodeURIComponent(window.location.pathname)}`} className="underline hover:text-amber-300">
            Sign in
          </a>
        </div>
      )}
    </>
  );

  const sessionDetail = selectedId ? (
    <div className="flex-1 flex flex-col min-w-0 h-full">
      {connectionBanner}
      <SessionHeader
        session={sessions.get(selectedId)}
        state={selectedState}
        onRename={handleRenameSession}
        showBack
        onBack={isMobile ? () => navigate("/") : () => window.history.back()}
        mobileActions={isMobile ? {
          editors: selectedCwd ? editorMap.get(selectedCwd) : undefined,
          openspecChanges: selectedCwd ? openspecMap.get(selectedCwd)?.changes : undefined,
          onHide: () => handleHideSession(selectedId),
          onUnhide: () => handleUnhideSession(selectedId),
          onResume: (mode) => handleResumeSession(selectedId, mode),
          onShutdown: () => handleShutdownSession(selectedId),
          onOpenEditor: selectedCwd ? (editorId) => {
            import("./lib/editor-api.js").then(({ openEditor }) => openEditor(selectedCwd!, editorId));
          } : undefined,
          onAttachProposal: (changeName) => handleAttachProposal(selectedId, changeName),
          onDetachProposal: () => handleDetachProposal(selectedId),
          onSendPrompt: (text) => wrappedHandleSend(text),
          onReadArtifact: (changeName, artifactId) => handleReadArtifact(selectedCwd!, changeName, artifactId),
          onRefresh: () => {
            setSessionStates((prev) => {
              const next = new Map(prev);
              next.set(selectedId, createInitialState());
              return next;
            });
            subscribedRef.current.delete(selectedId);
            subscribedRef.current.add(selectedId);
            send({ type: "subscribe", sessionId: selectedId, lastSeq: 0 });
          },
        } : undefined}
        commands={selectedCommands}
        flows={selectedFlows}
        onSendPrompt={wrappedHandleSend}
        openspecChanges={selectedCwd ? openspecMap.get(selectedCwd)?.changes : undefined}
        onAttachProposal={(changeName) => handleAttachProposal(selectedId, changeName)}
        onDetachProposal={() => handleDetachProposal(selectedId)}
        hasFileChanges={selectedState.hasFileChanges}
        onOpenDiffView={() => setDiffViewSessionId(selectedId)}
        onRefresh={() => {
          setSessionStates((prev) => {
            const next = new Map(prev);
            next.set(selectedId, createInitialState());
            return next;
          });
          subscribedRef.current.delete(selectedId);
          subscribedRef.current.add(selectedId);
          send({ type: "subscribe", sessionId: selectedId, lastSeq: 0 });
        }}
      />
      {/* Mobile info strip */}
      {isMobile && selectedSession && (
        <div className="px-4 py-1.5 border-b border-[var(--border-primary)] text-xs text-[var(--text-tertiary)]">
          <div className="flex items-center gap-2 flex-wrap">
            {(selectedState.model || selectedSession.model) && (
              <span>{selectedState.model || selectedSession.model}</span>
            )}
            {(selectedState.thinkingLevel || selectedSession.thinkingLevel) && (
              <span>💭 {selectedState.thinkingLevel || selectedSession.thinkingLevel}</span>
            )}
            {selectedState.status === "streaming" && selectedState.currentTool && (
              <span className="text-yellow-400">⚡ {selectedState.currentTool}</span>
            )}
            {selectedState.status === "streaming" && !selectedState.currentTool && (
              <span className="text-green-400">Thinking…</span>
            )}
            <span className="flex-1" />
            {selectedState.cost > 0 && <span>${selectedState.cost.toFixed(2)}</span>}
          </div>
          {selectedState.contextUsage && selectedState.contextUsage.contextWindow > 0 && (
            <div className="mt-1">
              <div className="flex items-center gap-2 text-[10px]">
                <span>{selectedState.contextUsage.tokens != null ? `${Math.round((selectedState.contextUsage.tokens / 1000))}k` : "—"}</span>
                <div className="flex-1 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                  {selectedState.contextUsage.tokens != null && (
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min((selectedState.contextUsage.tokens / selectedState.contextUsage.contextWindow) * 100, 100)}%` }}
                    />
                  )}
                </div>
                <span>{Math.round(selectedState.contextUsage.contextWindow / 1000)}k</span>
              </div>
            </div>
          )}
        </div>
      )}
      {!isMobile && (
        <TokenStatsBar
          turnStats={selectedState.turnStats}
          contextUsage={selectedState.contextUsage}
          tokensIn={selectedState.tokensIn}
          tokensOut={selectedState.tokensOut}
          cacheRead={selectedState.cacheRead}
          cacheWrite={selectedState.cacheWrite}
          cost={selectedState.cost}
        />
      )}
      {archiveBrowserCwd ? (
        <ArchiveBrowserView
          cwd={archiveBrowserCwd}
          onBack={() => setArchiveBrowserCwd(null)}
        />
      ) : specsBrowserCwd ? (
        <SpecsBrowserView
          cwd={specsBrowserCwd}
          onBack={() => setSpecsBrowserCwd(null)}
        />
      ) : piResourceFilePreview ? (
        <MarkdownPreviewView
          title={piResourceFilePreview.title}
          content={piResourceFilePreview.content}
          isLoading={piResourceFilePreview.isLoading}
          error={piResourceFilePreview.error}
          onBack={() => setPiResourceFilePreview(null)}
        />
      ) : readmePreview ? (
        <MarkdownPreviewView
          title={`README.md — ${readmePreview.cwd.split("/").pop()}`}
          content={readmePreview.content}
          isLoading={readmePreview.isLoading}
          error={readmePreview.error}
          onBack={() => setReadmePreview(null)}
        />
      ) : piResourcesState ? (
        <PiResourcesView
          cwd={piResourcesState.cwd}
          onBack={() => setPiResourcesState(null)}
          onViewFile={handleViewPiResourceFile}
        />
      ) : previewState ? (
        <OpenSpecPreview
          cwd={previewState.cwd}
          changeName={previewState.changeName}
          initialArtifact={previewState.artifactId}
          artifacts={previewState.artifacts}
          onBack={() => setPreviewState(null)}
        />
      ) : diffViewSessionId ? (
        <FileDiffView
          sessionId={diffViewSessionId}
          onBack={() => setDiffViewSessionId(null)}
        />
      ) : flowDetailAgent && selectedState.flowState?.agents.has(flowDetailAgent) ? (
        <>
          {selectedState.flowState && (
            <div className="sticky top-0 z-10">
              <FlowDashboard
                flowState={selectedState.flowState}
                onAgentClick={setFlowDetailAgent}
                onAbort={() => selectedId && send({ type: "flow_control" as any, sessionId: selectedId, action: "abort" })}
                onToggleAutonomous={() => selectedId && send({ type: "flow_control" as any, sessionId: selectedId, action: "toggle_autonomous" })}
                onDismiss={() => {
                  setFlowDetailAgent(null);
                  setSessionStates(prev => {
                    const next = new Map(prev);
                    const current = next.get(selectedId!);
                    if (current) next.set(selectedId!, { ...current, flowState: null });
                    return next;
                  });
                }}
              />
            </div>
          )}
          <FlowAgentDetail
            agent={selectedState.flowState!.agents.get(flowDetailAgent)!}
            onBack={() => setFlowDetailAgent(null)}
          />
        </>
      ) : (
        <>
          {selectedState.flowState && (
            <div className="sticky top-0 z-10">
              <FlowDashboard
                flowState={selectedState.flowState}
                onAgentClick={setFlowDetailAgent}
                onAbort={() => selectedId && send({ type: "flow_control" as any, sessionId: selectedId, action: "abort" })}
                onToggleAutonomous={() => selectedId && send({ type: "flow_control" as any, sessionId: selectedId, action: "toggle_autonomous" })}
                onDismiss={() => {
                  setSessionStates(prev => {
                    const next = new Map(prev);
                    const current = next.get(selectedId!);
                    if (current) next.set(selectedId!, { ...current, flowState: null });
                    return next;
                  });
                }}
              />
            </div>
          )}
          <ErrorBoundary fallback={
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-2">
                <div className="text-red-400 text-sm">Chat view encountered an error</div>
                <button onClick={() => window.location.reload()} className="text-xs text-blue-400 hover:underline">Reload page</button>
              </div>
            </div>
          }>
            <ChatView sessionId={selectedId} state={selectedState} toolContext={toolContext} onCancelPending={handleCancelPending} onRespondToUi={handleRespondToUi} />
          </ErrorBoundary>
          <StatusBar
            model={selectedState.model ?? selectedSession?.model}
            models={modelsMap.get(selectedId)}
            thinkingLevel={selectedState.thinkingLevel ?? selectedSession?.thinkingLevel}
            status={selectedState.status}
            currentTool={selectedState.currentTool}
            streamingText={selectedState.streamingText || undefined}
            onSelectModel={(modelStr) => {
              const slashIdx = modelStr.indexOf("/");
              if (slashIdx > 0) {
                const provider = modelStr.slice(0, slashIdx);
                const modelId = modelStr.slice(slashIdx + 1);
                send({ type: "set_model", sessionId: selectedId, provider, modelId });
              }
            }}
            onSelectThinkingLevel={(level) => {
              send({ type: "set_thinking_level", sessionId: selectedId, level });
            }}
          />
          <CommandInput
            commands={selectedCommands}
            onSend={wrappedHandleSend}
            onListFiles={handleListFiles}
            fileResults={fileResults}
            disabled={false}
            sessionStatus={selectedState.status}
            onAbort={handleAbort}
            pendingPrompt={!!selectedState.pendingPrompt}
            onCancelPending={handleCancelPending}
          />
          {flowPickerOpen && (() => {
            const hasFlowsNew = selectedCommands.some(c => c.name === "flows:new");
            const flowOptions: SelectOption[] = [
              ...(hasFlowsNew ? [{ value: "__new__", label: "+ New Flow", description: "Design a new flow with the Flow Architect" }] : []),
              ...selectedFlows.map((f) => ({
                value: f.name,
                label: f.name,
                description: f.description,
              })),
            ];
            return (
              <SearchableSelectDialog
                title="Flows"
                options={flowOptions}
                placeholder="Search flows..."
                emptyMessage="No flows available"
                onSelect={(value) => {
                  setFlowPickerOpen(false);
                  if (value === "__new__") {
                    setFlowNewOpen(true);
                  } else {
                    const flow = selectedFlows.find(f => f.name === value);
                    if (flow) {
                      if (flow.taskRequired) {
                        setFlowLaunchTarget(flow);
                      } else {
                        handleSend(`/${flow.name}`);
                      }
                    }
                  }
                }}
                onCancel={() => setFlowPickerOpen(false)}
              />
            );
          })()}
          {flowNewOpen && (
            <FlowLaunchDialog
              flowName="flows:new"
              description="Design a new flow with the Flow Architect"
              onSubmit={(task) => {
                const prompt = task ? `/flows:new ${task}` : `/flows:new`;
                handleSend(prompt);
                setFlowNewOpen(false);
              }}
              onCancel={() => setFlowNewOpen(false)}
            />
          )}
          {flowLaunchTarget && (
            <FlowLaunchDialog
              flowName={flowLaunchTarget.name}
              description={flowLaunchTarget.description}
              onSubmit={(task) => {
                const prompt = task ? `/${flowLaunchTarget.name} ${task}` : `/${flowLaunchTarget.name}`;
                handleSend(prompt);
                setFlowLaunchTarget(null);
              }}
              onCancel={() => setFlowLaunchTarget(null)}
            />
          )}
        </>
      )}
    </div>
  ) : null;

  // Terminal keep-alive views — always mounted, CSS toggled (for legacy /terminal/:id route)
  const terminalViews = useMemo(() => {
    return Array.from(terminals.values()).map((t) => (
      <TerminalView
        key={t.id}
        terminalId={t.id}
        visible={selectedTerminalId === t.id}
        terminalName={t.title || t.shell.split("/").pop()}
        onTitle={handleTerminalTitle}
        onClose={handleKillTerminal}
      />
    ));
  }, [terminals, selectedTerminalId, handleTerminalTitle, handleKillTerminal]);

  // Get terminals for a specific folder cwd
  const getTerminalsForCwd = useCallback((cwd: string) => {
    return Array.from(terminals.values()).filter((t) => t.cwd === cwd);
  }, [terminals]);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const handleEditorClose = useCallback(() => navigateRef.current("/"), []);

  // Folder view content (TerminalsView or EditorView)
  const folderViewContent = useMemo(() => {
    if (folderTermCwd) {
      return (
        <TerminalsView
          cwd={folderTermCwd}
          terminals={getTerminalsForCwd(folderTermCwd)}
          onCreateTerminal={handleCreateTerminal}
          onKillTerminal={handleKillTerminal}
          onRenameTerminal={handleRenameTerminal}
          onTerminalTitle={handleTerminalTitle}
        />
      );
    }
    if (folderEditorCwd) {
      return <EditorView cwd={folderEditorCwd} onClose={handleEditorClose} />;
    }
    return null;
  }, [folderTermCwd, folderEditorCwd, getTerminalsForCwd, handleCreateTerminal, handleKillTerminal, handleRenameTerminal, handleTerminalTitle, handleEditorClose]);

  // Navigate away from terminal when it's removed
  useEffect(() => {
    if (selectedTerminalId && !terminals.has(selectedTerminalId)) {
      navigate("/");
    }
  }, [selectedTerminalId, terminals, navigate]);

  // Navigate away from invalid terminal URL (same as session logic)
  const terminalsLoaded = terminals.size > 0 || sessions.size > 0;
  useEffect(() => {
    if (selectedTerminalId && terminalsLoaded && !terminals.has(selectedTerminalId)) {
      navigate("/");
    }
  }, [selectedTerminalId, terminalsLoaded, terminals, navigate]);

  // Mobile: two-step full-screen navigation
  if (isMobile) {
    const mobileDepth = getMobileDepth({
      selectedId,
      selectedTerminalId,
      folderTermCwd,
      folderEditorCwd,
      settingsMatch: !!settingsMatch,
      tunnelSetupMatch: !!tunnelSetupMatch,
      hasPreview: !!previewState || !!piResourcesState || !!piResourceFilePreview || !!readmePreview || !!specsBrowserCwd || !!archiveBrowserCwd || !!diffViewSessionId,
    });
    return (
      <div className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <MobileShell
          depth={mobileDepth}
          onBack={() => {
            if (archiveBrowserCwd) {
              setArchiveBrowserCwd(null);
            } else if (specsBrowserCwd) {
              setSpecsBrowserCwd(null);
            } else if (diffViewSessionId) {
              setDiffViewSessionId(null);
            } else if (piResourceFilePreview) {
              setPiResourceFilePreview(null);
            } else if (readmePreview) {
              setReadmePreview(null);
            } else if (piResourcesState) {
              setPiResourcesState(null);
            } else if (previewState) {
              setPreviewState(null);
            } else {
              navigate("/");
            }
          }}
          listPanel={
            <div className="flex flex-col h-full">
              <InstallBanner canInstall={installPrompt.canInstall} isIOS={installPrompt.isIOS} isInstalled={installPrompt.isInstalled} prompt={installPrompt.prompt} />
              {connectionBanner}
              {sessionList}
            </div>
          }
          detailPanel={
            settingsMatch ? (
              <SettingsPanel />
            ) : tunnelSetupMatch ? (
              <ZrokInstallGuide onBack={() => navigate("/")} />
            ) : archiveBrowserCwd ? (
              <ArchiveBrowserView
                cwd={archiveBrowserCwd}
                onBack={() => setArchiveBrowserCwd(null)}
              />
            ) : specsBrowserCwd ? (
              <SpecsBrowserView
                cwd={specsBrowserCwd}
                onBack={() => setSpecsBrowserCwd(null)}
              />
            ) : diffViewSessionId ? (
              <FileDiffView
                sessionId={diffViewSessionId}
                onBack={() => setDiffViewSessionId(null)}
              />
            ) : piResourceFilePreview ? (
              <MarkdownPreviewView
                title={piResourceFilePreview.title}
                content={piResourceFilePreview.content}
                isLoading={piResourceFilePreview.isLoading}
                error={piResourceFilePreview.error}
                onBack={() => setPiResourceFilePreview(null)}
              />
            ) : readmePreview ? (
              <MarkdownPreviewView
                title={`README.md — ${readmePreview.cwd.split("/").pop()}`}
                content={readmePreview.content}
                isLoading={readmePreview.isLoading}
                error={readmePreview.error}
                onBack={() => setReadmePreview(null)}
              />
            ) : piResourcesState ? (
              <PiResourcesView
                cwd={piResourcesState.cwd}
                onBack={() => setPiResourcesState(null)}
                onViewFile={handleViewPiResourceFile}
              />
            ) : previewState ? (
              <OpenSpecPreview
                cwd={previewState.cwd}
                changeName={previewState.changeName}
                initialArtifact={previewState.artifactId}
                artifacts={previewState.artifacts}
                onBack={() => setPreviewState(null)}
              />
            ) : folderTermCwd ? (
              <TerminalsView
                cwd={folderTermCwd}
                terminals={getTerminalsForCwd(folderTermCwd)}
                onCreateTerminal={handleCreateTerminal}
                onKillTerminal={handleKillTerminal}
                onRenameTerminal={handleRenameTerminal}
                onTerminalTitle={handleTerminalTitle}
              />
            ) : folderEditorCwd ? (
              <EditorView cwd={folderEditorCwd} onClose={handleEditorClose} />
            ) : selectedTerminalId ? (
              <div className="flex-1 flex flex-col min-w-0 h-full">
                {terminalViews}
              </div>
            ) : sessionDetail ?? <LandingPage />
          }
        />
      </div>
    );
  }

  // Desktop: side-by-side layout
  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="hidden md:flex">
        <ResizableSidebar sidebar={sidebar}>
          {sessionList}
        </ResizableSidebar>
      </div>

      <HamburgerButton onClick={() => setMobileOpen(true)} />
      <MobileOverlay open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {sessionList}
      </MobileOverlay>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {connectionBanner}
        {/* Terminal views are always mounted (keep-alive), CSS hidden/shown */}
        {terminalViews}
        {/* Folder views (TerminalsView or EditorView) */}
        {folderViewContent && (
          <div className="flex-1 flex flex-col min-w-0 min-h-0">{folderViewContent}</div>
        )}
        {/* Show session detail or landing page when no terminal/folder view is selected */}
        {!selectedTerminalId && !folderTermCwd && !folderEditorCwd && !settingsMatch && !tunnelSetupMatch && (
          archiveBrowserCwd ? (
            <ArchiveBrowserView
              cwd={archiveBrowserCwd}
              onBack={() => setArchiveBrowserCwd(null)}
            />
          ) : specsBrowserCwd ? (
            <SpecsBrowserView
              cwd={specsBrowserCwd}
              onBack={() => setSpecsBrowserCwd(null)}
            />
          ) : piResourceFilePreview ? (
            <MarkdownPreviewView
              title={piResourceFilePreview.title}
              content={piResourceFilePreview.content}
              isLoading={piResourceFilePreview.isLoading}
              error={piResourceFilePreview.error}
              onBack={() => setPiResourceFilePreview(null)}
            />
          ) : readmePreview ? (
            <MarkdownPreviewView
              title={`README.md — ${readmePreview.cwd.split("/").pop()}`}
              content={readmePreview.content}
              isLoading={readmePreview.isLoading}
              error={readmePreview.error}
              onBack={() => setReadmePreview(null)}
            />
          ) : piResourcesState && !selectedId ? (
            <PiResourcesView
              cwd={piResourcesState.cwd}
              onBack={() => setPiResourcesState(null)}
              onViewFile={handleViewPiResourceFile}
            />
          ) : previewState && !selectedId ? (
            <OpenSpecPreview
              cwd={previewState.cwd}
              changeName={previewState.changeName}
              initialArtifact={previewState.artifactId}
              artifacts={previewState.artifacts}
              onBack={() => setPreviewState(null)}
            />
          ) : (
            sessionDetail ?? <LandingPage />
          )
        )}
        {settingsMatch && <SettingsPanel />}
        {tunnelSetupMatch && <ZrokInstallGuide onBack={() => navigate("/")} />}
      </div>
    </div>
  );
}
