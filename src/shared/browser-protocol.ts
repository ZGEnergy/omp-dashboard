/**
 * Server ↔ Browser WebSocket protocol messages.
 */
import type {
  DashboardSession,
  DashboardEvent,
  CommandInfo,
  ImageContent,
  FileEntry,
  OpenSpecData,
  ModelInfo,
  PiSessionInfo,
} from "./types.js";
import type { TerminalSession } from "./terminal-types.js";

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

export interface BrowserExtensionUiRequestMessage {
  type: "extension_ui_request";
  sessionId: string;
  requestId: string;
  method: string;
  params: Record<string, unknown>;
}

export interface BrowserFilesListMessage {
  type: "files_list";
  sessionId: string;
  query: string;
  files: FileEntry[];
}

export interface BrowserOpenSpecUpdateMessage {
  type: "openspec_update";
  cwd: string;
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

export interface SpawnResultBrowserMessage {
  type: "spawn_result";
  cwd: string;
  success: boolean;
  message: string;
}

export interface SessionsReorderedMessage {
  type: "sessions_reordered";
  cwd: string;
  sessionIds: string[];
}

export interface PinnedDirsUpdatedMessage {
  type: "pinned_dirs_updated";
  paths: string[];
}

export interface TerminalAddedMessage {
  type: "terminal_added";
  terminal: TerminalSession;
}

export interface TerminalRemovedMessage {
  type: "terminal_removed";
  terminalId: string;
}

export interface TerminalUpdatedMessage {
  type: "terminal_updated";
  terminalId: string;
  updates: Partial<TerminalSession>;
}

export type ServerToBrowserMessage =
  | SessionAddedMessage
  | SessionUpdatedMessage
  | SessionRemovedMessage
  | EventMessage
  | EventReplayMessage
  | BrowserCommandsListMessage
  | BrowserExtensionUiRequestMessage
  | BrowserFilesListMessage
  | BrowserOpenSpecUpdateMessage
  | BrowserModelsListMessage
  | SessionsListBrowserMessage
  | ResumeResultBrowserMessage
  | SpawnResultBrowserMessage
  | SessionsReorderedMessage
  | PinnedDirsUpdatedMessage
  | TerminalAddedMessage
  | TerminalRemovedMessage
  | TerminalUpdatedMessage;

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
  cwd: string;
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

export interface SetModelBrowserMessage {
  type: "set_model";
  sessionId: string;
  provider: string;
  modelId: string;
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

export interface SpawnSessionBrowserMessage {
  type: "spawn_session";
  cwd: string;
}

export interface AttachProposalBrowserMessage {
  type: "attach_proposal";
  sessionId: string;
  changeName: string;
}

export interface DetachProposalBrowserMessage {
  type: "detach_proposal";
  sessionId: string;
}

export interface ReorderSessionsBrowserMessage {
  type: "reorder_sessions";
  cwd: string;
  sessionIds: string[];
}

export interface PinDirectoryMessage {
  type: "pin_directory";
  path: string;
}

export interface UnpinDirectoryMessage {
  type: "unpin_directory";
  path: string;
}

export interface ReorderPinnedDirsMessage {
  type: "reorder_pinned_dirs";
  paths: string[];
}

export interface OpenSpecBulkArchiveBrowserMessage {
  type: "openspec_bulk_archive";
  cwd: string;
}

export interface CreateTerminalBrowserMessage {
  type: "create_terminal";
  cwd: string;
}

export interface KillTerminalBrowserMessage {
  type: "kill_terminal";
  terminalId: string;
}

export interface RenameTerminalBrowserMessage {
  type: "rename_terminal";
  terminalId: string;
  title: string;
}

export interface BrowserExtensionUiResponseMessage {
  type: "extension_ui_response";
  sessionId: string;
  requestId: string;
  result?: unknown;
  cancelled?: boolean;
}

export type BrowserToServerMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | BrowserExtensionUiResponseMessage
  | SendPromptToBrowserMessage
  | AbortToBrowserMessage
  | RequestCommandsToBrowserMessage
  | FetchContentMessage
  | ListFilesToBrowserMessage
  | OpenSpecRefreshBrowserMessage
  | RenameSessionBrowserMessage
  | RequestModelsBrowserMessage
  | SetThinkingLevelBrowserMessage
  | SetModelBrowserMessage
  | ShutdownBrowserMessage
  | ListSessionsBrowserMessage
  | ResumeSessionBrowserMessage
  | HideSessionBrowserMessage
  | UnhideSessionBrowserMessage
  | SpawnSessionBrowserMessage
  | AttachProposalBrowserMessage
  | DetachProposalBrowserMessage
  | ReorderSessionsBrowserMessage
  | PinDirectoryMessage
  | UnpinDirectoryMessage
  | ReorderPinnedDirsMessage
  | OpenSpecBulkArchiveBrowserMessage
  | CreateTerminalBrowserMessage
  | KillTerminalBrowserMessage
  | RenameTerminalBrowserMessage;
