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
import { MarkdownPreviewView } from "./components/MarkdownPreviewView.js";
import { PiResourcesView } from "./components/PiResourcesView.js";
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
import { createInitialState, reduceEvent, addInteractiveRequest, resolveInteractiveRequest, dismissInteractiveRequest, type SessionState } from "./lib/event-reducer.js";
import { useEditors } from "./lib/use-editors.js";
import type { DashboardSession, CommandInfo, FileEntry, OpenSpecData, ModelInfo } from "../shared/types.js";
import type { TerminalSession } from "../shared/terminal-types.js";
import type { ServerToBrowserMessage } from "../shared/browser-protocol.js";
import type { ToolContext } from "./components/tool-renderers/index.js";
import type { ContextUsageInfo } from "./components/SessionList.js";

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsPort = window.location.port ? `:${window.location.port}` : "";
const WS_URL = `${wsProtocol}//${window.location.hostname}${wsPort}/ws`;

const SOURCE_LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".json": "json", ".sh": "bash", ".bash": "bash", ".zsh": "bash",
  ".py": "python", ".rb": "ruby", ".rs": "rust", ".go": "go",
  ".java": "java", ".kt": "kotlin", ".swift": "swift",
  ".css": "css", ".scss": "scss", ".html": "html", ".xml": "xml",
  ".yaml": "yaml", ".yml": "yaml", ".toml": "toml",
  ".c": "c", ".cpp": "cpp", ".h": "c", ".hpp": "cpp",
  ".sql": "sql", ".graphql": "graphql",
};

function getSourceLanguage(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return SOURCE_LANG_MAP[ext] ?? null;
}

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
  const [settingsMatch] = useRoute("/settings");
  const [tunnelSetupMatch] = useRoute("/tunnel-setup");
  const selectedId = match ? params?.id : undefined;
  const selectedTerminalId = termMatch ? termParams?.id : undefined;
  const sidebar = useSidebarState();
  const isMobile = useMobile();
  const installPrompt = useInstallPrompt();
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
  const [terminals, setTerminals] = useState<Map<string, TerminalSession>>(new Map());
  const pendingTerminalCwdRef = useRef<string | null>(null);
  const subscribedRef = useRef(new Set<string>());
  const [previewState, setPreviewState] = useState<{
    cwd: string;
    changeName: string;
    artifactId: string;
    artifacts: OpenSpecArtifact[];
  } | null>(null);
  const [piResourcesState, setPiResourcesState] = useState<{ cwd: string } | null>(null);
  const [piResourceFilePreview, setPiResourceFilePreview] = useState<{
    filePath: string;
    title: string;
    content?: string;
    isLoading: boolean;
    error?: string;
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
          // Clear resuming flag on any session in the same cwd (handles fork case)
          if (msg.session.status !== "ended") {
            for (const [id, s] of next) {
              if (id !== msg.session.id && s.cwd === msg.session.cwd && s.resuming) {
                next.set(id, { ...s, resuming: false });
              }
            }
          }
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

      case "event_replay": {
        // Determine if this is a full replay (seq starts at 1) or incremental
        const firstSeq = msg.events.length > 0 ? msg.events[0].seq : null;
        setSessionStates((prev) => {
          const next = new Map(prev);
          // Reset state on full replay to avoid duplicate messages
          let current = (firstSeq === 1) ? createInitialState() : (next.get(msg.sessionId) ?? createInitialState());
          for (const { event } of msg.events) {
            current = reduceEvent(current, event);
          }
          next.set(msg.sessionId, current);
          return next;
        });
        break;
      }

      case "resume_result":
        if (!msg.success) {
          console.warn("[dashboard] Resume/fork failed:", msg.message);
          // Clear optimistic resuming state on failure
          setSessions((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.sessionId);
            if (existing) {
              next.set(msg.sessionId, { ...existing, resuming: false });
            }
            return next;
          });
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

      case "extension_ui_request":
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(msg.sessionId) ?? createInitialState();
          const updated = addInteractiveRequest(current, msg.requestId, msg.method, msg.params);
          if (updated === current) return prev; // dedup: no change
          next.set(msg.sessionId, updated);
          return next;
        });
        break;

      case "ui_dismiss":
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(msg.sessionId);
          if (!current) return prev;
          const updated = dismissInteractiveRequest(current, msg.requestId);
          if (updated === current) return prev;
          next.set(msg.sessionId, updated);
          return next;
        });
        break;

      case "terminal_added":
        setTerminals((prev) => {
          const next = new Map(prev);
          next.set(msg.terminal.id, msg.terminal);
          return next;
        });
        // Auto-navigate if this terminal was spawned by this browser tab
        if (pendingTerminalCwdRef.current === msg.terminal.cwd) {
          pendingTerminalCwdRef.current = null;
          navigate(`/terminal/${msg.terminal.id}`);
        }
        break;

      case "terminal_removed":
        setTerminals((prev) => {
          const next = new Map(prev);
          next.delete(msg.terminalId);
          return next;
        });
        break;

      case "terminal_updated":
        setTerminals((prev) => {
          const next = new Map(prev);
          const existing = next.get(msg.terminalId);
          if (existing) {
            next.set(msg.terminalId, { ...existing, ...msg.updates });
          }
          return next;
        });
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
      setTerminals(new Map());
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

  const handleRespondToUi = useCallback(
    (requestId: string, result?: unknown, cancelled?: boolean) => {
      if (selectedId) {
        send({ type: "extension_ui_response", sessionId: selectedId, requestId, result, cancelled });
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(selectedId);
          if (current) {
            next.set(selectedId, resolveInteractiveRequest(current, requestId, result, cancelled));
          }
          return next;
        });
        // Optimistically clear "Waiting for input" on the session card
        setSessions((prev) => {
          const next = new Map(prev);
          const session = next.get(selectedId);
          if (session?.currentTool === "ask_user") {
            next.set(selectedId, { ...session, currentTool: undefined });
          }
          return next;
        });
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

  const handleOpenPiResources = useCallback(
    (cwd: string) => {
      setPiResourcesState({ cwd });
      setPiResourceFilePreview(null);
    },
    [],
  );

  const handleViewPiResourceFile = useCallback(
    async (filePath: string, title: string) => {
      setPiResourceFilePreview({ filePath, title, isLoading: true });
      try {
        const res = await fetch(`/api/pi-resource-file?path=${encodeURIComponent(filePath)}`);
        const body = await res.json();
        if (body.success) {
          const lang = getSourceLanguage(filePath);
          const content = lang
            ? "```" + lang + "\n" + body.data.content + "\n```"
            : body.data.content;
          setPiResourceFilePreview({ filePath, title, content, isLoading: false });
        } else {
          setPiResourceFilePreview({ filePath, title, isLoading: false, error: body.error });
        }
      } catch (err: any) {
        setPiResourceFilePreview({ filePath, title, isLoading: false, error: err.message });
      }
    },
    [],
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
      // Optimistic: show resuming state immediately
      setSessions((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);
        if (existing) {
          next.set(sessionId, { ...existing, resuming: true });
        }
        return next;
      });
      send({ type: "resume_session", sessionId, mode });
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
      send({ type: "spawn_session", cwd });
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

  const handleCreateTerminal = useCallback(
    (cwd: string) => {
      pendingTerminalCwdRef.current = cwd;
      send({ type: "create_terminal", cwd });
    },
    [send],
  );

  const handleKillTerminal = useCallback(
    (terminalId: string) => {
      send({ type: "kill_terminal", terminalId });
    },
    [send],
  );

  const handleRenameTerminal = useCallback(
    (terminalId: string, title: string) => {
      // Mark as manually renamed so PTY title doesn't override
      setTerminals((prev) => {
        const next = new Map(prev);
        const existing = next.get(terminalId);
        if (existing) {
          next.set(terminalId, { ...existing, title, manuallyRenamed: true });
        }
        return next;
      });
      send({ type: "rename_terminal", terminalId, title });
    },
    [send],
  );

  const handleTerminalTitle = useCallback(
    (terminalId: string, title: string) => {
      setTerminals((prev) => {
        const existing = prev.get(terminalId);
        // Don't override a manually set name with PTY title
        if (!existing || existing.manuallyRenamed) return prev;
        const next = new Map(prev);
        next.set(terminalId, { ...existing, title });
        return next;
      });
      // Only send to server if not manually renamed
      const t = terminals.get(terminalId);
      if (!t?.manuallyRenamed) {
        send({ type: "rename_terminal", terminalId, title });
      }
    },
    [send, terminals],
  );

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
          onSendPrompt: (text) => handleSend(text),
          onReadArtifact: (changeName, artifactId) => handleReadArtifact(selectedCwd!, changeName, artifactId),
        } : undefined}
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
      {piResourceFilePreview ? (
        <MarkdownPreviewView
          title={piResourceFilePreview.title}
          content={piResourceFilePreview.content}
          isLoading={piResourceFilePreview.isLoading}
          error={piResourceFilePreview.error}
          onBack={() => setPiResourceFilePreview(null)}
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
      ) : (
        <>
          <ChatView state={selectedState} toolContext={toolContext} onCancelPending={handleCancelPending} onRespondToUi={handleRespondToUi} />
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
    </div>
  ) : null;

  // Terminal keep-alive views — always mounted, CSS toggled
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
      settingsMatch: !!settingsMatch,
      tunnelSetupMatch: !!tunnelSetupMatch,
      hasPreview: !!previewState || !!piResourcesState || !!piResourceFilePreview,
    });
    return (
      <div className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <MobileShell
          depth={mobileDepth}
          onBack={() => {
            if (piResourceFilePreview) {
              setPiResourceFilePreview(null);
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
            ) : piResourceFilePreview ? (
              <MarkdownPreviewView
                title={piResourceFilePreview.title}
                content={piResourceFilePreview.content}
                isLoading={piResourceFilePreview.isLoading}
                error={piResourceFilePreview.error}
                onBack={() => setPiResourceFilePreview(null)}
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

      <div className="flex-1 flex flex-col min-w-0">
        {connectionBanner}
        {/* Terminal views are always mounted (keep-alive), CSS hidden/shown */}
        {terminalViews}
        {/* Show session detail or landing page when no terminal is selected */}
        {!selectedTerminalId && !settingsMatch && !tunnelSetupMatch && (
          piResourceFilePreview ? (
            <MarkdownPreviewView
              title={piResourceFilePreview.title}
              content={piResourceFilePreview.content}
              isLoading={piResourceFilePreview.isLoading}
              error={piResourceFilePreview.error}
              onBack={() => setPiResourceFilePreview(null)}
            />
          ) : piResourcesState && !selectedId ? (
            <PiResourcesView
              cwd={piResourcesState.cwd}
              onBack={() => setPiResourcesState(null)}
              onViewFile={handleViewPiResourceFile}
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
