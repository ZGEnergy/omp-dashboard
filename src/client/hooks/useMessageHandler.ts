/**
 * Hook that handles ServerToBrowserMessage dispatch.
 * Extracted from App.tsx — maps each message type to the correct state setter.
 */
import { useCallback } from "react";
import { createInitialState, reduceEvent, addInteractiveRequest, resolveInteractiveRequest, dismissInteractiveRequest, type SessionState } from "../lib/event-reducer.js";
import type { DashboardSession, CommandInfo, FlowInfo, FileEntry, OpenSpecData, ModelInfo, RoleInfo } from "../../shared/types.js";
import type { TerminalSession } from "../../shared/terminal-types.js";
import type { EditorInstanceStatus } from "../../shared/editor-types.js";
import type { ServerToBrowserMessage } from "../../shared/browser-protocol.js";

export interface MessageHandlerSetters {
  setSessions: React.Dispatch<React.SetStateAction<Map<string, DashboardSession>>>;
  setSessionStates: React.Dispatch<React.SetStateAction<Map<string, SessionState>>>;
  setSessionCommands: React.Dispatch<React.SetStateAction<Map<string, CommandInfo[]>>>;
  setSessionFlows: React.Dispatch<React.SetStateAction<Map<string, FlowInfo[]>>>;
  setFileResults: React.Dispatch<React.SetStateAction<{ query: string; files: FileEntry[] } | null>>;
  setOpenspecMap: React.Dispatch<React.SetStateAction<Map<string, OpenSpecData>>>;
  setModelsMap: React.Dispatch<React.SetStateAction<Map<string, ModelInfo[]>>>;
  setRolesMap: React.Dispatch<React.SetStateAction<Map<string, RoleInfo>>>;
  setSpawnResult: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  setSessionOrderMap: React.Dispatch<React.SetStateAction<Map<string, string[]>>>;
  setPinnedDirectories: React.Dispatch<React.SetStateAction<string[]>>;
  setTerminals: React.Dispatch<React.SetStateAction<Map<string, TerminalSession>>>;
  setEditorStatuses: React.Dispatch<React.SetStateAction<Map<string, { id: string; status: EditorInstanceStatus }>>>;
}

export interface MessageHandlerDeps {
  send: (msg: any) => void;
  navigate: (to: string) => void;
  clearSpawningCwd: (cwd: string) => void;
  spawningCwdsRef: React.MutableRefObject<Set<string>>;
  subscribedRef: React.MutableRefObject<Set<string>>;
  pendingTerminalCwdRef: React.MutableRefObject<string | null>;
  maxSeqMapRef: React.MutableRefObject<Map<string, number>>;
}

export function useMessageHandler(
  setters: MessageHandlerSetters,
  deps: MessageHandlerDeps,
): (msg: ServerToBrowserMessage) => void {
  const {
    setSessions, setSessionStates, setSessionCommands, setSessionFlows,
    setFileResults, setOpenspecMap, setModelsMap, setRolesMap, setSpawnResult,
    setSessionOrderMap, setPinnedDirectories, setTerminals, setEditorStatuses,
  } = setters;
  const { send, navigate, clearSpawningCwd, spawningCwdsRef, subscribedRef, pendingTerminalCwdRef, maxSeqMapRef } = deps;

  return useCallback((msg: ServerToBrowserMessage) => {
    switch (msg.type) {
      case "session_added":
        setSessions((prev) => {
          const next = new Map(prev);
          next.set(msg.session.id, msg.session);
          if (msg.session.status !== "ended") {
            for (const [id, s] of next) {
              if (id !== msg.session.id && s.cwd === msg.session.cwd && s.resuming) {
                next.set(id, { ...s, resuming: false });
              }
            }
          }
          return next;
        });
        if (spawningCwdsRef.current.has(msg.session.cwd)) {
          clearSpawningCwd(msg.session.cwd);
          navigate(`/session/${msg.session.id}`);
        }
        // Commands/models/roles metadata is now requested server-side on subscribe
        // (see subscription-handler.ts) so it arrives while the browser is subscribed.
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

      case "session_state_reset":
        setSessionStates((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, createInitialState());
          return next;
        });
        maxSeqMapRef.current.set(msg.sessionId, 0);
        break;

      case "event":
        setSessionStates((prev) => {
          const next = new Map(prev);
          const current = next.get(msg.sessionId) ?? createInitialState();
          next.set(msg.sessionId, reduceEvent(current, msg.event));
          return next;
        });
        if (msg.seq > (maxSeqMapRef.current.get(msg.sessionId) ?? 0)) {
          maxSeqMapRef.current.set(msg.sessionId, msg.seq);
        }
        break;

      case "commands_list":
        setSessionCommands((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, msg.commands);
          return next;
        });
        break;

      case "flows_list":
        setSessionFlows((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, msg.flows);
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

      case "roles_list":
        setRolesMap((prev) => {
          const next = new Map(prev);
          next.set(msg.sessionId, {
            roles: msg.roles,
            presets: msg.presets,
            activePreset: msg.activePreset,
          });
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
        const firstSeq = msg.events.length > 0 ? msg.events[0].seq : null;
        setSessionStates((prev) => {
          const next = new Map(prev);
          let current = (firstSeq === 1) ? createInitialState() : (next.get(msg.sessionId) ?? createInitialState());
          for (const { event } of msg.events) {
            current = reduceEvent(current, event);
          }
          next.set(msg.sessionId, current);
          return next;
        });
        // Track highest seq from replay batch
        if (msg.events.length > 0) {
          const lastEvt = msg.events[msg.events.length - 1];
          if (lastEvt.seq > (maxSeqMapRef.current.get(msg.sessionId) ?? 0)) {
            maxSeqMapRef.current.set(msg.sessionId, lastEvt.seq);
          }
        }
        break;
      }

      case "resume_result":
        if (!msg.success) {
          console.warn("[dashboard] Resume/fork failed:", msg.message);
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
          if (updated === current) return prev;
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

      case "package_progress":
      case "package_operation_complete":
        // Dispatch to component-level hooks via custom DOM event
        window.dispatchEvent(new CustomEvent("pi-package-event", { detail: msg }));
        break;

      case "editor_status":
        setEditorStatuses((prev) => {
          const next = new Map(prev);
          if (msg.status === "stopped") {
            next.delete(msg.cwd);
          } else {
            next.set(msg.cwd, { id: msg.id, status: msg.status });
          }
          return next;
        });
        break;
    }
  }, [send, clearSpawningCwd, navigate, setSessions, setSessionStates, setSessionCommands, setSessionFlows, setFileResults, setOpenspecMap, setModelsMap, setRolesMap, setSpawnResult, setSessionOrderMap, setPinnedDirectories, setTerminals, setEditorStatuses, spawningCwdsRef, subscribedRef, pendingTerminalCwdRef, maxSeqMapRef]);
}
