/**
 * Extension ↔ Server WebSocket protocol messages.
 */
import type { DashboardEvent, CommandInfo, FlowInfo, SessionSource, ImageContent, FileEntry, TurnUsage, ContextUsage, ModelInfo, PiSessionInfo, OpenSpecPhase } from "./types.js";

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

export interface FlowsListMessage {
  type: "flows_list";
  sessionId: string;
  flows: FlowInfo[];
}

export interface ExtensionUiRequestMessage {
  type: "extension_ui_request";
  sessionId: string;
  requestId: string;
  method: string;
  params: Record<string, unknown>;
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

// OpenSpecUpdateMessage removed — server polls directly via DirectoryService

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

// SessionHistorySyncMessage removed — server reads history directly via DirectoryService

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

export interface ExtensionUiDismissMessage {
  type: "extension_ui_dismiss";
  sessionId: string;
  requestId: string;
}

// LoadSessionEventsResultMessage and LoadSessionEventsErrorMessage removed — server loads directly

export type ExtensionToServerMessage =
  | SessionRegisterMessage
  | SessionUnregisterMessage
  | SessionHeartbeatMessage
  | EventForwardMessage
  | CommandsListMessage
  | FlowsListMessage
  | ExtensionUiRequestMessage
  | StatsUpdateMessage
  | FilesListMessage
  | GitInfoUpdateMessage
  | SessionNameUpdateMessage
  | ModelsListMessage
  | ModelUpdateMessage
  | OpenSpecActivityUpdateMessage
  | SessionsListExtensionMessage
  | ExtensionUiDismissMessage;

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

// OpenSpecRefreshMessage removed — server refreshes directly via DirectoryService

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

export interface SetModelMessage {
  type: "set_model";
  sessionId: string;
  provider: string;
  modelId: string;
}

export interface ShutdownExtensionMessage {
  type: "shutdown";
  sessionId: string;
}

export interface FlowControlExtensionMessage {
  type: "flow_control";
  sessionId: string;
  action: "abort" | "toggle_autonomous";
}

// LoadSessionEventsMessage removed — server loads directly via DirectoryService

export interface ExtensionUiResponseMessage {
  type: "extension_ui_response";
  sessionId: string;
  requestId: string;
  result?: unknown;
  cancelled?: boolean;
}

export type ServerToExtensionMessage =
  | SendPromptToExtensionMessage
  | AbortToExtensionMessage
  | ExtensionUiResponseMessage
  | RequestCommandsMessage
  | RequestStateSyncMessage
  | ListFilesMessage
  | RenameSessionExtensionMessage
  | RequestModelsMessage
  | SetThinkingLevelMessage
  | ListSessionsExtensionMessage
  | SetModelMessage
  | ShutdownExtensionMessage
  | FlowControlExtensionMessage;
