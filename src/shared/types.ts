/** Source environment where a pi session is running */
export type SessionSource = "tui" | "zed" | "tmux" | "dashboard" | "unknown";

/** Current status of a session */
export type SessionStatus = "active" | "idle" | "streaming" | "ended";

/** A workspace (project folder) */
export interface Workspace {
  id: string;
  name: string;
  path: string;
  sortOrder: number;
  createdAt: number;
}

/** A dashboard session representing a connected pi instance */
export interface DashboardSession {
  id: string;
  cwd: string;
  name?: string;
  source: SessionSource;
  status: SessionStatus;
  model?: string;
  thinkingLevel?: string;
  workspaceId?: string;
  startedAt: number;
  endedAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
  currentTool?: string;
  gitBranch?: string;
  gitBranchUrl?: string;
  gitPrNumber?: number;
  gitPrUrl?: string;
  openspecData?: string;
  openspecPhase?: OpenSpecPhase | null;
  openspecChange?: string | null;
  sessionFile?: string;
  sessionDir?: string;
  hidden?: boolean;
  firstMessage?: string;
  dataUnavailable?: boolean;
}

/** An event forwarded from a pi session */
export interface DashboardEvent {
  eventType: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Info about an available command */
export interface CommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  location?: string;
  path?: string;
}

/** Image content for message attachments (compatible with pi SDK ImageContent) */
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** File entry from directory listing */
export interface FileEntry {
  path: string;
  isDirectory: boolean;
}

/** Per-turn token usage breakdown */
export interface TurnUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Context window usage */
export interface ContextUsage {
  tokens: number | null;
  contextWindow: number;
}

/** Available model info */
export interface ModelInfo {
  provider: string;
  id: string;
}

/** OpenSpec artifact status */
export interface OpenSpecArtifact {
  id: string;
  status: "done" | "ready" | "blocked";
}

/** A single OpenSpec change */
export interface OpenSpecChange {
  name: string;
  status: "no-tasks" | "in-progress" | "complete";
  completedTasks: number;
  totalTasks: number;
  artifacts: OpenSpecArtifact[];
}

/** OpenSpec data for a session's project */
export interface OpenSpecData {
  initialized: boolean;
  changes: OpenSpecChange[];
}

/** OpenSpec workflow phase detected from tool calls */
export type OpenSpecPhase =
  | "explore"
  | "new"
  | "continue"
  | "ff"
  | "apply"
  | "verify"
  | "archive"
  | "sync-specs"
  | "onboard";

/** Active OpenSpec activity for a session */
export interface OpenSpecActivity {
  phase: OpenSpecPhase;
  changeName?: string;
}

/** Pi session info returned from SessionManager.list() */
export interface PiSessionInfo {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage?: string;
}

/** REST API response envelope */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
