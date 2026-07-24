import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { ChatImage, SessionState } from "../../lib/event-reducer.js";

/** Context passed to every tool renderer */
export interface ToolContext {
  cwd?: string;
  /** Current session id — used by renderers that need to build session-scoped URLs (e.g. subagent popout). Optional for backward-compat. */
  sessionId?: string;
  /** Current session state — used by renderers that drill into per-session sub-state (e.g. subagent inspector). Optional. */
  session?: SessionState;
  /** Send a message to the server (e.g. subagent resync request). Optional for backward-compat / tests. See change: fix-subagent-live-detail-reliability. */
  send?: (message: BrowserToServerMessage) => void;
  /** Respond to a pending PromptBus request from a tool renderer. */
  onRespondToUi?: (requestId: string, result?: unknown, cancelled?: boolean) => void;
  /** Simple response callback used by interactive renderer integrations. */
  onRespond?: (result: unknown) => void;
}

/** Props every tool renderer receives */
export interface ToolRendererProps {
  toolName: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  status: "running" | "complete" | "error";
  /** Optional response callback for a renderer-owned interactive tool body. */
  onRespondToUi?: (requestId: string, result?: unknown, cancelled?: boolean) => void;
  /** Optional response callback matching interactive renderer semantics. */
  onRespond?: (result: unknown) => void;
  result?: string;
  images?: ChatImage[];
  context: ToolContext;
  /** Structured metadata from tool (e.g. AgentDetails from pi-subagents) */
  toolDetails?: Record<string, unknown>;
}

/** A tool renderer is a React component matching this signature */
export type ToolRenderer = React.ComponentType<ToolRendererProps>;
