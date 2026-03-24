/**
 * Extension ↔ Server WebSocket protocol messages.
 */
import type { DashboardEvent, CommandInfo, SessionSource, ImageContent, FileEntry, TurnUsage, ContextUsage, OpenSpecData, ModelInfo, PiSessionInfo, OpenSpecPhase } from "./types.js";

// ── Extension → Server ──────────────────────────────────────────────

export interface SessionRegisterMessage {
  type: "session_register";
  sessionId: string;
  cwd: string;
  name?: string;
  source: SessionSource;
  model?: string;
  thinkingLevel?: string;
  sessionFile?: string;
  sessionDir?: string;
  firstMessage?: string;
  /** True when this is a fresh session start (not a reconnection) */
  isNew?: boolean;
}

export interface SessionUnregisterMessage {
  type: "session_unregister";
  sessionId: string;
}

export interface SessionHeartbeatMessage {
  type: "session_heartbeat";
  sessionId: string;
}

export interface EventForwardMessage {
  type: "event_forward";
  sessionId: string;
  event: DashboardEvent;
}

export interface CommandsListMessage {
  type: "commands_list";
  sessionId: string;
  commands: CommandInfo[];
}

export interface ExtensionUiEventMessage {
  type: "extension_ui_event";
  sessionId: string;
  uiEvent: Record<string, unknown>;
}

export interface StatsUpdateMessage {
  type: "stats_update";
  sessionId: string;
  stats: {
    tokensIn: number;
    tokensOut: number;
    cost: number;
    turnUsage?: TurnUsage;
    contextUsage?: ContextUsage;
  };
}

export interface FilesListMessage {
  type: "files_list";
  sessionId: string;
  query: string;
  files: FileEntry[];
}

export interface GitInfoUpdateMessage {
  type: "git_info_update";
  sessionId: string;
  gitBranch: string;
  gitBranchUrl?: string;
  gitPrNumber?: number;
  gitPrUrl?: string;
}

export interface OpenSpecUpdateMessage {
  type: "openspec_update";
  sessionId: string;
  data: OpenSpecData;
}

export interface ModelsListMessage {
  type: "models_list";
  sessionId: string;
  models: ModelInfo[];
}

export interface SessionNameUpdateMessage {
  type: "session_name_update";
  sessionId: string;
  name: string;
}

export interface SessionsListExtensionMessage {
  type: "sessions_list";
  sessionId: string;
  cwd: string;
  sessions: PiSessionInfo[];
}

export interface SessionHistorySyncMessage {
  type: "session_history_sync";
  sessions: Array<{
    id: string;
    cwd: string;
    name?: string;
    startedAt: number;
    firstMessage?: string;
    sessionFile?: string;
    sessionDir?: string;
  }>;
}

export interface OpenSpecActivityUpdateMessage {
  type: "openspec_activity_update";
  sessionId: string;
  phase?: OpenSpecPhase | null;
  changeName?: string | null;
}

export interface ModelUpdateMessage {
  type: "model_update";
  sessionId: string;
  model: string;
  thinkingLevel?: string;
}

export interface LoadSessionEventsResultMessage {
  type: "load_session_events_result";
  sessionId: string;
  events: Array<{ eventType: string; timestamp: number; data: Record<string, unknown> }>;
}

export interface LoadSessionEventsErrorMessage {
  type: "load_session_events_error";
  sessionId: string;
  error: string;
}

export type ExtensionToServerMessage =
  | SessionRegisterMessage
  | SessionUnregisterMessage
  | SessionHeartbeatMessage
  | EventForwardMessage
  | CommandsListMessage
  | ExtensionUiEventMessage
  | StatsUpdateMessage
  | FilesListMessage
  | GitInfoUpdateMessage
  | OpenSpecUpdateMessage
  | SessionNameUpdateMessage
  | ModelsListMessage
  | ModelUpdateMessage
  | OpenSpecActivityUpdateMessage
  | SessionsListExtensionMessage
  | SessionHistorySyncMessage
  | LoadSessionEventsResultMessage
  | LoadSessionEventsErrorMessage;

// ── Server → Extension ──────────────────────────────────────────────

export interface SendPromptToExtensionMessage {
  type: "send_prompt";
  sessionId: string;
  text: string;
  images?: ImageContent[];
}

export interface AbortToExtensionMessage {
  type: "abort";
  sessionId: string;
}

export interface RequestCommandsMessage {
  type: "request_commands";
  sessionId: string;
}

export interface RequestStateSyncMessage {
  type: "request_state_sync";
  sessionId: string;
}

export interface ListFilesMessage {
  type: "list_files";
  sessionId: string;
  query: string;
}

export interface OpenSpecRefreshMessage {
  type: "openspec_refresh";
  sessionId: string;
}

export interface RenameSessionExtensionMessage {
  type: "rename_session";
  sessionId: string;
  name: string;
}

export interface RequestModelsMessage {
  type: "request_models";
  sessionId: string;
}

export interface SetThinkingLevelMessage {
  type: "set_thinking_level";
  sessionId: string;
  level: string;
}

export interface ListSessionsExtensionMessage {
  type: "list_sessions";
  sessionId: string;
  cwd: string;
}

export interface ShutdownExtensionMessage {
  type: "shutdown";
  sessionId: string;
}

export interface LoadSessionEventsMessage {
  type: "load_session_events";
  sessionId: string;
  sessionFile: string;
}

export type ServerToExtensionMessage =
  | SendPromptToExtensionMessage
  | AbortToExtensionMessage
  | RequestCommandsMessage
  | RequestStateSyncMessage
  | ListFilesMessage
  | OpenSpecRefreshMessage
  | RenameSessionExtensionMessage
  | RequestModelsMessage
  | SetThinkingLevelMessage
  | ListSessionsExtensionMessage
  | ShutdownExtensionMessage
  | LoadSessionEventsMessage;
