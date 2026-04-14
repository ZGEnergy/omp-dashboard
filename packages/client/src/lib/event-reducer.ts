/**
 * Event reducer: builds session UI state from a stream of events.
 * (state, event) → new state
 */
import type { DashboardEvent, FlowState, ArchitectState } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { isFlowEvent, reduceFlowEvent } from "./flow-reducer.js";
import { isArchitectEvent, reduceArchitectEvent } from "./architect-reducer.js";

export interface ChatImage {
  data: string;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "toolResult" | "thinking" | "bashOutput" | "commandFeedback" | "interactiveUi" | "turnSeparator" | "rawEvent";
  content: string;
  images?: ChatImage[];
  toolName?: string;
  toolCallId?: string;
  isStreaming?: boolean;
  timestamp: number;
  args?: Record<string, unknown>;
  result?: string;
  toolStatus?: "running" | "complete" | "error";
  /** Epoch ms when the block started (for live elapsed counter) */
  startedAt?: number;
  /** Duration in ms (set when complete) */
  duration?: number;
  /** Turn index for scroll-to-turn navigation */
  turnIndex?: number;
  /** Structured metadata from tool (e.g. AgentDetails from pi-subagents) */
  toolDetails?: Record<string, unknown>;
  /** Session entry ID (for fork-from-message) */
  entryId?: string;
}

export interface ToolCallState {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  status: "running" | "complete" | "error";
  result?: string;
}

export interface TurnStat {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Index into user messages for click-to-scroll (-1 if no user message for this turn) */
  turnIndex: number;
}

const MAX_TURN_STATS = 50;

export interface PendingPrompt {
  text: string;
  images?: ChatImage[];
}

export interface InteractiveUiRequest {
  requestId: string;
  method: string;
  params: Record<string, unknown>;
  status: "pending" | "resolved" | "cancelled" | "dismissed";
  result?: unknown;
}

export interface SubagentState {
  id: string;
  type: string;
  description: string;
  status: "created" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
  durationMs?: number;
  tokens?: { input: number; output: number; total: number };
  toolUses?: number;
}

export interface SessionState {
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallState>;
  streamingText: string;
  streamingThinking: string;
  /** Epoch ms when current thinking block started (for live counter) */
  thinkingStartedAt?: number;
  isStreaming: boolean;
  model?: string;
  thinkingLevel?: string;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  currentTool?: string;
  status: "idle" | "streaming" | "ended";
  turnStats: TurnStat[];
  contextUsage?: { tokens: number | null; contextWindow: number };
  pendingPrompt?: PendingPrompt;
  interactiveRequests: InteractiveUiRequest[];
  flowState: FlowState | null;
  /** All flow states seen during execution (main + subflows), keyed by flowName */
  flowStates: Map<string, FlowState>;
  architectState: ArchitectState | null;
  /** Whether any Write/Edit tool calls have been seen (for Changed Files button) */
  hasFileChanges: boolean;
  /** Active subagents from @tintinweb/pi-subagents */
  subagents: Map<string, SubagentState>;
  /** Total turn count (for turnIndex assignment and sliding window offset) */
  turnCount: number;
  /** Last LLM provider error (set from agent_end, cleared on agent_start or dismiss) */
  lastError?: { message: string; timestamp: number };
}

export function createInitialState(): SessionState {
  return {
    messages: [],
    toolCalls: new Map(),
    streamingText: "",
    streamingThinking: "",
    isStreaming: false,
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    status: "idle",
    turnStats: [],
    interactiveRequests: [],
    flowState: null,
    flowStates: new Map(),
    architectState: null,
    hasFileChanges: false,
    subagents: new Map(),
    turnCount: 0,
  };
}



/** Extract text from content blocks: [{ type: "text", text: "..." }, ...] */
function extractContentBlockText(blocks: unknown[]): string | null {
  const texts = blocks
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text);
  return texts.length > 0 ? texts.join("\n") : null;
}

/**
 * Extract image attachments from tool_execution_end event data.
 * Handles two sources:
 * - Live events: data.result is {content: [{type:"image", data, mimeType}, ...]}
 * - Replayed events: data.images is already extracted by state-replay
 */
function extractToolResultImages(data: Record<string, unknown>): ChatImage[] | undefined {
  // Check pre-extracted images (from state-replay)
  if (Array.isArray(data.images) && data.images.length > 0) {
    return data.images
      .filter((img: any) => img?.data && img?.mimeType)
      .map((img: any) => ({ data: img.data as string, mimeType: img.mimeType as string }));
  }
  // Check live event: result.content array with image blocks
  const result = data.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const content = (result as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      const imageBlocks = content.filter(
        (c: any) => c?.type === "image" && c?.data && c?.mimeType,
      );
      if (imageBlocks.length > 0) {
        return imageBlocks.map((c: any) => ({ data: c.data as string, mimeType: c.mimeType as string }));
      }
    }
  }
  return undefined;
}

/** Convert an unknown value to a display string (handles objects/arrays). */
export function toDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    // Handle content-block arrays: [{ type: "text", text: "..." }, ...]
    if (Array.isArray(value)) {
      return extractContentBlockText(value) ?? JSON.stringify(value, null, 2);
    }
    // Handle wrapper object: { content: [{ type: "text", text: "..." }] }
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      return extractContentBlockText(obj.content) ?? JSON.stringify(value, null, 2);
    }
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

export function truncateLines(text: string | unknown, maxLines: number): string {
  const str = toDisplayString(text);
  const lines = str.split("\n");
  if (lines.length <= maxLines) return str;
  return lines.slice(0, maxLines).join("\n");
}

/** Add a new interactive UI request to session state */
export function addInteractiveRequest(
  state: SessionState,
  requestId: string,
  method: string,
  params: Record<string, unknown>,
): SessionState {
  // Architect suppression logic REMOVED — the PromptBus now ensures each prompt
  // is sent to the dashboard exactly once, with the correct component.
  // No more client-side guessing about which prompts to suppress.

  // Deduplicate by requestId (re-sent on reconnect) or by content
  // (recursive proxy generates multiple requestIds for the same dialog)
  if (state.interactiveRequests.some((r) =>
    r.requestId === requestId ||
    (r.status === "pending" && r.method === method && r.params.title === params.title),
  )) {
    return state;
  }
  const request: InteractiveUiRequest = { requestId, method, params, status: "pending" };
  return {
    ...state,
    interactiveRequests: [...state.interactiveRequests, request],
    messages: [
      ...state.messages,
      {
        id: `ui-${requestId}`,
        role: "interactiveUi",
        content: method,
        timestamp: Date.now(),
        args: { requestId, method, params, status: "pending" } as any,
      },
    ],
  };
}

/** Resolve an interactive UI request in session state */
export function resolveInteractiveRequest(
  state: SessionState,
  requestId: string,
  result?: unknown,
  cancelled?: boolean,
): SessionState {
  const newStatus = cancelled ? "cancelled" as const : "resolved" as const;
  return {
    ...state,
    interactiveRequests: state.interactiveRequests.map((req) =>
      req.requestId === requestId
        ? { ...req, status: newStatus, result }
        : req,
    ),
    messages: state.messages.map((msg) =>
      msg.id === `ui-${requestId}`
        ? { ...msg, args: { ...msg.args as any, status: newStatus, result } }
        : msg,
    ),
  };
}

/** Dismiss an interactive UI request (answered in TUI, not via dashboard) */
export function dismissInteractiveRequest(
  state: SessionState,
  requestId: string,
): SessionState {
  // Only dismiss pending requests
  const existing = state.interactiveRequests.find((r) => r.requestId === requestId);
  if (!existing || existing.status !== "pending") return state;

  return {
    ...state,
    interactiveRequests: state.interactiveRequests.map((req) =>
      req.requestId === requestId
        ? { ...req, status: "dismissed" as const }
        : req,
    ),
    messages: state.messages.map((msg) =>
      msg.id === `ui-${requestId}`
        ? { ...msg, args: { ...msg.args as any, status: "dismissed" } }
        : msg,
    ),
  };
}

/** Extract error info from agent_end event's messages array. */
export function extractAgentEndError(data: Record<string, unknown>): string | undefined {
  const messages = data.messages;
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  const last = messages[messages.length - 1] as Record<string, unknown> | undefined;
  if (!last || last.stopReason !== "error") return undefined;
  return (last.errorMessage as string) || "An unknown error occurred";
}

export function reduceEvent(state: SessionState, event: DashboardEvent): SessionState {
  const next = { ...state, toolCalls: new Map(state.toolCalls) };
  const data = event.data;

  switch (event.eventType) {
    case "agent_start":
      next.isStreaming = true;
      next.status = "streaming";
      next.streamingText = "";
      next.pendingPrompt = undefined;
      next.lastError = undefined;
      break;

    case "agent_end": {
      next.isStreaming = false;
      next.status = "idle";
      next.streamingText = "";
      next.currentTool = undefined;
      next.pendingPrompt = undefined;
      const errorMsg = extractAgentEndError(data);
      if (errorMsg) {
        next.lastError = { message: errorMsg, timestamp: event.timestamp };
      }
      break;
    }

    case "message_start": {
      const msg = data.message as any;
      if (msg?.role === "user") {
        next.pendingPrompt = undefined;
        let text = "";
        let images: ChatImage[] | undefined;
        if (Array.isArray(msg.content)) {
          text = msg.content
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("");
          const imgBlocks = msg.content.filter(
            (c: any) => c.type === "image" && c.data && c.mimeType,
          );
          if (imgBlocks.length > 0) {
            images = imgBlocks.map((c: any) => ({
              data: c.data,
              mimeType: c.mimeType,
            }));
          }
        } else {
          text = String(msg.content ?? "");
        }
        next.messages = [
          ...next.messages,
          {
            id: `msg-${next.messages.length}`,
            role: "user",
            content: text,
            images,
            timestamp: event.timestamp,
            entryId: data.entryId as string | undefined,
          },
        ];
      }
      break;
    }

    case "message_update": {
      const assistantEvent = data.assistantMessageEvent as any;

      // Handle thinking events from assistantMessageEvent
      if (assistantEvent) {
        if (assistantEvent.type === "thinking_start") {
          next.streamingThinking = "";
          next.thinkingStartedAt = event.timestamp;
          break;
        }
        if (assistantEvent.type === "thinking_delta") {
          next.streamingThinking = next.streamingThinking + (assistantEvent.delta ?? "");
          break;
        }
        if (assistantEvent.type === "thinking_end") {
          if (next.streamingThinking) {
            const startedAt = next.thinkingStartedAt;
            next.messages = [
              ...next.messages,
              {
                id: `thinking-${next.messages.length}`,
                role: "thinking",
                content: next.streamingThinking,
                timestamp: event.timestamp,
                startedAt,
                duration: startedAt ? event.timestamp - startedAt : undefined,
              },
            ];
          }
          next.streamingThinking = "";
          next.thinkingStartedAt = undefined;
          break;
        }
      }

      // Handle text streaming
      const msg = data.message as any;
      if (msg?.role === "assistant") {
        const text = Array.isArray(msg.content)
          ? msg.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("")
          : String(msg.content ?? "");
        next.streamingText = text;
      }
      break;
    }

    case "message_end": {
      const msg = data.message as any;
      if (msg?.role === "assistant") {
        if (next.streamingText) {
          next.messages = [
            ...next.messages,
            {
              id: `msg-${next.messages.length}`,
              role: "assistant",
              content: next.streamingText,
              timestamp: event.timestamp,
              entryId: data.entryId as string | undefined,
            },
          ];
          next.streamingText = "";
        } else {
          // Tool-only assistant turn (no prose) — add a thin separator
          // so consecutive tool call groups don't blend together
          const lastMsg = next.messages[next.messages.length - 1];
          if (lastMsg?.role === "toolResult") {
            next.messages = [
              ...next.messages,
              {
                id: `sep-${next.messages.length}`,
                role: "turnSeparator",
                content: "",
                timestamp: event.timestamp,
              },
            ];
          }
        }
      }
      break;
    }

    case "tool_execution_start": {
      const toolCallId = data.toolCallId as string;
      const toolName = data.toolName as string;
      const args = data.args as Record<string, unknown> | undefined;
      next.toolCalls.set(toolCallId, {
        toolCallId,
        toolName,
        args,
        status: "running",
      });
      next.currentTool = toolName;

      // Track file-modifying tools
      const toolLower = toolName.toLowerCase();
      if (toolLower === "write" || toolLower === "edit") {
        next.hasFileChanges = true;
      }

      // Add tool message immediately (visible while running)
      next.messages = [
        ...next.messages,
        {
          id: `tool-${toolCallId}`,
          role: "toolResult",
          content: toolName,
          toolName,
          toolCallId,
          args,
          toolStatus: "running",
          timestamp: event.timestamp,
          startedAt: event.timestamp,
        },
      ];
      break;
    }

    case "tool_execution_update": {
      const toolCallId = data.toolCallId as string;
      const partialResult = data.partialResult;
      if (partialResult) {
        const idx = next.messages.findLastIndex((m) => m.toolCallId === toolCallId);
        if (idx !== -1) {
          next.messages = [...next.messages];
          // Structured partialResult (e.g. Agent tool sends { content, details })
          if (typeof partialResult === "object" && partialResult !== null) {
            const structured = partialResult as Record<string, unknown>;
            const details = structured.details as Record<string, unknown> | undefined;
            // Extract text from content array or stringify
            let text: string | undefined;
            const content = structured.content;
            if (Array.isArray(content) && content.length > 0 && content[0]?.text) {
              text = content[0].text as string;
            } else if (content != null) {
              text = String(content);
            }
            next.messages[idx] = {
              ...next.messages[idx],
              ...(text != null ? { result: truncateLines(text, 30) } : {}),
              ...(details ? { toolDetails: details } : {}),
            };
          } else {
            // Plain string partialResult (standard tools)
            next.messages[idx] = {
              ...next.messages[idx],
              result: truncateLines(partialResult as string, 30),
            };
          }
        }
      }
      break;
    }

    case "tool_execution_end": {
      const toolCallId = data.toolCallId as string;
      const existing = next.toolCalls.get(toolCallId);
      if (existing) {
        next.toolCalls.set(toolCallId, {
          ...existing,
          status: (data.isError as boolean) ? "error" : "complete",
        });
      }
      next.currentTool = undefined;

      // Extract images from tool result (live events have result.content, replayed have data.images)
      const images = extractToolResultImages(data);

      // Update existing tool message in-place
      const idx = next.messages.findLastIndex((m) => m.toolCallId === toolCallId);
      if (idx !== -1) {
        const result = data.result as string | undefined;
        const msgStartedAt = next.messages[idx].startedAt;
        next.messages = [...next.messages];
        // Extract tool details (e.g. AgentDetails from replayed sessions)
        const endDetails = data.details as Record<string, unknown> | undefined;
        // For live events (no endDetails), update existing toolDetails.status
        // so renderers (e.g. AgentToolRenderer) see the final status
        const isError = data.isError as boolean;
        let mergedDetails: Record<string, unknown> | undefined;
        if (endDetails) {
          mergedDetails = endDetails;
        } else if (next.messages[idx].toolDetails) {
          mergedDetails = {
            ...next.messages[idx].toolDetails,
            status: isError ? "error" : "completed",
          };
        }
        next.messages[idx] = {
          ...next.messages[idx],
          toolStatus: isError ? "error" : "complete",
          result: result ? truncateLines(result, 30) : next.messages[idx].result,
          duration: msgStartedAt ? event.timestamp - msgStartedAt : undefined,
          ...(images ? { images } : {}),
          ...(mergedDetails ? { toolDetails: mergedDetails } : {}),
        };
      }
      break;
    }

    case "turn_end":
      break;

    case "stats_update": {
      // Accumulate stats from stats_update events
      if (data.tokensIn) next.tokensIn += data.tokensIn as number;
      if (data.tokensOut) next.tokensOut += data.tokensOut as number;
      if (data.cost) next.cost += data.cost as number;

      // Extract per-turn usage and accumulate cache stats
      const turnUsage = data.turnUsage as Record<string, number> | undefined;
      if (turnUsage) {
        // Assign turnIndex to the last user message for scroll-to-turn navigation
        const lastUserIdx = next.messages.findLastIndex((m) => m.role === "user");
        let assignedTurnIndex = -1;
        if (lastUserIdx !== -1 && next.messages[lastUserIdx].turnIndex === undefined) {
          assignedTurnIndex = next.turnCount;
          next.messages = [...next.messages];
          next.messages[lastUserIdx] = { ...next.messages[lastUserIdx], turnIndex: next.turnCount };
          next.turnCount += 1;
        }

        const turnStat: TurnStat = {
          input: turnUsage.input ?? 0,
          output: turnUsage.output ?? 0,
          cacheRead: turnUsage.cacheRead ?? 0,
          cacheWrite: turnUsage.cacheWrite ?? 0,
          turnIndex: assignedTurnIndex,
        };
        next.turnStats = [...next.turnStats, turnStat].slice(-MAX_TURN_STATS);
        next.cacheRead += turnStat.cacheRead;
        next.cacheWrite += turnStat.cacheWrite;
      }

      // Extract context usage
      const ctxUsage = data.contextUsage as { tokens: number | null; contextWindow: number } | undefined;
      if (ctxUsage) {
        next.contextUsage = ctxUsage;
      }
      break;
    }

    case "model_select": {
      const model = data.model as any;
      if (model) {
        next.model = `${model.provider}/${model.id}`;
      }
      const thinkingLevel = data.thinkingLevel as string | undefined;
      if (thinkingLevel !== undefined) {
        next.thinkingLevel = thinkingLevel;
      }
      break;
    }

    case "session_compact": {
      next.messages = [
        ...next.messages,
        {
          id: `compact-${next.messages.length}`,
          role: "assistant",
          content: "── Session compacted ──",
          timestamp: event.timestamp,
        },
      ];
      break;
    }

    case "bash_output": {
      const command = data.command as string;
      const output = data.output as string;
      const exitCode = data.exitCode as number;
      const excludeFromContext = data.excludeFromContext as boolean;
      next.pendingPrompt = undefined;
      next.messages = [
        ...next.messages,
        {
          id: `bash-${next.messages.length}`,
          role: "bashOutput" as any,
          content: output,
          timestamp: event.timestamp,
          args: { command, exitCode, excludeFromContext } as any,
        },
      ];
      break;
    }

    case "command_feedback": {
      const command = data.command as string;
      const status = data.status as string;
      const message = data.message as string | undefined;
      next.pendingPrompt = undefined;
      next.messages = [
        ...next.messages,
        {
          id: `cmdfb-${next.messages.length}`,
          role: "commandFeedback" as any,
          content: message ?? "",
          timestamp: event.timestamp,
          args: { command, status } as any,
        },
      ];
      break;
    }

    case "subagent_created": {
      const id = data.id as string;
      next.subagents = new Map(next.subagents);
      next.subagents.set(id, {
        id,
        type: data.type as string ?? "unknown",
        description: data.description as string ?? "",
        status: "created",
      });
      break;
    }

    case "subagent_started": {
      const id = data.id as string;
      next.subagents = new Map(next.subagents);
      const existing = next.subagents.get(id);
      next.subagents.set(id, {
        ...(existing ?? { id, type: data.type as string ?? "unknown", description: data.description as string ?? "" }),
        status: "running",
      });
      break;
    }

    case "subagent_completed":
    case "subagent_failed": {
      const id = data.id as string;
      next.subagents = new Map(next.subagents);
      const existing = next.subagents.get(id);
      next.subagents.set(id, {
        ...(existing ?? { id, type: data.type as string ?? "unknown", description: data.description as string ?? "" }),
        status: event.eventType === "subagent_completed" ? "completed" : "failed",
        result: data.result as string | undefined,
        error: data.error as string | undefined,
        durationMs: data.durationMs as number | undefined,
        tokens: data.tokens as SubagentState["tokens"],
        toolUses: data.toolUses as number | undefined,
      });
      break;
    }

    default: {
      // Delegate flow events to flow reducer
      if (isFlowEvent(event.eventType)) {
        next.flowState = reduceFlowEvent(next.flowState, event);
        // Keep flowStates map in sync — store each flow by name
        if (next.flowState) {
          next.flowStates = new Map(next.flowStates);
          next.flowStates.set(next.flowState.flowName, next.flowState);
        } else if (event.eventType === "flow_summary_dismissed") {
          next.flowStates = new Map();
        }
      } else {
        // Unknown event type — render as expandable raw JSON
        next.messages = [...next.messages, {
          id: `raw-${event.eventType}-${event.timestamp}-${next.messages.length}`,
          role: "rawEvent" as const,
          content: JSON.stringify(event.data, null, 2),
          timestamp: event.timestamp,
          toolName: event.eventType,
        }];
      }
      // Delegate architect events to architect reducer
      if (isArchitectEvent(event.eventType)) {
        next.architectState = reduceArchitectEvent(next.architectState, event);
      }
      break;
    }
  }

  return next;
}
