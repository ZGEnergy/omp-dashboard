import type { SeqEvent } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

/**
 * Synthetic session corpus for the replay-projection order-invariant property
 * test. Each scenario isolates one way a projection can scramble transcript
 * order — the failure class that took down PR #102.
 * See change: hydration-tool-stub-projection.
 */
export type SessionScenario =
  | "text-before-tool"
  | "text-between-tools"
  | "text-after-tool"
  | "multi-tool-turn"
  | "no-message-end"
  | "thinking-blocks"
  | "subagent-burst"
  | "aborted-turn"
  | "tool-only-shell"
  | "overlapping-calls"
  | "running-call"
  | "end-without-start"
  | "many-progress-updates";

/** Deterministic PRNG — `Date.now()`/`Math.random()` would make fixtures irreproducible. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

interface Builder {
  events: SeqEvent<DashboardEvent>[];
  seq: number;
  ts: number;
}

function push(b: Builder, eventType: string, data: Record<string, unknown>): void {
  b.seq += 1;
  b.ts += 10;
  b.events.push({ seq: b.seq, event: { eventType, timestamp: b.ts, data } as unknown as DashboardEvent });
}

/** Assistant `message_update` carries CUMULATIVE content — this mirrors the bridge. */
function streamText(b: Builder, messageId: string, chunks: string[]): string {
  let acc = "";
  for (const chunk of chunks) {
    acc += chunk;
    push(b, "message_update", {
      message: { id: messageId, role: "assistant", content: [{ type: "text", text: acc }] },
    });
  }
  return acc;
}

function toolCall(b: Builder, toolCallId: string, toolName: string, resultBytes: number, updates = 1): void {
  push(b, "tool_execution_start", { toolCallId, toolName, args: { path: `src/${toolCallId}.ts` } });
  for (let i = 0; i < updates; i += 1) {
    push(b, "tool_execution_update", { toolCallId, partialResult: "x".repeat(Math.floor(resultBytes / 4)) });
  }
  push(b, "tool_execution_end", { toolCallId, toolName, result: "x".repeat(resultBytes), isError: false });
}

function userTurn(b: Builder, text: string): void {
  push(b, "message_start", { role: "user", message: { role: "user", content: [{ type: "text", text }] } });
  push(b, "message_end", { message: { role: "user", content: [{ type: "text", text }] } });
}

export function generateSession(scenario: SessionScenario, seed: number): SeqEvent<DashboardEvent>[] {
  const rand = rng(seed);
  const b: Builder = { events: [], seq: 0, ts: 1_700_000_000_000 };
  const size = () => 200 + Math.floor(rand() * 4000);

  userTurn(b, `prompt for ${scenario}`);
  push(b, "message_start", { role: "assistant", message: { id: "m1", role: "assistant", content: [] } });

  switch (scenario) {
    case "text-before-tool": {
      const text = streamText(b, "m1", ["Let me ", "read the ", "file."]);
      toolCall(b, "t1", "Read", size());
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "text-between-tools": {
      streamText(b, "m1", ["First ", "I check A."]);
      toolCall(b, "t1", "Read", size());
      const text = streamText(b, "m1", ["First I check A.", " Now B."]);
      toolCall(b, "t2", "Read", size());
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "text-after-tool": {
      toolCall(b, "t1", "Read", size());
      const text = streamText(b, "m1", ["Done. ", "Here is why."]);
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "multi-tool-turn": {
      const text = streamText(b, "m1", ["Checking ", "three files."]);
      toolCall(b, "t1", "Read", size());
      toolCall(b, "t2", "Read", size());
      toolCall(b, "t3", "Grep", size());
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "no-message-end": {
      streamText(b, "m1", ["Still ", "streaming"]);
      toolCall(b, "t1", "Read", size());
      break;
    }
    case "thinking-blocks": {
      push(b, "thinking_start", {});
      push(b, "message_update", {
        message: { id: "m1", role: "assistant", content: [] },
        assistantMessageEvent: { type: "thinking_delta", text: "hmm" },
      });
      push(b, "thinking_end", {});
      const text = streamText(b, "m1", ["Right, ", "reading."]);
      toolCall(b, "t1", "Read", size());
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "subagent-burst": {
      const text = streamText(b, "m1", ["Dispatching."]);
      for (let i = 0; i < 12; i += 1) toolCall(b, `sub${i}`, "Agent", 20_000);
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    case "aborted-turn": {
      streamText(b, "m1", ["Starting"]);
      toolCall(b, "t1", "Read", size());
      push(b, "agent_end", { aborted: true });
      break;
    }
    // The bridge emits a full assistant snapshot per streamed delta. During a
    // tool-heavy turn those shells carry only `toolCall` parts and duplicate
    // large tool args — the case coalescing Rule 3 blanks.
    case "tool-only-shell": {
      push(b, "message_update", {
        message: { id: "m1", role: "assistant", content: [{ type: "toolCall", toolCallId: "t1", args: { body: "y".repeat(2000) } }] },
      });
      toolCall(b, "t1", "Read", size());
      push(b, "message_end", {
        message: { id: "m1", role: "assistant", content: [{ type: "toolCall", toolCallId: "t1" }] },
      });
      break;
    }
    // Two calls in flight at once, ending in the opposite order they started —
    // anchor order (start seq) and end order differ.
    case "overlapping-calls": {
      const text = streamText(b, "m1", ["Two at once."]);
      push(b, "tool_execution_start", { toolCallId: "a", toolName: "Read", args: { path: "a.ts" } });
      push(b, "tool_execution_start", { toolCallId: "bb", toolName: "Read", args: { path: "b.ts" } });
      push(b, "tool_execution_end", { toolCallId: "bb", toolName: "Read", result: "x".repeat(size()) });
      push(b, "tool_execution_end", { toolCallId: "a", toolName: "Read", result: "x".repeat(size()) });
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    // A call with no terminal event in range — must never be degraded.
    case "running-call": {
      streamText(b, "m1", ["Running a long one."]);
      push(b, "tool_execution_start", { toolCallId: "live", toolName: "Bash", args: { command: "sleep 60" } });
      push(b, "tool_execution_update", { toolCallId: "live", partialResult: "partial output" });
      break;
    }
    // A terminal event whose start seq fell below the page boundary — routine
    // during older paging.
    case "end-without-start": {
      push(b, "tool_execution_end", { toolCallId: "orphan", toolName: "Read", result: "x".repeat(size()) });
      const text = streamText(b, "m1", ["Continuing after an orphan end."]);
      toolCall(b, "t1", "Read", size());
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
    // Many progress updates per call, so Rule 2 (blank superseded progress) is
    // actually exercised rather than vacuous.
    case "many-progress-updates": {
      const text = streamText(b, "m1", ["Streaming a long tool."]);
      toolCall(b, "t1", "Bash", size(), 8);
      toolCall(b, "t2", "Bash", size(), 5);
      push(b, "message_end", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
      break;
    }
  }
  return b.events;
}

/** Every scenario — the default corpus for the property test. */
export const ALL_SCENARIOS: SessionScenario[] = [
  "text-before-tool",
  "text-between-tools",
  "text-after-tool",
  "multi-tool-turn",
  "no-message-end",
  "thinking-blocks",
  "subagent-burst",
  "aborted-turn",
  "tool-only-shell",
  "overlapping-calls",
  "running-call",
  "end-without-start",
  "many-progress-updates",
];
