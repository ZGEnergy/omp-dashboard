/** Source environment where a pi session is running */
export type SessionSource = "tui" | "zed" | "tmux" | "dashboard" | "terminal" | "unknown";

/** Current status of a session */
export type SessionStatus = "active" | "idle" | "streaming" | "ended";

/** A dashboard session representing a connected pi instance */
export interface DashboardSession {
  id: string;
  cwd: string;
  name?: string;
  source: SessionSource;
  status: SessionStatus;
  model?: string;
  thinkingLevel?: string;
  startedAt: number;
  endedAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
  currentTool?: string | null;
  gitBranch?: string;
  gitBranchUrl?: string;
  gitPrNumber?: number;
  gitPrUrl?: string;
  openspecPhase?: OpenSpecPhase | null;
  openspecChange?: string | null;
  attachedProposal?: string | null;
  contextTokens?: number | null;
  contextWindow?: number;
  sessionFile?: string;
  sessionDir?: string;
  hidden?: boolean;
  firstMessage?: string;
  dataUnavailable?: boolean;
  resuming?: boolean;
  /** Active flow name (set during flow execution) */
  activeFlowName?: string;
  /** Number of completed agents in the active flow */
  flowAgentsDone?: number;
  /** Total number of agents in the active flow */
  flowAgentsTotal?: number;
  /** Flow execution status */
  flowStatus?: FlowStatus;
  /** Last known bridge entry count (for skip-wipe comparison on reconnect) */
  lastEntryCount?: number;
  /** OS process ID of the pi agent — used for force-kill escalation */
  pid?: number;
  /** Active child processes detected by bridge process scanner */
  processes?: Array<{ pid: number; pgid: number; command: string; elapsedMs: number }>;
  /** Latest process metrics from the pi agent */
  processMetrics?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    cpuPercent: number;
    eventLoopMaxMs?: number;
    loadAvg1m: number;
    /** Timestamp when metrics were last received */
    updatedAt: number;
  };
}

/** An event forwarded from a pi session */
export interface DashboardEvent {
  eventType: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Info about an available flow from pi-flows */
export interface FlowInfo {
  name: string;
  description: string;
  taskRequired: boolean;
  source?: string;
}

/** Info about an available command */
export interface CommandInfo {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill" | "builtin";
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

/** Role assignment info (from pi-flows role-manager) */
export interface RoleInfo {
  roles: Record<string, string>;
  presets: Array<{ name: string; roles: Record<string, string> }>;
  activePreset: string | null;
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

/** Lifecycle state of an OpenSpec change, derived from artifacts + task status */
export enum ChangeState {
  PLANNING = "PLANNING",
  READY = "READY",
  IMPLEMENTING = "IMPLEMENTING",
  COMPLETE = "COMPLETE",
}

/** Derive the lifecycle state of an OpenSpec change from its data */
export function deriveChangeState(change: OpenSpecChange): ChangeState {
  const allDone = change.artifacts.length > 0 && change.artifacts.every((a) => a.status === "done");
  if (!allDone) return ChangeState.PLANNING;
  if (change.status === "complete") return ChangeState.COMPLETE;
  if (change.status === "in-progress") return ChangeState.IMPLEMENTING;
  return ChangeState.READY;
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

/** Data payload for bash_output dashboard events */
export interface BashOutputData {
  command: string;
  output: string;
  exitCode: number;
  /** true for !! (silent), false for ! (sent to LLM) */
  excludeFromContext: boolean;
}

/** Data payload for command_feedback dashboard events */
export interface CommandFeedbackData {
  command: string;
  status: "started" | "completed" | "error";
  message?: string;
}

// ── Flow Dashboard Types ────────────────────────────────────────────

/** Status of a flow agent card */
export type FlowAgentStatus = "pending" | "running" | "complete" | "error" | "blocked";

/** A recent tool call displayed on an agent card */
export interface FlowRecentTool {
  toolName: string;
  inputPreview: string;
}

/** Detail history entry for agent detail view */
export type FlowDetailEntry =
  | { kind: "tool"; toolName: string; input: unknown; output?: unknown; isError: boolean }
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "error"; text: string };

/** Agent card config from pi-flows AgentConfig (minimal subset) */
export interface FlowAgentCardConfig {
  name: string;
  description?: string;
  model?: string;
  card?: { label?: string; metric?: string; role?: string };
}

/** Per-agent state tracked in flow state */
export interface FlowAgentState {
  agentName: string;
  stepId: string;
  status: FlowAgentStatus;
  label?: string;
  model?: string;
  resolvedModel?: string;
  cardRole?: string;
  blockedBy: string[];
  tokens?: { input: number; output: number };
  duration?: number;
  summary?: string;
  files?: string[];
  recentTools: FlowRecentTool[];
  detailHistory: FlowDetailEntry[];
  loopIteration?: number;
  loopMax?: number;
}

/** Overall flow execution status */
export type FlowStatus = "running" | "success" | "error" | "aborted";

/** Flow execution state tracked client-side by the event reducer */
export interface FlowState {
  flowName: string;
  task: string;
  status: FlowStatus;
  autonomousMode: boolean;
  /** Path to the flow YAML file (for YAML viewer) */
  flowSource?: string;
  /** Ordered map — insertion order matches step order from flow config */
  agents: Map<string, FlowAgentState>;
  /** Set after flow_complete event */
  flowResult?: Record<string, unknown>;

  /** Next flow to run (workflow stage resolution) */
  nextStep?: string | null;
  /** Pre-computed summary stats */
  summaryStats?: {
    agentCount: number;
    duration: string;
    fileCount: number;
    perAgent: Array<{ name: string; status: string; fileCount: number }>;
  };
}

// ── Architect Dashboard Types ───────────────────────────────────────

/** Phase of the architect lifecycle */
export type ArchitectPhase = "context" | "designing" | "preview" | "complete" | "cancelled";

/** Agent entry tracked during architect design */
export interface ArchitectAgentEntry {
  name: string;
  type: "built-in" | "local" | "custom";
  status: "pending" | "creating" | "done" | "error";
  statusText?: string;
}

/** Step in the designed flow DAG */
export interface ArchitectDagStep {
  id: string;
  agentName?: string;
  blockedBy: string[];
}

/** Parsed flow metadata from architect preview */
export interface ArchitectParsedFlow {
  name: string;
  description: string;
  maxConcurrent: number;
  steps: ArchitectDagStep[];
}

/** Architect state tracked client-side by the architect reducer */
export interface ArchitectPrompt {
  id: string;
  type: "select" | "input" | "confirm";
  question: string;
  options?: string[];
  defaultValue?: string;
}

export interface ArchitectState {
  phase: ArchitectPhase;
  architectMode: "new" | "edit";
  flowName: string;
  agents: ArchitectAgentEntry[];
  dagSteps: ArchitectDagStep[];
  parsedFlows: ArchitectParsedFlow[];
  lastToolCall: { toolName: string; inputPreview: string } | null;
  /** Rolling window of recent tool calls for card display */
  recentTools: FlowRecentTool[];
  /** Full detail history (tool calls, text, thinking) for detail view */
  detailHistory: FlowDetailEntry[];
  iteration: number;
  catalogSummary?: string;
  error?: string;
  /** Pending architect prompt (Save/Replan/Cancel etc.) rendered in widget bar */
  pendingPrompt: ArchitectPrompt | null;
  /** Raw flow YAML content for the YAML viewer */
  flowYamlContent?: string;
}

/** REST API response envelope */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
