/**
 * Server ↔ Browser WebSocket protocol messages.
 */
import type {
  DashboardSession,
  DashboardEvent,
  CommandInfo,
  ImageContent,
  FileEntry,
  Workspace,
  OpenSpecData,
  ModelInfo,
  PiSessionInfo,
} from "./types.js";

// ── Server → Browser ────────────────────────────────────────────────

export interface SessionAddedMessage {
  type: "session_added";
  session: DashboardSession;
}

export interface SessionUpdatedMessage {
  type: "session_updated";
  sessionId: string;
  updates: Partial<DashboardSession>;
}

export interface SessionRemovedMessage {
  type: "session_removed";
  sessionId: string;
}

export interface EventMessage {
  type: "event";
  sessionId: string;
  seq: number;
  event: DashboardEvent;
}

export interface EventReplayMessage {
  type: "event_replay";
  sessionId: string;
  events: Array<{ seq: number; event: DashboardEvent }>;
  isLast: boolean;
}

export interface BrowserCommandsListMessage {
  type: "commands_list";
  sessionId: string;
  commands: CommandInfo[];
}

export interface BrowserExtensionUiEventMessage {
  type: "extension_ui_event";
  sessionId: string;
  uiEvent: Record<string, unknown>;
}

export interface WorkspaceUpdatedMessage {
  type: "workspace_updated";
  workspaces: Workspace[];
}

export interface BrowserFilesListMessage {
  type: "files_list";
  sessionId: string;
  query: string;
  files: FileEntry[];
}

export interface BrowserOpenSpecUpdateMessage {
  type: "openspec_update";
  sessionId: string;
  data: OpenSpecData;
}

export interface BrowserModelsListMessage {
  type: "models_list";
  sessionId: string;
  models: ModelInfo[];
}

export interface SessionsListBrowserMessage {
  type: "sessions_list";
  sessionId: string;
  cwd: string;
  sessions: PiSessionInfo[];
}

export interface ResumeResultBrowserMessage {
  type: "resume_result";
  sessionId: string;
  success: boolean;
  message: string;
}

export type ServerToBrowserMessage =
  | SessionAddedMessage
  | SessionUpdatedMessage
  | SessionRemovedMessage
  | EventMessage
  | EventReplayMessage
  | BrowserCommandsListMessage
  | BrowserExtensionUiEventMessage
  | WorkspaceUpdatedMessage
  | BrowserFilesListMessage
  | BrowserOpenSpecUpdateMessage
  | BrowserModelsListMessage
  | SessionsListBrowserMessage
  | ResumeResultBrowserMessage;

// ── Browser → Server ────────────────────────────────────────────────

export interface SubscribeMessage {
  type: "subscribe";
  sessionId: string;
  lastSeq?: number;
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  sessionId: string;
}

export interface SendPromptToBrowserMessage {
  type: "send_prompt";
  sessionId: string;
  text: string;
  images?: ImageContent[];
}

export interface AbortToBrowserMessage {
  type: "abort";
  sessionId: string;
}

export interface RequestCommandsToBrowserMessage {
  type: "request_commands";
  sessionId: string;
}

export interface FetchContentMessage {
  type: "fetch_content";
  sessionId: string;
  seq: number;
}

export interface ListFilesToBrowserMessage {
  type: "list_files";
  sessionId: string;
  query: string;
}

export interface OpenSpecRefreshBrowserMessage {
  type: "openspec_refresh";
  sessionId: string;
}

export interface RenameSessionBrowserMessage {
  type: "rename_session";
  sessionId: string;
  name: string;
}

export interface RequestModelsBrowserMessage {
  type: "request_models";
  sessionId: string;
}

export interface SetThinkingLevelBrowserMessage {
  type: "set_thinking_level";
  sessionId: string;
  level: string;
}

export interface ShutdownBrowserMessage {
  type: "shutdown";
  sessionId: string;
}

export interface ListSessionsBrowserMessage {
  type: "list_sessions";
  cwd: string;
}

export interface ResumeSessionBrowserMessage {
  type: "resume_session";
  sessionId: string;
  mode: "continue" | "fork";
}

export interface HideSessionBrowserMessage {
  type: "hide_session";
  sessionId: string;
}

export interface UnhideSessionBrowserMessage {
  type: "unhide_session";
  sessionId: string;
}

export type BrowserToServerMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | SendPromptToBrowserMessage
  | AbortToBrowserMessage
  | RequestCommandsToBrowserMessage
  | FetchContentMessage
  | ListFilesToBrowserMessage
  | OpenSpecRefreshBrowserMessage
  | RenameSessionBrowserMessage
  | RequestModelsBrowserMessage
  | SetThinkingLevelBrowserMessage
  | ShutdownBrowserMessage
  | ListSessionsBrowserMessage
  | ResumeSessionBrowserMessage
  | HideSessionBrowserMessage
  | UnhideSessionBrowserMessage;
