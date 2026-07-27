import type { SeqEvent } from "./event-window.js";
import type { DashboardEvent } from "./types.js";

/**
 * Per-logical-call retention at the `sliced` rung. Tail-weighted: tool output
 * is usually more informative at the end (the result) than at the start (the
 * echoed invocation). 20 KB total matches issue #101.
 */
export const TOOL_STUB_HEAD_BYTES = 8 * 1024;
export const TOOL_STUB_TAIL_BYTES = 12 * 1024;

/** Bound on a rendered `argsSummary`. */
const ARGS_SUMMARY_MAX = 200;

/**
 * Self-describing replacement for a tool payload the projection would not send.
 * Rendering a stub never requires a sibling event. Produced by BOTH server
 * hydration and client eviction, and re-inflated through one fetch path keyed
 * by `toolCallId`. See change: hydration-tool-stub-projection.
 */
export interface ToolCallStub {
  toolCallId: string;
  toolName: string;
  /** Bounded rendering of the call, e.g. `Read("src/a.ts")`. */
  argsSummary: string;
  status: "running" | "ok" | "error";
  startedAt: number;
  durationMs?: number;
  /** Size of the payload NOT sent — lets the UI say "2.3 MB not loaded" honestly. */
  fullBytes: number;
  head?: string;
  tail?: string;
  detailLevel: "sliced" | "metadata";
}

/**
 * An event blanked by the projection: its `seq` and `eventType` survive so the
 * range stays contiguous and nothing moves, but its payload is gone.
 *
 * Blanking (not removal) is load-bearing. `SessionReplayLedger.acceptForward`
 * accepts only `cursor + 1`, and `snapshotContiguousAscending` rejects any
 * source with a seq gap. A projection that removed events would reset the
 * client ledger on `gap_overflow`.
 */
export function isBlanked(event: DashboardEvent): boolean {
  const data = event.data as Record<string, unknown> | undefined;
  return !!data && typeof data === "object" && Object.keys(data).length === 0;
}

function blank(entry: SeqEvent<DashboardEvent>): SeqEvent<DashboardEvent> {
  return {
    seq: entry.seq,
    event: {
      eventType: entry.event.eventType,
      timestamp: entry.event.timestamp,
      data: {},
    } as unknown as DashboardEvent,
  };
}

function isAssistantTextUpdate(event: DashboardEvent): boolean {
  if (event.eventType !== "message_update") return false;
  const data = event.data as Record<string, unknown> | undefined;
  // A thinking delta is not a text snapshot — it carries incremental semantics
  // the reducer needs, so it is never treated as a run member.
  const assistantEvent = (data as { assistantMessageEvent?: { type?: unknown } } | undefined)?.assistantMessageEvent;
  if (typeof assistantEvent?.type === "string" && assistantEvent.type.startsWith("thinking_")) return false;
  const message = (data as { message?: { role?: unknown } } | undefined)?.message;
  return message?.role === "assistant";
}

/**
 * An assistant snapshot whose content is ONLY tool calls (plus empty thinking
 * parts) — no text. The bridge emits a full assistant snapshot for every
 * streamed delta, so during a tool-heavy turn these shells duplicate large tool
 * arguments and consume the tail window before real messages do.
 *
 * Blanking them is order-safe by construction: they carry no text, so the
 * reducer's `streamingText` is unaffected, and their `toolCall` parts are
 * redundant with the `tool_execution_*` events that already carry the call.
 */
function isToolOnlyAssistantMessage(event: DashboardEvent): boolean {
  const message = (event.data as { message?: { role?: unknown; content?: unknown } } | undefined)?.message;
  const content = message?.content;
  if (message?.role !== "assistant" || !Array.isArray(content)) return false;
  return (
    content.some((part: { type?: unknown }) => part?.type === "toolCall") &&
    content.every((part: { type?: unknown; thinking?: unknown; text?: unknown }) => {
      if (part?.type === "toolCall") return true;
      if (part?.type !== "thinking") return false;
      return !part.thinking && !part.text;
    })
  );
}

function toolCallIdOf(event: DashboardEvent): string | undefined {
  const id = (event.data as Record<string, unknown> | undefined)?.toolCallId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/**
 * Order-preserving coalescing over a contiguous ascending range.
 *
 * Two rules, both blank-in-place:
 *  1. `message_update` — collapse each CONSECUTIVE run of assistant text
 *     updates to its last member. Any non-update event splits the run, so text
 *     written before a tool call survives at its own seq and stays before the
 *     tool row. `message_update` carries CUMULATIVE content, so a reply
 *     streamed over N updates costs O(N x length); this is the dominant win.
 *  2. `tool_execution_update` — blank superseded progress updates. A call that
 *     terminated inside the range has all of its progress updates blanked (the
 *     end event carries the final result); a still-running call keeps its
 *     newest update, which is all the UI has to show.
 *
 * The `tool_execution_start` and `tool_execution_end` events always survive, so
 * a coalesced tool call stays anchored at its start seq — where the reducer
 * creates the tool row. Everything else passes through untouched. Output seqs
 * equal input seqs. Pure: the input array and its events are never mutated.
 */
export function coalesceProjection(events: readonly SeqEvent<DashboardEvent>[]): SeqEvent<DashboardEvent>[] {
  const out = events.slice();
  let runLast: number | null = null;
  const lastToolUpdate = new Map<string, number>();
  const terminated = new Set<string>();

  for (let index = 0; index < out.length; index += 1) {
    const entry = out[index]!;
    // Rule 3, checked first: a tool-only assistant shell has no text to
    // preserve, so it is blanked outright rather than joining a run. Applies to
    // `message_end` too — its canonical content is the tool events themselves.
    if (
      (entry.event.eventType === "message_update" || entry.event.eventType === "message_end") &&
      isToolOnlyAssistantMessage(entry.event)
    ) {
      out[index] = blank(entry);
      continue;
    }
    if (isAssistantTextUpdate(entry.event)) {
      if (runLast !== null) out[runLast] = blank(out[runLast]!);
      runLast = index;
      continue;
    }
    // Any non-update event closes the current run: its last member stays live.
    runLast = null;

    const toolCallId = toolCallIdOf(entry.event);
    if (!toolCallId) continue;
    if (entry.event.eventType === "tool_execution_update") {
      const previous = lastToolUpdate.get(toolCallId);
      if (previous !== undefined) out[previous] = blank(out[previous]!);
      lastToolUpdate.set(toolCallId, index);
    } else if (entry.event.eventType === "tool_execution_end") {
      terminated.add(toolCallId);
    }
  }

  // A terminated call's final progress update is superseded by its end event.
  // A still-running call keeps its newest update — blanking it would leave the
  // row with no output at all.
  for (const [toolCallId, index] of lastToolUpdate) {
    if (terminated.has(toolCallId)) out[index] = blank(out[index]!);
  }
  return out;
}

/** Bounded rendering of a tool invocation. Never throws on hostile args. */
export function summarizeArgs(toolName: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return `${toolName}()`;
  let rendered: string;
  try {
    const primary = args.path ?? args.file_path ?? args.command ?? args.pattern ?? args.query;
    rendered = primary !== undefined ? JSON.stringify(primary) : JSON.stringify(args);
    if (rendered === undefined) rendered = "…";
  } catch {
    rendered = "…";
  }
  const full = `${toolName}(${rendered})`;
  return full.length <= ARGS_SUMMARY_MAX ? full : `${full.slice(0, ARGS_SUMMARY_MAX - 1)}…`;
}

export function makeToolStub(input: {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result: string;
  status: ToolCallStub["status"];
  startedAt: number;
  durationMs?: number;
  detailLevel: ToolCallStub["detailLevel"];
}): ToolCallStub {
  const stub: ToolCallStub = {
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    argsSummary: summarizeArgs(input.toolName, input.args),
    status: input.status,
    startedAt: input.startedAt,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    fullBytes: input.result.length,
    detailLevel: input.detailLevel,
  };
  if (input.detailLevel === "metadata") return stub;
  if (input.result.length <= TOOL_STUB_HEAD_BYTES + TOOL_STUB_TAIL_BYTES) {
    stub.head = input.result;
    return stub;
  }
  stub.head = input.result.slice(0, TOOL_STUB_HEAD_BYTES);
  stub.tail = input.result.slice(input.result.length - TOOL_STUB_TAIL_BYTES);
  return stub;
}

/**
 * Replace a `tool_execution_end` payload with its stub. The eventType and seq
 * are untouched, so the reducer still finalizes the tool row at exactly the
 * position it would have without the projection.
 */
export function stubbedToolEndEvent(event: DashboardEvent, stub: ToolCallStub): DashboardEvent {
  const { result: _dropped, ...rest } = (event.data ?? {}) as Record<string, unknown>;
  return { ...event, data: { ...rest, toolStub: stub } } as unknown as DashboardEvent;
}
