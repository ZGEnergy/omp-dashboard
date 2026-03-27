import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRoute, useLocation, Redirect, Switch, Route } from "wouter";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useSidebarState } from "./hooks/useSidebarState.js";
import { SessionList } from "./components/SessionList.js";
import { ResizableSidebar } from "./components/ResizableSidebar.js";
import { HamburgerButton, MobileOverlay } from "./components/MobileOverlay.js";
import { ChatView } from "./components/ChatView.js";
import { MarkdownPreviewView } from "./components/MarkdownPreviewView.js";
import { useOpenSpecReader } from "./hooks/useOpenSpecReader.js";
import type { OpenSpecArtifact } from "../shared/types.js";
import { SessionHeader } from "./components/SessionHeader.js";
import { TokenStatsBar } from "./components/TokenStatsBar.js";
import { CommandInput } from "./components/CommandInput.js";
import { StatusBar } from "./components/StatusBar.js";
import { LandingPage } from "./components/LandingPage.js";
import { createInitialState, reduceEvent, type SessionState } from "./lib/event-reducer.js";
import { useEditors } from "./lib/use-editors.js";
import type { DashboardSession, CommandInfo, FileEntry, OpenSpecData, ModelInfo } from "../shared/types.js";
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
  const selectedId = match ? params?.id : undefined;
  const sidebar = useSidebarState();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sessions, setSessions] = useState<Map<string, DashboardSession>>(new Map());
  const [sessionStates, setSessionStates] = useState<Map<string, SessionState>>(new Map());
  const [sessionCommands, setSessionCommands] = useState<Map<string, CommandInfo[]>>(new Map());
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
  const subscribedRef = useRef(new Set<string>());
  const [previewState, setPreviewState] = useState<{
    cwd: string;
    changeName: string;
    artifactId: string;
    artifacts: OpenSpecArtifact[];
  } | null>(null);

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

  const handleMessage = useCallback((msg: ServerToBrowserMessage) => {
    switch (msg.type) {
      case "session_added":
        setSessions((prev) => {
          const next = new Map(prev);
          next.set(msg.session.id, msg.session);
          return next;
        });
        // Clear placeholder and auto-select if this was a spawned session
        if (spawningCwdsRef.current.has(msg.session.cwd)) {
          clearSpawningCwd(msg.session.cwd);
          navigate(`/session/${msg.session.id}`);
        }
        // Auto-subscribe to active sessions for live events.
        // Ended sessions are subscribed on-demand when selected (lazy loading).
        if (!subscribedRef.current.has(msg.session.id) && msg.session.status !== "ended") {
          subscribedRef.current.add(msg.session.id);
          send({ type: "subscribe", sessionId: msg.session.id, lastSeq: 0 });
          send({ type: "request_commands", sessionId: msg.session.id });
          send({ type: "request_models", sessionId: msg.session.id });
        }
        break;

      case "session_updated":
        setSessions((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.sessionId);
          if (existing) {
            next.set(msg.sessionId, { ...existing, ...msg.updates });
          }
          return next;
        });
        break;

      case "session_removed":
        setSessions((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.sessionId);
          if (existing) {
            next.set(msg.sessionId, { ...existing, status: "ended" });
          }
          return next;
        });
        break;

      case "event":
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(msg.sessionId) ?? createInitialState();
          next.set(msg.sessionId, reduceEvent(current, msg.event));
          return next;
        });
        break;

      case "commands_list":
        setSessionCommands((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, msg.commands);
          return next;
        });
        break;

      case "files_list":
        setFileResults({ query: msg.query, files: msg.files });
        break;

      case "models_list":
        setModelsMap((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, msg.models);
          return next;
        });
        break;

      case "openspec_update":
        setOpenspecMap((prev) => {
          const next = new Map(prev);
          next.set(msg.cwd, msg.data);
          return next;
        });
        break;

      case "event_replay":
        setSessionStates((prev) => {
          const next = new Map(prev);
          let current = next.get(msg.sessionId) ?? createInitialState();
          for (const { event } of msg.events) {
            current = reduceEvent(current, event);
          }
          next.set(msg.sessionId, current);
          return next;
        });
        break;

      case "resume_result":
        if (!msg.success) {
          console.warn("[dashboard] Resume/fork failed:", msg.message);
        }
        break;

      case "spawn_result":
        setSpawnResult({ success: msg.success, message: msg.message });
        if (!msg.success) {
          clearSpawningCwd(msg.cwd);
        }
        break;

      case "sessions_list":
        // Sessions discovered from pi listing — add to session map if not already present
        // The server already creates SQLite records; the browser gets them via session_added
        break;

      case "sessions_reordered":
        setSessionOrderMap((prev) => {
          const next = new Map(prev);
          next.set(msg.cwd, msg.sessionIds);
          return next;
        });
        break;

      case "pinned_dirs_updated":
        setPinnedDirectories(msg.paths);
        break;
    }
  }, [send, clearSpawningCwd, navigate]);

  useEffect(() => {
    return onMessage(handleMessage);
  }, [onMessage, handleMessage]);

  // Clear subscriptions on reconnect so sessions get re-subscribed
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (status === "connected" && prevStatusRef.current !== "connected") {
      subscribedRef.current.clear();
      setSessionOrderMap(new Map());
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
      prevSelectedRef.current = selectedId;
    }
    // Lazy subscribe: load events for ended sessions when first selected
    if (selectedId && !subscribedRef.current.has(selectedId)) {
      subscribedRef.current.add(selectedId);
      send({ type: "subscribe", sessionId: selectedId, lastSeq: 0 });
    }
  }, [selectedId, send]);

  const selectedState = selectedId
    ? sessionStates.get(selectedId) ?? createInitialState()
    : createInitialState();

  const selectedCommands = selectedId
    ? sessionCommands.get(selectedId) ?? []
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

  const handleAbort = useCallback(
    () => {
      if (selectedId) {
        send({ type: "abort", sessionId: selectedId });
      }
    },
    [selectedId, send],
  );

  const handleCancelPending = useCallback(
    () => {
      if (selectedId) {
        // Clear pending prompt
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(selectedId);
          if (current?.pendingPrompt) {
            next.set(selectedId, { ...current, pendingPrompt: undefined });
          }
          return next;
        });
        // Send abort to stop any server-side processing
        send({ type: "abort", sessionId: selectedId });
      }
    },
    [selectedId, send],
  );

  const handleOpenSpecRefresh = useCallback(
    (cwd: string) => {
      send({ type: "openspec_refresh", cwd });
    },
    [send],
  );

  const handleBulkArchive = useCallback(
    (cwd: string) => {
      send({ type: "openspec_bulk_archive", cwd });
    },
    [send],
  );

  const handleReadArtifact = useCallback(
    (cwd: string, changeName: string, artifactId: string) => {
      // Find artifacts for this change from openspecMap
      const openspecData = openspecMap.get(cwd);
      const change = openspecData?.changes.find((c) => c.name === changeName);
      const artifacts = change?.artifacts ?? [];
      setPreviewState({ cwd, changeName, artifactId, artifacts });
    },
    [openspecMap],
  );

  const handleAttachProposal = useCallback(
    (sessionId: string, changeName: string) => {
      send({ type: "attach_proposal", sessionId, changeName });
    },
    [send],
  );

  const handleDetachProposal = useCallback(
    (sessionId: string) => {
      send({ type: "detach_proposal", sessionId });
    },
    [send],
  );

  const handleListFiles = useCallback(
    (query: string) => {
      if (selectedId) {
        send({ type: "list_files", sessionId: selectedId, query });
      }
    },
    [selectedId, send]
  );

  const handleSend = useCallback(
    (text: string, images?: import("../shared/types.js").ImageContent[]) => {
      if (selectedId) {
        send({ type: "send_prompt", sessionId: selectedId, text, images });
        // Set optimistic pending prompt
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(selectedId) ?? createInitialState();
          next.set(selectedId, {
            ...current,
            pendingPrompt: {
              text,
              images: images?.map((img) => ({ data: img.data, mimeType: img.mimeType })),
            },
          });
          return next;
        });
      }
    },
    [selectedId, send]
  );

  const handleSelect = useCallback(
    (id: string) => {
      navigate(`/session/${id}`);
      setMobileOpen(false);
    },
    [navigate],
  );

  const handleRenameSession = useCallback(
    (sessionId: string, name: string) => {
      send({ type: "rename_session", sessionId, name });
    },
    [send],
  );

  const handleShutdownSession = useCallback(
    (sessionId: string) => {
      send({ type: "shutdown", sessionId });
    },
    [send],
  );

  const handleSendPromptToSession = useCallback(
    (sessionId: string, text: string) => {
      send({ type: "send_prompt", sessionId, text });
    },
    [send],
  );

  const handleResumeSession = useCallback(
    (sessionId: string, mode: "continue" | "fork") => {
      send({ type: "resume_session", sessionId, mode } as any);
    },
    [send],
  );

  const handleSpawnSession = useCallback(
    (cwd: string) => {
      setSpawningCwds((prev) => {
        const next = new Set(prev);
        next.add(cwd);
        return next;
      });
      // Safety timeout: auto-clear after 30s
      const timer = setTimeout(() => {
        spawnTimeoutsRef.current.delete(cwd);
        clearSpawningCwd(cwd);
      }, 30_000);
      spawnTimeoutsRef.current.set(cwd, timer);
      send({ type: "spawn_session", cwd } as any);
    },
    [send, clearSpawningCwd],
  );

  const handleHideSession = useCallback(
    (sessionId: string) => {
      // Optimistic UI update
      setSessions((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);
        if (existing) {
          next.set(sessionId, { ...existing, hidden: true });
        }
        return next;
      });
      send({ type: "hide_session", sessionId });
    },
    [send],
  );

  const handleUnhideSession = useCallback(
    (sessionId: string) => {
      // Optimistic UI update
      setSessions((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);
        if (existing) {
          next.set(sessionId, { ...existing, hidden: false });
        }
        return next;
      });
      send({ type: "unhide_session", sessionId });
    },
    [send],
  );

  const sessionList = (
    <SessionList
      sessions={Array.from(sessions.values())}
      selectedId={selectedId}
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
        send({ type: "reorder_sessions", cwd, sessionIds } as any);
      }}
      onSendPrompt={handleSendPromptToSession}
      onOpenSpecRefresh={handleOpenSpecRefresh}
      onBulkArchive={handleBulkArchive}
      onReadArtifact={handleReadArtifact}
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
        send({ type: "pin_directory", path: dirPath } as any);
      }}
      onUnpinDirectory={(dirPath) => {
        setPinnedDirectories((prev) => prev.filter((p) => p !== dirPath));
        send({ type: "unpin_directory", path: dirPath } as any);
      }}
      onReorderPinnedDirs={(paths) => {
        setPinnedDirectories(paths);
        send({ type: "reorder_pinned_dirs", paths } as any);
      }}
    />
  );

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Desktop sidebar (hidden below md) */}
      <div className="hidden md:flex">
        <ResizableSidebar sidebar={sidebar}>
          {sessionList}
        </ResizableSidebar>
      </div>

      {/* Mobile hamburger + overlay (hidden above md) */}
      <HamburgerButton onClick={() => setMobileOpen(true)} />
      <MobileOverlay open={mobileOpen} onClose={() => setMobileOpen(false)}>
        {sessionList}
      </MobileOverlay>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Connection status */}
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
        {selectedId ? (
          <>
            <SessionHeader
              session={sessions.get(selectedId)}
              state={selectedState}
              onRename={handleRenameSession}
              showBack
              onBack={() => window.history.back()}
            />
            <TokenStatsBar
              turnStats={selectedState.turnStats}
              contextUsage={selectedState.contextUsage}
              tokensIn={selectedState.tokensIn}
              tokensOut={selectedState.tokensOut}
              cacheRead={selectedState.cacheRead}
              cacheWrite={selectedState.cacheWrite}
              cost={selectedState.cost}
            />
            {previewState ? (
              <OpenSpecPreview
                cwd={previewState.cwd}
                changeName={previewState.changeName}
                initialArtifact={previewState.artifactId}
                artifacts={previewState.artifacts}
                onBack={() => setPreviewState(null)}
              />
            ) : (
              <>
                <ChatView state={selectedState} toolContext={toolContext} onCancelPending={handleCancelPending} />
                <StatusBar
                  model={selectedState.model ?? selectedSession?.model}
                  models={modelsMap.get(selectedId)}
                  thinkingLevel={selectedState.thinkingLevel ?? selectedSession?.thinkingLevel}
                  status={selectedState.status}
                  currentTool={selectedState.currentTool}
                  streamingText={selectedState.streamingText || undefined}
                  onSelectModel={(modelStr) => {
                    send({ type: "send_prompt", sessionId: selectedId, text: `/model ${modelStr}` });
                  }}
                  onSelectThinkingLevel={(level) => {
                    send({ type: "set_thinking_level", sessionId: selectedId, level });
                  }}
                />
                <CommandInput
                  commands={selectedCommands}
                  onSend={handleSend}
                  onListFiles={handleListFiles}
                  fileResults={fileResults}
                  disabled={false}
                  sessionStatus={selectedState.status}
                  onAbort={handleAbort}
                  pendingPrompt={!!selectedState.pendingPrompt}
                  onCancelPending={handleCancelPending}
                />
              </>
            )}
          </>
        ) : (
          <LandingPage />
        )}
      </div>
    </div>
  );
}
