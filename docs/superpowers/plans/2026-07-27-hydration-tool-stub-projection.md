# Hydration Tool-Stub Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound tool-burst payloads during session hydration so a tool-heavy session always hydrates with a readable chat floor, with oversized tool payloads degraded to re-fetchable stubs.

**Architecture:** A server-side, stateless projection runs over the contiguous ascending event range before byte-windowing. It **blanks superseded events in place** (never removes them) and replaces oversized tool payloads with a self-describing `ToolCallStub`. The client's memory eviction walks the same degradation ladder using the same stub shape, and both re-inflate through one `fetch_tool_payload` protocol keyed by `toolCallId`. Live streaming does not pass through the projection.

**Tech Stack:** TypeScript (strict), Node 22, vitest, React 19, npm workspaces (`packages/shared`, `packages/server`, `packages/client`).

## Global Constraints

- **THE ORDERING INVARIANT (load-bearing — this is exactly what PR #102 violated):** projection may REDUCE events but may never MOVE them. Every surviving event keeps its original `seq`, and no surviving event's content may depend on an event with a higher `seq`.
- **Projection blanks in place; it never removes an event from the range.** `SessionReplayLedger.acceptForward` (`packages/client/src/lib/session-replay-ledger.ts:274`) accepts only `cursor + 1` and buffers everything else as a gap, resetting on `gap_overflow`. `snapshotContiguousAscending` (`packages/shared/src/event-window.ts:80-99`) returns `null` for any source where `seq !== previousSeq + 1`. A projection that drops events breaks both. "Reduce" means reduce BYTES at a fixed seq set.
- A coalesced tool call anchors at its `tool_execution_start` seq, not its end seq. That is where the reducer creates the tool row (`packages/client/src/lib/event-reducer.ts:1883`), so the row does not move.
- A coalesced `message_update` run anchors at the LAST update in the run, and **any non-update event splits the run**. This is what preserves text-before-tool ordering.
- Fetched tool payloads must NOT enter the ledger. They live in a separate short-lived LRU keyed by `toolCallId`.
- Node: all commands must be prefixed `PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH`. System node is v20.20.0; `package.json` requires `>=22.19.0 <26` and a bare `npm ci`/`npm test` fails the engine check.
- Never run bare `npm test` without `cd`-ing into this worktree in the same command — the session cwd may be the primary checkout.
- Running `vitest` directly aborts on a test-isolation guard when `HOME` is the real user home. Use `npm test`, or prefix `HOME=$(mktemp -d)`.
- `console.log` inside tests is suppressed by the vitest project config. To surface diagnostic output from an experiment, `throw new Error(report)` instead.
- Conventional commits are enforced by pre-commit hooks. Run `pre-commit run --all-files` before the final commit.
- Defaults fixed by this plan (spec left them open): per-call cap **20 KB = 8 KB head + 12 KB tail** (tail-weighted — tool output is more informative at the end); `fetch_tool_payload` server response cap **2 MiB**, above which the server returns a 2 MiB slice plus `truncated: true`.

---

### Task 1: Order-invariant property-test harness

Builds the test that would have caught #102, and proves it catches it. No production code changes. This lands FIRST so every later task is gated by it.

**Files:**
- Create: `packages/client/src/lib/__tests__/projection-order-invariant.test.ts`
- Create: `packages/shared/src/test-support/generate-session.ts`

**Why these live in `packages/client`, not `packages/shared`:** the property test must reduce events through the REAL client reducer. `packages/shared/vitest.config.ts` sets `environment: "node"` and defines no alias to the client package; `packages/client/vitest.config.ts` sets `environment: "jsdom"` and aliases `@blackbelt-technology/pi-dashboard-shared` to `../shared/src`. A shared-side test importing the reducer would not resolve. Tests that do NOT reduce (`replay-projection.test.ts`, `projection-budget-sweep.test.ts`) stay in `packages/shared`.

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `generateSession(scenario: SessionScenario, seed: number): SeqEvent<DashboardEvent>[]` — contiguous ascending events starting at `seq: 1`.
  - `type SessionScenario = "text-before-tool" | "text-between-tools" | "text-after-tool" | "multi-tool-turn" | "no-message-end" | "thinking-blocks" | "subagent-burst" | "aborted-turn"`
  - `renderShape(events: SeqEvent<DashboardEvent>[]): Array<{ role: string; key: string }>` — reduces events through the real client reducer and returns row role + stable key per rendered row, with tool payload CONTENT excluded.
  - `assertOrderInvariant(raw, projected)` — throws with a readable diff when shapes differ.

- [ ] **Step 1: Write the session generator**

`packages/shared/src/test-support/generate-session.ts`:

```ts
import type { SeqEvent } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

export type SessionScenario =
  | "text-before-tool"
  | "text-between-tools"
  | "text-after-tool"
  | "multi-tool-turn"
  | "no-message-end"
  | "thinking-blocks"
  | "subagent-burst"
  | "aborted-turn";

/** Deterministic PRNG — Date.now()/Math.random() are banned in generated fixtures. */
function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
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
  b.events.push({ seq: b.seq, event: { eventType, timestamp: b.ts, data } as DashboardEvent });
}

/** Assistant message_update carries CUMULATIVE content — this mirrors the bridge. */
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

function toolCall(b: Builder, toolCallId: string, toolName: string, resultBytes: number): void {
  push(b, "tool_execution_start", { toolCallId, toolName, args: { path: `src/${toolCallId}.ts` } });
  push(b, "tool_execution_update", { toolCallId, partialResult: "x".repeat(Math.floor(resultBytes / 4)) });
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
  }
  return b.events;
}

/** Every scenario, one seed each — the default corpus for the property test. */
export const ALL_SCENARIOS: SessionScenario[] = [
  "text-before-tool", "text-between-tools", "text-after-tool", "multi-tool-turn",
  "no-message-end", "thinking-blocks", "subagent-burst", "aborted-turn",
];
```

- [ ] **Step 2: Write the failing property test**

The test reduces raw events and projected events through the REAL client reducer and compares rendered row order + roles. Later tasks append their projection to it. The second test here is the load-bearing one: it applies a #102-shaped projection and asserts the harness REJECTS it — that is the proof the harness is sensitive to the defect class, not just green by construction.

`packages/client/src/lib/__tests__/projection-order-invariant.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInitialState, reduceEvent } from "../event-reducer.js";
import type { SeqEvent } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { ALL_SCENARIOS, generateSession } from "@blackbelt-technology/pi-dashboard-shared/test-support/generate-session.js";

/** Row role + stable key per rendered row. Tool payload CONTENT is excluded. */
export function renderShape(events: SeqEvent<DashboardEvent>[]): Array<{ role: string; key: string }> {
  let state = createInitialState();
  for (const { seq, event } of events) state = reduceEvent(state, event, { seq });
  return state.messages.map((m) => ({ role: m.role, key: m.toolCallId ?? m.id }));
}

export function assertOrderInvariant(
  raw: SeqEvent<DashboardEvent>[],
  projected: SeqEvent<DashboardEvent>[],
  label: string,
): void {
  expect(projected.map((e) => e.seq), `${label}: seq set must be identical`).toEqual(raw.map((e) => e.seq));
  expect(renderShape(projected), `${label}: rendered row order/roles must match raw`).toEqual(renderShape(raw));
}

describe("projection order invariant", () => {
  it("identity projection preserves order for every scenario", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 42);
      assertOrderInvariant(raw, raw.slice(), scenario);
    }
  });

  it("REGRESSION PROOF: a #102-style projection that reconstructs text at message_end is rejected", () => {
    // #102 dropped every message_update in a turn that had a message_end. Here
    // the same defect is expressed as blanking (the shape this codebase can
    // actually deliver): prose stops existing at its own seq and the reducer
    // rebuilds it at message_end, which sorts AFTER the turn's tool rows.
    const raw = generateSession("text-before-tool", 42);
    const hasEnd = raw.some((e) => e.event.eventType === "message_end");
    const broken = raw.map((entry) =>
      hasEnd && entry.event.eventType === "message_update"
        ? { seq: entry.seq, event: { eventType: "message_update", timestamp: entry.event.timestamp, data: {} } as DashboardEvent }
        : entry,
    );
    expect(() => assertOrderInvariant(raw, broken, "#102")).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify the regression proof passes and the harness is live**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- projection-order-invariant 2>&1 | tee /tmp/t1.log
```
Expected: both tests PASS. The second test passing means the harness DETECTS the #102 defect class.

If the first test fails, the generator emits a shape the reducer mishandles — fix the generator, not the assertion. Inspect with `grep -n -A 20 'FAIL ' /tmp/t1.log`.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/test-support/generate-session.ts packages/client/src/lib/__tests__/projection-order-invariant.test.ts
git commit -m "test: add order-invariant property harness for replay projection"
```

---

### Task 2: Shared stub type and run-splitting coalescer

**Files:**
- Create: `packages/shared/src/replay-projection.ts`
- Create: `packages/shared/src/__tests__/replay-projection.test.ts`
- Modify: `packages/client/src/lib/__tests__/projection-order-invariant.test.ts` (point the harness at the new coalescer)
- Modify: `packages/server/src/replay-coordinator.ts:105-143` (delete `compactStreamUpdates`, call the new coalescer)
- Modify: `packages/shared/src/AGENTS.md` (add the `replay-projection.ts` row)

**Interfaces:**
- Consumes: `assertOrderInvariant`, `generateSession`, `ALL_SCENARIOS` from Task 1.
- Produces:
  - `interface ToolCallStub { toolCallId: string; toolName: string; argsSummary: string; status: "running" | "ok" | "error"; startedAt: number; durationMs?: number; fullBytes: number; head?: string; tail?: string; detailLevel: "sliced" | "metadata" }`
  - `const TOOL_STUB_HEAD_BYTES = 8 * 1024`
  - `const TOOL_STUB_TAIL_BYTES = 12 * 1024`
  - `function coalesceProjection(events: readonly SeqEvent<DashboardEvent>[]): SeqEvent<DashboardEvent>[]` — blanks in place, same seq set.
  - `function isBlanked(event: DashboardEvent): boolean`
  - `function makeToolStub(input: { toolCallId: string; toolName: string; args?: Record<string, unknown>; result: string; status: ToolCallStub["status"]; startedAt: number; durationMs?: number; detailLevel: ToolCallStub["detailLevel"] }): ToolCallStub`
  - `function stubbedToolEndEvent(event: DashboardEvent, stub: ToolCallStub): DashboardEvent` — returns a `tool_execution_end` with `data.result` removed and `data.toolStub` set.
  - `function summarizeArgs(toolName: string, args?: Record<string, unknown>): string`

- [ ] **Step 1: Write the failing unit tests**

`packages/shared/src/__tests__/replay-projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { SeqEvent } from "../event-window.js";
import {
  coalesceProjection, isBlanked, makeToolStub, stubbedToolEndEvent, summarizeArgs,
  TOOL_STUB_HEAD_BYTES, TOOL_STUB_TAIL_BYTES,
} from "../replay-projection.js";
import type { DashboardEvent } from "../types.js";

function ev(seq: number, eventType: string, data: Record<string, unknown> = {}): SeqEvent<DashboardEvent> {
  return { seq, event: { eventType, timestamp: 1_700_000_000_000 + seq, data } as DashboardEvent };
}

function textUpdate(seq: number, text: string): SeqEvent<DashboardEvent> {
  return ev(seq, "message_update", { message: { id: "m1", role: "assistant", content: [{ type: "text", text }] } });
}

describe("coalesceProjection", () => {
  it("keeps the seq set identical", () => {
    const input = [textUpdate(1, "a"), textUpdate(2, "ab"), ev(3, "tool_execution_start", { toolCallId: "t1" })];
    expect(coalesceProjection(input).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("blanks all but the LAST member of a consecutive message_update run", () => {
    const out = coalesceProjection([textUpdate(1, "a"), textUpdate(2, "ab"), textUpdate(3, "abc")]);
    expect(isBlanked(out[0]!.event)).toBe(true);
    expect(isBlanked(out[1]!.event)).toBe(true);
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("SPLITS a run on any non-update event — text before a tool survives at its own seq", () => {
    const out = coalesceProjection([
      textUpdate(1, "a"), textUpdate(2, "ab"),
      ev(3, "tool_execution_start", { toolCallId: "t1" }),
      textUpdate(4, "abc"), textUpdate(5, "abcd"),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(true);
    expect(isBlanked(out[1]!.event)).toBe(false); // last of run 1 — survives BEFORE the tool
    expect(isBlanked(out[2]!.event)).toBe(false); // the tool event itself
    expect(isBlanked(out[3]!.event)).toBe(true);
    expect(isBlanked(out[4]!.event)).toBe(false); // last of run 2
  });

  it("blanks superseded tool_execution_update but keeps start and end", () => {
    const out = coalesceProjection([
      ev(1, "tool_execution_start", { toolCallId: "t1", toolName: "Read" }),
      ev(2, "tool_execution_update", { toolCallId: "t1", partialResult: "partial" }),
      ev(3, "tool_execution_end", { toolCallId: "t1", result: "final" }),
    ]);
    expect(isBlanked(out[0]!.event)).toBe(false);
    expect(isBlanked(out[1]!.event)).toBe(true);
    expect(isBlanked(out[2]!.event)).toBe(false);
  });

  it("is deterministic — same input yields byte-identical output", () => {
    const input = [textUpdate(1, "a"), textUpdate(2, "ab"), ev(3, "tool_execution_end", { toolCallId: "t1" })];
    expect(JSON.stringify(coalesceProjection(input))).toEqual(JSON.stringify(coalesceProjection(input)));
  });
});

describe("makeToolStub", () => {
  it("slices head and tail and reports the full byte count", () => {
    const result = "H".repeat(TOOL_STUB_HEAD_BYTES) + "M".repeat(50_000) + "T".repeat(TOOL_STUB_TAIL_BYTES);
    const stub = makeToolStub({
      toolCallId: "t1", toolName: "Read", args: { path: "src/a.ts" },
      result, status: "ok", startedAt: 1000, durationMs: 25, detailLevel: "sliced",
    });
    expect(stub.head!.length).toBe(TOOL_STUB_HEAD_BYTES);
    expect(stub.tail!.length).toBe(TOOL_STUB_TAIL_BYTES);
    expect(stub.head!.startsWith("H")).toBe(true);
    expect(stub.tail!.endsWith("T")).toBe(true);
    expect(stub.fullBytes).toBe(result.length);
  });

  it("omits head/tail at metadata detail level", () => {
    const stub = makeToolStub({
      toolCallId: "t1", toolName: "Read", result: "x".repeat(100_000),
      status: "ok", startedAt: 1000, detailLevel: "metadata",
    });
    expect(stub.head).toBeUndefined();
    expect(stub.tail).toBeUndefined();
    expect(stub.fullBytes).toBe(100_000);
    expect(JSON.stringify(stub).length).toBeLessThan(400);
  });

  it("does not slice a result already under the cap", () => {
    const stub = makeToolStub({
      toolCallId: "t1", toolName: "Read", result: "short",
      status: "ok", startedAt: 1000, detailLevel: "sliced",
    });
    expect(stub.head).toBe("short");
    expect(stub.tail).toBeUndefined();
  });
});

describe("stubbedToolEndEvent", () => {
  it("removes the raw result and attaches the stub at the same eventType", () => {
    const raw = { eventType: "tool_execution_end", timestamp: 1, data: { toolCallId: "t1", result: "big", isError: false } } as DashboardEvent;
    const stub = makeToolStub({ toolCallId: "t1", toolName: "Read", result: "big", status: "ok", startedAt: 1, detailLevel: "metadata" });
    const out = stubbedToolEndEvent(raw, stub) as any;
    expect(out.eventType).toBe("tool_execution_end");
    expect(out.data.result).toBeUndefined();
    expect(out.data.toolStub).toEqual(stub);
    expect(out.data.toolCallId).toBe("t1");
  });
});

describe("summarizeArgs", () => {
  it("renders a bounded call signature", () => {
    expect(summarizeArgs("Read", { path: "src/a.ts" })).toBe('Read("src/a.ts")');
  });
  it("bounds a pathological arg", () => {
    expect(summarizeArgs("Read", { path: "x".repeat(5000) }).length).toBeLessThanOrEqual(200);
  });
  it("handles missing args", () => {
    expect(summarizeArgs("Read", undefined)).toBe("Read()");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- replay-projection 2>&1 | tail -20
```
Expected: FAIL — `Cannot find module '../replay-projection.js'`.

- [ ] **Step 3: Write the implementation**

`packages/shared/src/replay-projection.ts`:

```ts
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
 * by `toolCallId`.
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
    event: { eventType: entry.event.eventType, timestamp: entry.event.timestamp, data: {} } as DashboardEvent,
  };
}

function isAssistantTextUpdate(event: DashboardEvent): boolean {
  if (event.eventType !== "message_update") return false;
  const data = event.data as any;
  // A thinking delta is not a text snapshot — it carries incremental semantics
  // the reducer needs, so it is never treated as a run member.
  if (typeof data?.assistantMessageEvent?.type === "string" && data.assistantMessageEvent.type.startsWith("thinking_")) {
    return false;
  }
  return data?.message?.role === "assistant";
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
 *  2. `tool_execution_update` — blank superseded progress updates. The start
 *     and end events always survive; a coalesced tool call therefore stays
 *     anchored at its `tool_execution_start` seq, where the reducer creates
 *     the tool row.
 *
 * Everything else passes through untouched. Output seqs equal input seqs.
 */
export function coalesceProjection(events: readonly SeqEvent<DashboardEvent>[]): SeqEvent<DashboardEvent>[] {
  const out = events.slice();
  let runLast: number | null = null;
  const seenToolUpdate = new Map<string, number>();

  for (let index = 0; index < out.length; index += 1) {
    const entry = out[index]!;
    if (isAssistantTextUpdate(entry.event)) {
      if (runLast !== null) out[runLast] = blank(out[runLast]!);
      runLast = index;
      continue;
    }
    // Any non-update event closes the current run: its last member stays live.
    runLast = null;

    if (entry.event.eventType === "tool_execution_update") {
      const toolCallId = (entry.event.data as any)?.toolCallId;
      if (typeof toolCallId === "string") {
        const previous = seenToolUpdate.get(toolCallId);
        if (previous !== undefined) out[previous] = blank(out[previous]!);
        seenToolUpdate.set(toolCallId, index);
      }
    }
  }
  // A tool's progress updates are all superseded once its end event exists;
  // the final one is blanked too when the call terminated inside this range.
  for (const [toolCallId, index] of seenToolUpdate) {
    const terminated = out.some(
      (e) => e.event.eventType === "tool_execution_end" && (e.event.data as any)?.toolCallId === toolCallId,
    );
    if (terminated) out[index] = blank(out[index]!);
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
  return { ...event, data: { ...rest, toolStub: stub } } as DashboardEvent;
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- replay-projection 2>&1 | tail -20
```
Expected: PASS.

- [ ] **Step 5: Point the property harness at the new coalescer and delete `compactStreamUpdates`**

First, measure the existing `compactStreamUpdates` against the invariant with a THROWAWAY experiment (do not commit it). `compactStreamUpdates` resets its `latestTextUpdate` cursor only at `message_end`, so it does not split runs on `tool_execution_start` — the claim that this reproduces a #102-shaped ordering defect must be verified by running it, not by reading it. Write a temporary test file that imports both `compactStreamUpdates` and the harness, run it, record the failing scenarios in the commit message, then delete the file.

Then append to `packages/client/src/lib/__tests__/projection-order-invariant.test.ts`:

```ts
import { coalesceProjection } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";

describe("coalesceProjection satisfies the invariant", () => {
  it("preserves rendered order and roles for every scenario", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 42);
      assertOrderInvariant(raw, coalesceProjection(raw), scenario);
    }
  });

  it("preserves the invariant across many seeds", () => {
    for (const scenario of ALL_SCENARIOS) {
      for (let seed = 1; seed <= 25; seed += 1) {
        const raw = generateSession(scenario, seed);
        assertOrderInvariant(raw, coalesceProjection(raw), `${scenario}#${seed}`);
      }
    }
  });
});
```

Delete the now-stale snapshot file that Task 1 Step 5 created (under `packages/client/src/lib/__tests__/__snapshots__/`).

In `packages/server/src/replay-coordinator.ts`: delete `isToolOnlyAssistantMessage` (lines 87-103) and `compactStreamUpdates` (lines 105-143), and replace the two call sites (`replay-coordinator.ts:394` and `:401`) with `coalesceProjection`. Add to the import block at the top:

```ts
import { coalesceProjection } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
```

- [ ] **Step 6: Run the full suite**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test 2>&1 | tee /tmp/t2.log; grep -nE 'FAIL|✗' /tmp/t2.log | head -30
```
Expected: PASS across the suite. Existing replay-coordinator tests that asserted `compactStreamUpdates` specifics will fail — read each with `grep -n -A 20 'FAIL ' /tmp/t2.log` and update the assertion to the new blank-in-place semantics. Do NOT weaken the order-invariant test to make one pass.

- [ ] **Step 7: Add the AGENTS.md row**

In `packages/shared/src/AGENTS.md`, add path-alphabetically (caveman style, one fact per row):

```
| `replay-projection.ts` | Order-preserving replay projection. Exports `ToolCallStub`, `coalesceProjection`, `makeToolStub`, `stubbedToolEndEvent`, `summarizeArgs`, `isBlanked`, `TOOL_STUB_HEAD_BYTES`, `TOOL_STUB_TAIL_BYTES`. Blanks superseded events in place — never removes, so seq range stays contiguous. Splits message_update runs on any non-update event. See change: hydration-tool-stub-projection. |
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/replay-projection.ts packages/shared/src/__tests__ packages/shared/src/AGENTS.md packages/server/src/replay-coordinator.ts
git commit -m "feat(shared): add order-preserving replay projection with tool stubs"
```

---

### Task 3: `fetch_tool_payload` wire protocol and server handler

Lands BEFORE the budget algorithm — the budget algorithm may only degrade a payload once that payload is re-fetchable.

**Files:**
- Modify: `packages/shared/src/browser-protocol.ts` (add message interfaces + union members)
- Create: `packages/server/src/browser-handlers/tool-payload-handler.ts`
- Create: `packages/server/src/__tests__/tool-payload-handler.test.ts`
- Modify: `packages/server/src/browser-gateway.ts:700-718` (dispatch case)
- Modify: `packages/server/src/browser-handlers/AGENTS.md`

**Interfaces:**
- Consumes: `ToolCallStub` from Task 2 (type only, for the doc comment).
- Produces:
  - `interface FetchToolPayloadMessage { type: "fetch_tool_payload"; sessionId: string; toolCallId: string; requestId: string }`
  - `interface ToolPayloadMessage { type: "tool_payload"; sessionId: string; requestId: string; toolCallId: string; payload?: string; truncated?: true; error?: "not_found" | "unavailable" }`
  - `const TOOL_PAYLOAD_RESPONSE_CAP = 2 * 1024 * 1024`
  - `function handleFetchToolPayload(msg: FetchToolPayloadMessage, store: Pick<EventStore, "findToolEndEvent">): ToolPayloadMessage`

- [ ] **Step 1: Write the failing test**

`packages/server/src/__tests__/tool-payload-handler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { handleFetchToolPayload, TOOL_PAYLOAD_RESPONSE_CAP } from "../browser-handlers/tool-payload-handler.js";

function storeWith(result: unknown) {
  return {
    findToolEndEvent: (_sessionId: string, toolCallId: string) =>
      toolCallId === "t1"
        ? ({ eventType: "tool_execution_end", timestamp: 1, data: { toolCallId: "t1", result } } as any)
        : undefined,
  };
}

const req = { type: "fetch_tool_payload", sessionId: "s1", toolCallId: "t1", requestId: "r1" } as const;

describe("handleFetchToolPayload", () => {
  it("returns the full payload under the cap", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith("hello"));
    expect(out).toEqual({ type: "tool_payload", sessionId: "s1", requestId: "r1", toolCallId: "t1", payload: "hello" });
  });

  it("caps an oversized payload and flags truncation", () => {
    const big = "x".repeat(TOOL_PAYLOAD_RESPONSE_CAP + 5000);
    const out = handleFetchToolPayload({ ...req }, storeWith(big));
    expect(out.payload!.length).toBe(TOOL_PAYLOAD_RESPONSE_CAP);
    expect(out.truncated).toBe(true);
  });

  it("returns not_found for an unknown toolCallId", () => {
    const out = handleFetchToolPayload({ ...req, toolCallId: "nope" }, storeWith("hello"));
    expect(out.error).toBe("not_found");
    expect(out.payload).toBeUndefined();
  });

  it("stringifies a structured result", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith({ content: [{ text: "structured" }] }));
    expect(out.payload).toContain("structured");
  });

  it("returns not_found when the end event carries no result", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith(undefined));
    expect(out.error).toBe("not_found");
  });

  it("echoes requestId so concurrent fetches never cross", () => {
    const out = handleFetchToolPayload({ ...req, requestId: "r2" }, storeWith("hello"));
    expect(out.requestId).toBe("r2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- tool-payload-handler 2>&1 | tail -15
```
Expected: FAIL — module not found.

- [ ] **Step 3: Add the protocol types**

In `packages/shared/src/browser-protocol.ts`, add near the other Browser → Server interfaces (after `UnsubscribeMessage`, ~line 995):

```ts
/**
 * Re-inflate a tool payload that hydration or client eviction degraded to a
 * `ToolCallStub`. Keyed by `toolCallId`, NOT seq: tool ids are stable across
 * replay and eviction and survive re-hydration, so the client need not track
 * which seq a payload lived at after the row degrades.
 * See change: hydration-tool-stub-projection.
 */
export interface FetchToolPayloadMessage {
  type: "fetch_tool_payload";
  sessionId: string;
  toolCallId: string;
  /** Echoed on the response so concurrent fetches never cross. */
  requestId: string;
}

/**
 * Response to `fetch_tool_payload`. Never enters the client ledger — the
 * client holds it in a short-lived LRU keyed by `toolCallId`, or re-inflating
 * a few old tools walks it back into the memory ceiling eviction just relieved.
 * See change: hydration-tool-stub-projection.
 */
export interface ToolPayloadMessage {
  type: "tool_payload";
  sessionId: string;
  requestId: string;
  toolCallId: string;
  payload?: string;
  /** Set when the payload exceeded the server response cap; UI offers "open raw". */
  truncated?: true;
  error?: "not_found" | "unavailable";
}
```

Add `| FetchToolPayloadMessage` to the `BrowserToServerMessage` union (after `| SubscribeMessage`, line 1670) and `| ToolPayloadMessage` to the `ServerToBrowserMessage` union (after `| EventReplayMessage`, line 855).

- [ ] **Step 4: Write the handler**

`packages/server/src/browser-handlers/tool-payload-handler.ts`:

```ts
import type { FetchToolPayloadMessage, ToolPayloadMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { EventStore } from "../memory-event-store.js";

/**
 * Server-side cap on one `tool_payload` response, independent of the replay
 * tail budget. Above it the client gets a leading 2 MiB slice plus
 * `truncated: true`, and the UI offers "open raw".
 */
export const TOOL_PAYLOAD_RESPONSE_CAP = 2 * 1024 * 1024;

function toText(result: unknown): string | undefined {
  if (result === undefined || result === null) return undefined;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a stubbed tool payload from the authoritative event store.
 *
 * Idempotent and side-effect free: it mutates no server state and enters no
 * ledger, so a failed fetch degrades to an error affordance on one row and
 * cannot corrupt the transcript.
 */
export function handleFetchToolPayload(
  msg: FetchToolPayloadMessage,
  store: Pick<EventStore, "findToolEndEvent">,
): ToolPayloadMessage {
  const base = {
    type: "tool_payload" as const,
    sessionId: msg.sessionId,
    requestId: msg.requestId,
    toolCallId: msg.toolCallId,
  };
  const event = store.findToolEndEvent(msg.sessionId, msg.toolCallId);
  if (!event) return { ...base, error: "not_found" };
  const text = toText((event.data as Record<string, unknown> | undefined)?.result);
  if (text === undefined) return { ...base, error: "not_found" };
  if (text.length > TOOL_PAYLOAD_RESPONSE_CAP) {
    return { ...base, payload: text.slice(0, TOOL_PAYLOAD_RESPONSE_CAP), truncated: true };
  }
  return { ...base, payload: text };
}
```

- [ ] **Step 5: Wire the dispatch case**

In `packages/server/src/browser-gateway.ts`, add to the `switch (msg.type)` block after the `case "unsubscribe":` block (~line 718):

```ts
          case "fetch_tool_payload":
            send(ws, handleFetchToolPayload(msg, eventStore));
            break;
```

Add the import at the top of `browser-gateway.ts`:

```ts
import { handleFetchToolPayload } from "./browser-handlers/tool-payload-handler.js";
```

If the local identifiers for the send function and store differ in that scope, match the names already used by the neighbouring `case "subscribe"` arm rather than introducing new ones.

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- tool-payload-handler 2>&1 | tail -15
```
Expected: PASS.

Then typecheck:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm run lint
```
Expected: clean.

- [ ] **Step 7: Add the AGENTS.md row**

In `packages/server/src/browser-handlers/AGENTS.md`, path-alphabetically:

```
| `tool-payload-handler.ts` | Resolves `fetch_tool_payload` -> `tool_payload` from event store by `toolCallId`. Exports `handleFetchToolPayload`, `TOOL_PAYLOAD_RESPONSE_CAP` (2 MiB). Side-effect free; never mutates ledger. See change: hydration-tool-stub-projection. |
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/browser-protocol.ts packages/server/src/browser-handlers packages/server/src/browser-gateway.ts packages/server/src/__tests__/tool-payload-handler.test.ts
git commit -m "feat(server): add fetch_tool_payload protocol and handler"
```

---

### Task 4: Client tool-payload cache and fetch path

**Files:**
- Create: `packages/client/src/lib/tool-payload-cache.ts`
- Create: `packages/client/src/lib/__tests__/tool-payload-cache.test.ts`

**Interfaces:**
- Consumes: `FetchToolPayloadMessage`, `ToolPayloadMessage` from Task 3.
- Produces:
  - `class ToolPayloadCache` with `get(toolCallId): CachedPayload | undefined`, `set(toolCallId, payload: string, truncated: boolean): void`, `has(toolCallId): boolean`, `clear(): void`, `readonly bytes: number`
  - `interface CachedPayload { payload: string; truncated: boolean }`
  - `const TOOL_PAYLOAD_CACHE_BYTES = 4 * 1024 * 1024`

- [ ] **Step 1: Write the failing test**

`packages/client/src/lib/__tests__/tool-payload-cache.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { TOOL_PAYLOAD_CACHE_BYTES, ToolPayloadCache } from "../tool-payload-cache.js";

describe("ToolPayloadCache", () => {
  it("stores and returns a payload", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "hello", false);
    expect(cache.get("t1")).toEqual({ payload: "hello", truncated: false });
    expect(cache.has("t1")).toBe(true);
  });

  it("returns undefined for an unknown id", () => {
    expect(new ToolPayloadCache().get("nope")).toBeUndefined();
  });

  it("evicts least-recently-used entries above the byte ceiling", () => {
    const cache = new ToolPayloadCache();
    const half = "x".repeat(Math.floor(TOOL_PAYLOAD_CACHE_BYTES * 0.6));
    cache.set("a", half, false);
    cache.set("b", half, false);
    expect(cache.has("a")).toBe(false); // evicted to make room for b
    expect(cache.has("b")).toBe(true);
    expect(cache.bytes).toBeLessThanOrEqual(TOOL_PAYLOAD_CACHE_BYTES);
  });

  it("counts a read as a use, so the read entry survives the next eviction", () => {
    const cache = new ToolPayloadCache();
    const third = "x".repeat(Math.floor(TOOL_PAYLOAD_CACHE_BYTES * 0.4));
    cache.set("a", third, false);
    cache.set("b", third, false);
    cache.get("a");            // 'a' becomes most-recently-used
    cache.set("c", third, false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("drops a single payload larger than the whole ceiling instead of thrashing", () => {
    const cache = new ToolPayloadCache();
    cache.set("huge", "x".repeat(TOOL_PAYLOAD_CACHE_BYTES + 1), true);
    expect(cache.has("huge")).toBe(false);
    expect(cache.bytes).toBe(0);
  });

  it("preserves the truncated flag", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "partial", true);
    expect(cache.get("t1")!.truncated).toBe(true);
  });

  it("clear() empties the cache and resets the byte count", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "hello", false);
    cache.clear();
    expect(cache.has("t1")).toBe(false);
    expect(cache.bytes).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- tool-payload-cache 2>&1 | tail -15
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`packages/client/src/lib/tool-payload-cache.ts`:

```ts
/**
 * Byte ceiling for re-inflated tool payloads. Deliberately small relative to
 * the transcript budget: this cache exists so a user can inspect a few
 * degraded tool rows, not so the transcript can be reassembled in full.
 */
export const TOOL_PAYLOAD_CACHE_BYTES = 4 * 1024 * 1024;

export interface CachedPayload {
  payload: string;
  truncated: boolean;
}

/**
 * Short-lived LRU for payloads fetched via `fetch_tool_payload`, keyed by
 * `toolCallId`.
 *
 * Fetched payloads MUST NOT enter the replay ledger. Re-inflating a handful of
 * old tools into the ledger would walk the client straight back into the memory
 * ceiling that eviction just relieved, and would also break ledger contiguity
 * accounting. This cache is the separate home for them: purely derived state,
 * safe to drop at any moment, never a source for the reducer.
 *
 * Recency order is the `Map` insertion order — a read re-inserts its key.
 * See change: hydration-tool-stub-projection.
 */
export class ToolPayloadCache {
  private readonly entries = new Map<string, CachedPayload>();
  private total = 0;

  get bytes(): number {
    return this.total;
  }

  get(toolCallId: string): CachedPayload | undefined {
    const entry = this.entries.get(toolCallId);
    if (!entry) return undefined;
    // Re-insert to mark most-recently-used.
    this.entries.delete(toolCallId);
    this.entries.set(toolCallId, entry);
    return entry;
  }

  has(toolCallId: string): boolean {
    return this.entries.has(toolCallId);
  }

  set(toolCallId: string, payload: string, truncated: boolean): void {
    const existing = this.entries.get(toolCallId);
    if (existing) {
      this.entries.delete(toolCallId);
      this.total -= existing.payload.length;
    }
    // A payload larger than the whole ceiling can never be retained without
    // evicting everything and still overflowing — drop it rather than thrash.
    if (payload.length > TOOL_PAYLOAD_CACHE_BYTES) return;
    this.entries.set(toolCallId, { payload, truncated });
    this.total += payload.length;
    while (this.total > TOOL_PAYLOAD_CACHE_BYTES) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const victim = this.entries.get(oldest.value)!;
      this.entries.delete(oldest.value);
      this.total -= victim.payload.length;
    }
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- tool-payload-cache 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Add the AGENTS.md row**

In `packages/client/src/lib/AGENTS.md`, path-alphabetically:

```
| `tool-payload-cache.ts` | LRU for `fetch_tool_payload` responses, keyed by `toolCallId`. Exports `ToolPayloadCache`, `CachedPayload`, `TOOL_PAYLOAD_CACHE_BYTES` (4 MiB). Never enters replay ledger — derived state, droppable. See change: hydration-tool-stub-projection. |
```

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/lib/tool-payload-cache.ts packages/client/src/lib/__tests__/tool-payload-cache.test.ts packages/client/src/lib/AGENTS.md
git commit -m "feat(client): add LRU cache for re-inflated tool payloads"
```

---

### Task 5: Budget algorithm — chat floor and tool ceiling

**Files:**
- Modify: `packages/shared/src/event-window.ts`
- Create: `packages/shared/src/__tests__/event-window.tool-ceiling.test.ts`
- Modify: `packages/shared/src/AGENTS.md`

**Interfaces:**
- Consumes: `ToolCallStub`, `makeToolStub`, `stubbedToolEndEvent`, `coalesceProjection` from Task 2.
- Produces:
  - `const TOOL_CEILING_FRACTION = 0.25`
  - `function applyToolBudget(events: readonly SeqEvent<DashboardEvent>[], budgetBytes: number): { events: SeqEvent<DashboardEvent>[]; toolBytes: number; chatBytes: number; degraded: number; collapsed: number }`
  - `selectNewestEventsByBudget` gains an optional third-option field `projectToolBudget?: boolean` (default `false`, so every existing caller is unchanged).

- [ ] **Step 1: Write the failing test**

`packages/shared/src/__tests__/event-window.tool-ceiling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyToolBudget, TOOL_CEILING_FRACTION, type SeqEvent } from "../event-window.js";
import type { DashboardEvent } from "../types.js";

function toolPair(startSeq: number, toolCallId: string, resultBytes: number): SeqEvent<DashboardEvent>[] {
  return [
    { seq: startSeq, event: { eventType: "tool_execution_start", timestamp: startSeq, data: { toolCallId, toolName: "Read", args: { path: "a.ts" } } } as DashboardEvent },
    { seq: startSeq + 1, event: { eventType: "tool_execution_end", timestamp: startSeq + 1, data: { toolCallId, toolName: "Read", result: "x".repeat(resultBytes), isError: false } } as DashboardEvent },
  ];
}

function chat(seq: number, text: string): SeqEvent<DashboardEvent> {
  return { seq, event: { eventType: "message_end", timestamp: seq, data: { message: { role: "assistant", content: [{ type: "text", text }] } } } as DashboardEvent };
}

describe("applyToolBudget", () => {
  const BUDGET = 1.5 * 1024 * 1024;

  it("leaves small tool payloads untouched", () => {
    const input = [chat(1, "hi"), ...toolPair(2, "t1", 500)];
    const out = applyToolBudget(input, BUDGET);
    expect(out.degraded).toBe(0);
    expect((out.events[2]!.event.data as any).result).toBe("x".repeat(500));
  });

  it("keeps the seq set identical no matter how hard it degrades", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 100 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 200_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    expect(out.events.map((e) => e.seq)).toEqual(input.map((e) => e.seq));
  });

  it("holds tool bytes under the ceiling for a 500-call burst", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 500 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    expect(out.toolBytes).toBeLessThanOrEqual(Math.floor(BUDGET * TOOL_CEILING_FRACTION));
  });

  it("degrades OLDEST-first, so the newest call keeps the most detail", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 60 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    const out = applyToolBudget(input, BUDGET);
    const levelOf = (toolCallId: string) => {
      const entry = out.events.find((e) => e.event.eventType === "tool_execution_end" && (e.event.data as any).toolCallId === toolCallId)!;
      const data = entry.event.data as any;
      return data.toolStub ? data.toolStub.detailLevel : "full";
    };
    const rank = { full: 3, sliced: 2, metadata: 1 } as const;
    expect(rank[levelOf("t59") as keyof typeof rank]).toBeGreaterThanOrEqual(rank[levelOf("t0") as keyof typeof rank]);
  });

  it("issue #101 worked example: 12 calls x 20 KB fit under the ceiling with chat intact", () => {
    const input = [chat(1, "the user prompt"), ...Array.from({ length: 12 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 20 * 1024)).flat()];
    const out = applyToolBudget(input, BUDGET);
    expect(out.toolBytes).toBeLessThanOrEqual(Math.floor(BUDGET * TOOL_CEILING_FRACTION));
    expect(out.degraded).toBe(0);
    expect((out.events[0]!.event.data as any).message.content[0].text).toBe("the user prompt");
  });

  it("never degrades a chat event", () => {
    const input = [chat(1, "y".repeat(500_000)), ...toolPair(2, "t1", 500_000)];
    const out = applyToolBudget(input, BUDGET);
    expect((out.events[0]!.event.data as any).message.content[0].text.length).toBe(500_000);
  });

  it("never degrades a still-running tool (no end event in range)", () => {
    const input: SeqEvent<DashboardEvent>[] = [
      chat(1, "hi"),
      { seq: 2, event: { eventType: "tool_execution_start", timestamp: 2, data: { toolCallId: "live", toolName: "Bash" } } as DashboardEvent },
    ];
    const out = applyToolBudget(input, BUDGET);
    expect(out.degraded).toBe(0);
    expect((out.events[1]!.event.data as any).toolStub).toBeUndefined();
  });

  it("is deterministic — same range and budget yield byte-identical output", () => {
    const input = [chat(1, "hi"), ...Array.from({ length: 40 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 100_000)).flat()];
    expect(JSON.stringify(applyToolBudget(input, BUDGET))).toEqual(JSON.stringify(applyToolBudget(input, BUDGET)));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- event-window.tool-ceiling 2>&1 | tail -15
```
Expected: FAIL — `applyToolBudget` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `packages/shared/src/event-window.ts`, after the existing budget constants (~line 9):

```ts
import { makeToolStub, stubbedToolEndEvent, type ToolCallStub } from "./replay-projection.js";

/**
 * Fraction of the tail budget tool payloads may occupy. The remainder is a
 * reserved chat floor tool content cannot take.
 *
 * This is the direct fix for issue #101, where one subagent burst consumed the
 * whole budget and left a transcript with no readable chat. A per-call cap
 * alone does not bound N calls x cap; only a hard aggregate ceiling does.
 */
export const TOOL_CEILING_FRACTION = 0.25;

interface ToolBudgetResult {
  events: SeqEvent<DashboardEvent>[];
  toolBytes: number;
  chatBytes: number;
  /** Count of logical calls degraded below `full`. */
  degraded: number;
  /** Count of logical calls reduced to `metadata`. */
  collapsed: number;
}

const TOOL_EVENT_TYPES = new Set(["tool_execution_start", "tool_execution_update", "tool_execution_end"]);

function toolCallIdOf(event: DashboardEvent): string | undefined {
  const id = (event.data as Record<string, unknown> | undefined)?.toolCallId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function resultTextOf(event: DashboardEvent): string {
  const result = (event.data as Record<string, unknown> | undefined)?.result;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  try {
    return JSON.stringify(result) ?? "";
  } catch {
    return "";
  }
}

/**
 * Enforce the tool ceiling / chat floor over a contiguous ascending range.
 *
 * Degrades logical tool calls down the ladder (`full` -> `sliced` ->
 * `metadata`) OLDEST-FIRST, so recent calls keep the most detail, until tool
 * bytes fit under `budgetBytes * TOOL_CEILING_FRACTION`.
 *
 * Blanks nothing and removes nothing: the returned seq set is identical to the
 * input's. Only `tool_execution_end` payloads change, and each becomes a
 * self-describing `ToolCallStub` re-fetchable by `toolCallId`. Chat events are
 * never touched — the chat floor is enforced by construction, not by trimming.
 *
 * A tool with no `tool_execution_end` in the range is still running and is
 * never degraded.
 */
export function applyToolBudget(
  events: readonly SeqEvent<DashboardEvent>[],
  budgetBytes: number,
): ToolBudgetResult {
  const ceiling = Math.floor(budgetBytes * TOOL_CEILING_FRACTION);
  const out = events.slice();

  // Index the terminal event of every logical call, ascending by seq. The
  // start event carries the anchor and is never rewritten.
  const ends: Array<{ index: number; toolCallId: string; startSeq: number }> = [];
  const startSeqById = new Map<string, number>();
  for (let index = 0; index < out.length; index += 1) {
    const entry = out[index]!;
    const toolCallId = toolCallIdOf(entry.event);
    if (!toolCallId) continue;
    if (entry.event.eventType === "tool_execution_start" && !startSeqById.has(toolCallId)) {
      startSeqById.set(toolCallId, entry.seq);
    }
    if (entry.event.eventType === "tool_execution_end") {
      ends.push({ index, toolCallId, startSeq: startSeqById.get(toolCallId) ?? entry.seq });
    }
  }
  ends.sort((a, b) => a.startSeq - b.startSeq);

  const measure = (entry: SeqEvent<DashboardEvent>): number => estimateSeqEventBytes(entry);
  const toolBytesNow = (): number =>
    out.reduce((sum, entry) => (TOOL_EVENT_TYPES.has(entry.event.eventType) ? sum + measure(entry) : sum), 0);
  const chatBytesNow = (): number =>
    out.reduce((sum, entry) => (TOOL_EVENT_TYPES.has(entry.event.eventType) ? sum : sum + measure(entry)), 0);

  let degraded = 0;
  let collapsed = 0;
  // Two passes, oldest-first. Pass 1 slices; pass 2 collapses to metadata only
  // if slicing alone left tool bytes above the ceiling.
  for (const level of ["sliced", "metadata"] as const) {
    for (const end of ends) {
      if (toolBytesNow() <= ceiling) break;
      const entry = out[end.index]!;
      const data = entry.event.data as Record<string, unknown> | undefined;
      const existing = data?.toolStub as ToolCallStub | undefined;
      if (existing?.detailLevel === level) continue;
      const raw = existing ? `${existing.head ?? ""}${existing.tail ?? ""}` : resultTextOf(entry.event);
      const fullBytes = existing ? existing.fullBytes : raw.length;
      const isError = data?.isError === true;
      const toolName = typeof data?.toolName === "string" ? data.toolName : (existing?.toolName ?? "unknown");
      const stub = makeToolStub({
        toolCallId: end.toolCallId,
        toolName,
        args: data?.args as Record<string, unknown> | undefined,
        result: raw,
        status: isError ? "error" : "ok",
        startedAt: typeof data?.startedAt === "number" ? data.startedAt : entry.event.timestamp,
        detailLevel: level,
      });
      // `raw` is already a slice once a stub exists; keep the ORIGINAL full size
      // so the UI reports the true unloaded byte count, not the sliced one.
      stub.fullBytes = fullBytes;
      out[end.index] = { seq: entry.seq, event: stubbedToolEndEvent(entry.event, stub) };
      if (!existing) degraded += 1;
      if (level === "metadata") collapsed += 1;
    }
  }

  return { events: out, toolBytes: toolBytesNow(), chatBytes: chatBytesNow(), degraded, collapsed };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- event-window 2>&1 | tee /tmp/t5.log; grep -nE 'FAIL|✗' /tmp/t5.log | head
```
Expected: PASS, including the pre-existing `event-window.test.ts` and `event-window.readable-turns.test.ts` (this task adds an export; it changes no existing behavior).

- [ ] **Step 5: Add the order-invariant check for the budget stage**

Append to `packages/client/src/lib/__tests__/projection-order-invariant.test.ts`:

```ts
import { applyToolBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";

describe("applyToolBudget satisfies the invariant", () => {
  it("preserves rendered order and roles at every budget, for every scenario", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 42);
      for (const budget of [1.5 * 1024 * 1024, 512 * 1024, 128 * 1024, 32 * 1024, 16 * 1024]) {
        const projected = applyToolBudget(coalesceProjection(raw), budget).events;
        assertOrderInvariant(raw, projected, `${scenario}@${budget}`);
      }
    }
  });
});
```

- [ ] **Step 6: Run and verify**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- projection-order-invariant 2>&1 | tail -20
```
Expected: PASS. If the reducer renders a stubbed tool row with a different role than a full one, that is a real defect — fix it in `renderShape`'s source (the reducer), not by relaxing the assertion.

- [ ] **Step 7: Update the AGENTS.md row and commit**

In `packages/shared/src/AGENTS.md`, extend the existing `event-window.ts` row purpose with:

```
Also exports `applyToolBudget`, `TOOL_CEILING_FRACTION` (0.25) — hard tool ceiling with reserved chat floor; degrades tool payloads to stubs oldest-first, seq set unchanged. See change: hydration-tool-stub-projection.
```

```bash
git add packages/shared/src/event-window.ts packages/shared/src/__tests__ packages/shared/src/AGENTS.md
git commit -m "feat(shared): add tool-ceiling budget with reserved chat floor"
```

---

### Task 6: Wire the projection into server hydration

**Files:**
- Modify: `packages/server/src/replay-coordinator.ts:389-429`
- Create: `packages/server/src/__tests__/replay-coordinator-tool-budget.test.ts`

**Interfaces:**
- Consumes: `coalesceProjection` (Task 2), `applyToolBudget` (Task 5).
- Produces: no new exported symbols. Behavior: cold `mode: "tail"` and `older` replay kinds run `applyToolBudget` after `coalesceProjection` and before window selection; `delta` and `full` do not (live and legacy paths stay byte-identical).

- [ ] **Step 1: Write the failing test**

`packages/server/src/__tests__/replay-coordinator-tool-budget.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { coalesceProjection } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { applyToolBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { projectForHydration } from "../replay-coordinator.js";

function toolPair(startSeq: number, toolCallId: string, resultBytes: number) {
  return [
    { seq: startSeq, event: { eventType: "tool_execution_start", timestamp: startSeq, data: { toolCallId, toolName: "Read" } } as any },
    { seq: startSeq + 1, event: { eventType: "tool_execution_end", timestamp: startSeq + 1, data: { toolCallId, result: "x".repeat(resultBytes) } } as any },
  ];
}

const BUDGET = 1.5 * 1024 * 1024;
const source = [
  { seq: 1, event: { eventType: "message_end", timestamp: 1, data: { message: { role: "user", content: [{ type: "text", text: "go" }] } } } as any },
  ...Array.from({ length: 40 }, (_, i) => toolPair(2 + i * 2, `t${i}`, 200_000)).flat(),
];

describe("projectForHydration", () => {
  it("applies coalesce + budget for cold tail", () => {
    const out = projectForHydration(source, BUDGET, "cold", "tail");
    expect(out.map((e) => e.seq)).toEqual(source.map((e) => e.seq));
    expect(JSON.stringify(out)).toEqual(JSON.stringify(applyToolBudget(coalesceProjection(source), BUDGET).events));
  });

  it("applies coalesce + budget for older paging", () => {
    const out = projectForHydration(source, BUDGET, "older", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(applyToolBudget(coalesceProjection(source), BUDGET).events));
  });

  it("applies coalesce ONLY for delta — live catch-up keeps full payloads", () => {
    const out = projectForHydration(source, BUDGET, "delta", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(coalesceProjection(source)));
  });

  it("applies coalesce ONLY for legacy full mode", () => {
    const out = projectForHydration(source, BUDGET, "cold", undefined);
    expect(JSON.stringify(out)).toEqual(JSON.stringify(coalesceProjection(source)));
  });

  it("leaves the range contiguous so the window selector accepts it", () => {
    const out = projectForHydration(source, BUDGET, "cold", "tail");
    for (let i = 1; i < out.length; i += 1) expect(out[i]!.seq).toBe(out[i - 1]!.seq + 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- replay-coordinator-tool-budget 2>&1 | tail -15
```
Expected: FAIL — `projectForHydration` is not exported.

- [ ] **Step 3: Add `projectForHydration` and call it**

In `packages/server/src/replay-coordinator.ts`, add near the top (replacing where `compactStreamUpdates` lived, after the imports):

```ts
/**
 * The single hydration projection entry point.
 *
 * Coalescing is safe for every replay kind — it only blanks superseded payloads
 * in place. The tool BUDGET is applied only to windows that are actually
 * byte-bounded (cold `tail` and `older` paging). A `delta` must stay a
 * byte-faithful contiguous prefix of the client's missing range, and legacy
 * `full` mode has no budget to enforce, so neither is degraded.
 *
 * Live streaming never reaches this function — `publishLive` sends raw events.
 * See change: hydration-tool-stub-projection.
 */
export function projectForHydration(
  events: readonly StoredEvent[],
  budgetBytes: number,
  replayKind: ReplayKind,
  mode: "full" | "tail" | undefined,
): StoredEvent[] {
  const coalesced = coalesceProjection(events) as StoredEvent[];
  const budgeted = replayKind === "older" || (replayKind === "cold" && mode === "tail");
  return budgeted ? (applyToolBudget(coalesced, budgetBytes).events as StoredEvent[]) : coalesced;
}
```

Add `applyToolBudget` to the existing `event-window.js` import at `replay-coordinator.ts:3`:

```ts
import { applyToolBudget, clampTailWindowBytes, selectNewestEventsByBudget, selectOlderEventsByBudget } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
```

Replace the call site at `replay-coordinator.ts:394`:

```ts
    const raw = projectForHydration(options.store.getEvents(sessionId, 1), budget, request.replayKind, msg.mode);
```

And at `replay-coordinator.ts:401`:

```ts
      if (persisted.ok) persistedRaw = persisted.events ? projectForHydration(persisted.events, budget, request.replayKind, msg.mode) : undefined;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- replay-coordinator 2>&1 | tee /tmp/t6.log; grep -nE 'FAIL|✗' /tmp/t6.log | head -20
```
Expected: PASS across every `replay-coordinator*` test file. Investigate any failure with `grep -n -A 20 'FAIL ' /tmp/t6.log`.

- [ ] **Step 5: Run the full suite and typecheck**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test 2>&1 | tee /tmp/t6-all.log; grep -nE 'FAIL|✗' /tmp/t6-all.log | head -30
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm run lint
```
Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/replay-coordinator.ts packages/server/src/__tests__/replay-coordinator-tool-budget.test.ts
git commit -m "feat(server): apply tool-stub projection to budgeted hydration windows"
```

---

### Task 7: Client eviction walks the same ladder

**Files:**
- Modify: `packages/client/src/lib/event-reducer.ts:501-559` (`evictBelow`)
- Modify: `packages/client/src/lib/__tests__/event-reducer.evict-below.test.ts`

**Interfaces:**
- Consumes: `ToolCallStub`, `makeToolStub` (Task 2).
- Produces:
  - `ChatMessage` gains an optional `toolStub?: ToolCallStub` field.
  - `evictBelow` gains a third parameter `options?: { stubFloorSeq?: number }`. Tool-tier rows with `stubFloorSeq <= seq < toolFloorSeq` are degraded to `metadata` stubs in place instead of being dropped; rows below `toolFloorSeq` still collapse to `EvictedToolBurst` markers, unchanged.

- [ ] **Step 1: Write the failing test**

Append to `packages/client/src/lib/__tests__/event-reducer.evict-below.test.ts`:

```ts
import { evictBelow } from "../event-reducer.js";

describe("evictBelow stub rung", () => {
  function stateWithToolRows() {
    const base = createInitialState();
    return {
      ...base,
      messages: [
        { id: "u1", role: "user" as const, content: "go", timestamp: 1, seq: 1 },
        { id: "tool-a", role: "toolResult" as const, content: "Read", toolName: "Read", toolCallId: "a", result: "y".repeat(50_000), toolStatus: "complete" as const, timestamp: 2, startedAt: 2, seq: 2 },
        { id: "tool-b", role: "toolResult" as const, content: "Read", toolName: "Read", toolCallId: "b", result: "z".repeat(50_000), toolStatus: "complete" as const, timestamp: 3, startedAt: 3, seq: 5 },
      ],
    };
  }

  it("degrades a tool row between the stub floor and the tool floor instead of dropping it", () => {
    const out = evictBelow(stateWithToolRows(), { chatFloorSeq: 0, toolFloorSeq: 10 }, { stubFloorSeq: 2 });
    const rows = out.messages.filter((m) => m.role === "toolResult");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.toolStub?.detailLevel).toBe("metadata");
      expect(row.result).toBeUndefined();
      expect(row.toolStub!.fullBytes).toBe(50_000);
    }
    expect(out.evictedToolBursts).toHaveLength(0);
  });

  it("still collapses rows below the stub floor into EvictedToolBurst markers", () => {
    const out = evictBelow(stateWithToolRows(), { chatFloorSeq: 0, toolFloorSeq: 10 }, { stubFloorSeq: 6 });
    expect(out.messages.filter((m) => m.role === "toolResult")).toHaveLength(0);
    expect(out.evictedToolBursts.length).toBeGreaterThan(0);
  });

  it("never degrades a running tool row", () => {
    const state = stateWithToolRows();
    state.messages[1] = { ...state.messages[1]!, toolStatus: "running" as const };
    const out = evictBelow(state, { chatFloorSeq: 0, toolFloorSeq: 10 }, { stubFloorSeq: 2 });
    const running = out.messages.find((m) => m.toolCallId === "a")!;
    expect(running.toolStub).toBeUndefined();
    expect(running.result).toBe("y".repeat(50_000));
  });

  it("is a no-op on tool rows when stubFloorSeq is omitted (existing behavior preserved)", () => {
    const out = evictBelow(stateWithToolRows(), { chatFloorSeq: 0, toolFloorSeq: 3 });
    expect(out.messages.filter((m) => m.role === "toolResult").map((m) => m.toolCallId)).toEqual(["b"]);
    expect(out.evictedToolBursts).toEqual([{ fromSeq: 2, toSeq: 2, count: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- evict-below 2>&1 | tail -20
```
Expected: FAIL — `evictBelow` takes two parameters and `toolStub` is not on `ChatMessage`.

- [ ] **Step 3: Add `toolStub` to `ChatMessage`**

In `packages/client/src/lib/event-reducer.ts`, add to the `ChatMessage` interface (next to the `seq` field, ~line 104):

```ts
  /**
   * Set when this tool row's payload has been degraded to a stub — by server
   * hydration (the wire event carried `data.toolStub`) or by client eviction.
   * Mutually exclusive with `result`: whichever is present is what renders.
   * Re-inflate on demand via `fetch_tool_payload` keyed by `toolCallId`.
   * See change: hydration-tool-stub-projection.
   */
  toolStub?: ToolCallStub;
```

And add the import at the top of the file:

```ts
import { makeToolStub, type ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
```

- [ ] **Step 4: Teach `evictBelow` the stub rung**

Replace the `evictBelow` signature and its `TOOL_TIER_ROLES` branch (`packages/client/src/lib/event-reducer.ts:519-545`) with:

```ts
export function evictBelow(
  state: SessionState,
  floors: { chatFloorSeq: number; toolFloorSeq: number },
  options: { stubFloorSeq?: number } = {},
): SessionState {
  const protectedTool = (t: ToolCallState) => t.status === "running";
  const toolCalls = new Map(state.toolCalls);
  for (const [id, t] of state.toolCalls) {
    if (typeof t.seq === "number" && t.seq < floors.toolFloorSeq && !protectedTool(t)) {
      toolCalls.delete(id);
    }
  }
  const streamingIds = new Set(state.messages.filter((m) => m.isStreaming).map((m) => m.id));
  const evictedToolRowSeqs: number[] = [];
  // The degradation ladder's middle rungs. A tool row at or above
  // `stubFloorSeq` keeps its position and identity but sheds its payload,
  // becoming a `metadata` stub re-fetchable by `toolCallId`. Only BELOW the
  // stub floor does a row collapse into an `EvictedToolBurst` marker — the
  // ladder's bottom rung. Omitting `stubFloorSeq` reproduces the previous
  // drop-only behavior exactly.
  const stubFloor = options.stubFloorSeq;
  const messages = state.messages.flatMap((m) => {
    if (streamingIds.has(m.id) || typeof m.seq !== "number") return [m];
    if (TOOL_TIER_ROLES.has(m.role)) {
      if (m.toolStatus === "running") return [m];
      if (m.seq >= floors.toolFloorSeq) return [m];
      if (stubFloor !== undefined && m.seq >= stubFloor) {
        if (m.toolStub?.detailLevel === "metadata") return [m];
        const stub = makeToolStub({
          toolCallId: m.toolCallId ?? m.id,
          toolName: m.toolName ?? "unknown",
          args: m.args as Record<string, unknown> | undefined,
          result: m.result ?? "",
          status: m.toolStatus === "error" ? "error" : "ok",
          startedAt: m.startedAt ?? m.timestamp,
          ...(m.duration !== undefined ? { durationMs: m.duration } : {}),
          detailLevel: "metadata",
        });
        stub.fullBytes = m.toolStub?.fullBytes ?? (m.result?.length ?? 0);
        const { result: _dropped, ...rest } = m;
        return [{ ...rest, toolStub: stub }];
      }
      evictedToolRowSeqs.push(m.seq);
      return [];
    }
    return m.seq >= floors.chatFloorSeq ? [m] : [];
  });
```

The remainder of the function (`interactiveRequests` filter and the return object) is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- evict-below 2>&1 | tail -20
```
Expected: PASS, including the pre-existing tests in that file (the no-`stubFloorSeq` path is unchanged).

- [ ] **Step 6: Teach the reducer to read `data.toolStub` off the wire**

In the `case "tool_execution_end":` arm (`packages/client/src/lib/event-reducer.ts:1987`), after `const result = data.result !== undefined ? toDisplayString(data.result) : undefined;` add:

```ts
      // Hydration may deliver a stub instead of a payload. It sits at the same
      // seq with the same eventType, so the row is created/finalized in exactly
      // the position a full payload would have produced.
      const toolStub = data.toolStub as ToolCallStub | undefined;
```

Then add `...(toolStub ? { toolStub } : {}),` to BOTH message-object literals in that arm — the update at line 2039 and the push at line 2051.

- [ ] **Step 7: Run the full suite**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test 2>&1 | tee /tmp/t7.log; grep -nE 'FAIL|✗' /tmp/t7.log | head -30
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm run lint
```
Expected: PASS and clean.

- [ ] **Step 8: Update the AGENTS.md row and commit**

Extend the `event-reducer.ts` row purpose in `packages/client/src/lib/AGENTS.md`:

```
`evictBelow` takes optional `stubFloorSeq` — degrades tool rows to metadata stubs in place before collapsing them to `EvictedToolBurst`. `ChatMessage.toolStub` holds the degraded payload. See change: hydration-tool-stub-projection.
```

```bash
git add packages/client/src/lib/event-reducer.ts packages/client/src/lib/__tests__/event-reducer.evict-below.test.ts packages/client/src/lib/AGENTS.md
git commit -m "feat(client): degrade tool rows to stubs before collapsing them"
```

---

### Task 8: Stub row rendering and expand-to-fetch

**Files:**
- Create: `packages/client/src/components/ToolStubRow.tsx`
- Create: `packages/client/src/components/__tests__/ToolStubRow.test.tsx`
- Modify: `packages/client/src/components/ChatView.tsx` (Props + render switch)

**Interfaces:**
- Consumes: `ToolCallStub` (Task 2), `ToolPayloadCache` (Task 4), `ChatMessage.toolStub` (Task 7).
- Produces:
  - `function ToolStubRow(props: { stub: ToolCallStub; cached?: { payload: string; truncated: boolean }; loading?: boolean; error?: boolean; onFetch?: () => void }): JSX.Element`
  - `ChatView` Props gains `onFetchToolPayload?: (toolCallId: string) => void` and `toolPayloads?: ToolPayloadCache`.

- [ ] **Step 1: Write the failing test**

`packages/client/src/components/__tests__/ToolStubRow.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import { ToolStubRow } from "../ToolStubRow.js";

const stub: ToolCallStub = {
  toolCallId: "t1", toolName: "Read", argsSummary: 'Read("src/a.ts")',
  status: "ok", startedAt: 1, durationMs: 25, fullBytes: 2_411_724,
  head: "first bytes", tail: "last bytes", detailLevel: "sliced",
};

describe("ToolStubRow", () => {
  it("reports the unloaded size honestly", () => {
    render(<ToolStubRow stub={stub} />);
    expect(screen.getByTestId("tool-stub-row").textContent).toContain("2.3 MB not loaded");
  });

  it("renders head and tail slices at the sliced rung", () => {
    render(<ToolStubRow stub={stub} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain("first bytes");
    expect(text).toContain("last bytes");
  });

  it("renders metadata only at the metadata rung", () => {
    render(<ToolStubRow stub={{ ...stub, detailLevel: "metadata", head: undefined, tail: undefined }} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain('Read("src/a.ts")');
    expect(text).not.toContain("first bytes");
  });

  it("calls onFetch when the load affordance is clicked", () => {
    const onFetch = vi.fn();
    render(<ToolStubRow stub={stub} onFetch={onFetch} />);
    fireEvent.click(screen.getByTestId("tool-stub-load"));
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  it("renders the cached payload instead of slices once fetched", () => {
    render(<ToolStubRow stub={stub} cached={{ payload: "the whole thing", truncated: false }} />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain("the whole thing");
    expect(screen.queryByTestId("tool-stub-load")).toBeNull();
  });

  it("offers open-raw when the fetched payload was truncated", () => {
    render(<ToolStubRow stub={stub} cached={{ payload: "partial", truncated: true }} />);
    expect(screen.getByTestId("tool-stub-truncated")).toBeTruthy();
  });

  it("shows an error affordance without losing the stub metadata", () => {
    render(<ToolStubRow stub={stub} error />);
    const text = screen.getByTestId("tool-stub-row").textContent!;
    expect(text).toContain('Read("src/a.ts")');
    expect(screen.getByTestId("tool-stub-error")).toBeTruthy();
  });

  it("disables the load affordance while loading", () => {
    render(<ToolStubRow stub={stub} loading onFetch={() => {}} />);
    expect(screen.getByTestId("tool-stub-load")).toHaveProperty("disabled", true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- ToolStubRow 2>&1 | tail -15
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

`packages/client/src/components/ToolStubRow.tsx`:

```tsx
import type { ToolCallStub } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";

/** Human-readable byte size. `fullBytes` is the size NOT sent, so honesty matters. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders a tool call whose payload was degraded to a `ToolCallStub` — by
 * server hydration or by client eviction, indistinguishably.
 *
 * The row is self-describing: it never reads a sibling event. `fullBytes`
 * reports the size that was NOT loaded, so the row says "2.3 MB not loaded"
 * rather than implying the visible slice is the whole story.
 * See change: hydration-tool-stub-projection.
 */
export function ToolStubRow({
  stub, cached, loading, error, onFetch,
}: {
  stub: ToolCallStub;
  cached?: { payload: string; truncated: boolean };
  loading?: boolean;
  error?: boolean;
  onFetch?: () => void;
}) {
  const frame = "mx-4 border-l-2 border-[var(--border-secondary)] pl-3 py-1 text-xs";
  return (
    <div data-testid="tool-stub-row" className={frame}>
      <div className="text-[var(--text-secondary)] font-mono">{stub.argsSummary}</div>
      {cached ? (
        <>
          <pre className="whitespace-pre-wrap text-[var(--text-tertiary)]">{cached.payload}</pre>
          {cached.truncated ? (
            <span data-testid="tool-stub-truncated" className="text-[var(--text-tertiary)]">
              response capped — open raw for the rest
            </span>
          ) : null}
        </>
      ) : (
        <>
          {stub.head ? <pre className="whitespace-pre-wrap text-[var(--text-tertiary)]">{stub.head}</pre> : null}
          {stub.tail ? (
            <>
              <div className="text-[var(--text-tertiary)]">…</div>
              <pre className="whitespace-pre-wrap text-[var(--text-tertiary)]">{stub.tail}</pre>
            </>
          ) : null}
          <div className="text-[var(--text-tertiary)]">
            {formatBytes(stub.fullBytes)} not loaded
            {onFetch ? (
              <button
                type="button"
                data-testid="tool-stub-load"
                disabled={loading}
                onClick={onFetch}
                className="ml-2 underline cursor-pointer hover:text-[var(--text-secondary)] disabled:cursor-default"
              >
                {loading ? "loading…" : "load"}
              </button>
            ) : null}
          </div>
          {error ? (
            <span data-testid="tool-stub-error" className="text-[var(--text-tertiary)]">
              could not load — retry
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- ToolStubRow 2>&1 | tail -15
```
Expected: PASS.

- [ ] **Step 5: Render stub rows from ChatView**

In `packages/client/src/components/ChatView.tsx`:

1. Add to the Props interface, next to `onExpandEvictedBurst` (~line 131):

```ts
  /** Re-inflate a stubbed tool payload by id. See change: hydration-tool-stub-projection. */
  onFetchToolPayload?: (toolCallId: string) => void;
  toolPayloads?: ToolPayloadCache;
```

2. Add both to the `ChatViewInner` destructured parameter list (~line 378), next to `onExpandEvictedBurst`.

3. Add the imports:

```ts
import { ToolStubRow } from "./ToolStubRow.js";
import type { ToolPayloadCache } from "../lib/tool-payload-cache.js";
```

4. In the render switch, in the branch that renders a `toolResult` row, short-circuit to the stub row when the message carries one. A stubbed row occupies the same transcript position as the full row it replaces — this is a payload swap, never a reordering:

```tsx
              if (item.toolStub) {
                return (
                  <ToolStubRow
                    stub={item.toolStub}
                    cached={toolPayloads?.get(item.toolStub.toolCallId)}
                    onFetch={onFetchToolPayload ? () => onFetchToolPayload(item.toolStub!.toolCallId) : undefined}
                  />
                );
              }
```

Match the surrounding branch's exact variable name for the row (the file uses `item` in the `EvictedToolBurstMarkerRow` branch at line 1453) and place the check before the existing `ToolCallStep` render so a stub never falls through to the full-payload card.

5. In `chat-virtual-rows.ts`, `messageTextChars` reads `m.result?.length`. Add the stub's visible text so pre-measure estimates stay accurate:

```ts
function messageTextChars(m: ChatMessage): number {
  const stubChars = (m.toolStub?.head?.length ?? 0) + (m.toolStub?.tail?.length ?? 0);
  return m.content.length + (m.result?.length ?? 0) + stubChars;
}
```

- [ ] **Step 6: Run the full suite and typecheck**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test 2>&1 | tee /tmp/t8.log; grep -nE 'FAIL|✗' /tmp/t8.log | head -30
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm run lint
```
Expected: PASS and clean.

- [ ] **Step 7: Add the AGENTS.md row and commit**

In `packages/client/src/components/AGENTS.md`, path-alphabetically:

```
| `ToolStubRow.tsx` | Renders degraded tool call from `ToolCallStub`. Shows `argsSummary`, head/tail slices, "<N> not loaded", load affordance -> `fetch_tool_payload`. Self-describing — reads no sibling event. See change: hydration-tool-stub-projection. |
```

```bash
git add packages/client/src/components packages/client/src/lib/chat-virtual-rows.ts
git commit -m "feat(client): render tool stubs with load-on-demand affordance"
```

---

### Task 9: Budget sweep, golden session, and cache invalidation

**Files:**
- Create: `packages/shared/src/__tests__/projection-budget-sweep.test.ts`
- Modify: `packages/client/src/lib/replay-cache.ts` (version bump)
- Modify: `packages/shared/src/test-support/generate-session.ts` (golden fixture export)

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: no new production symbols beyond the cache version constant change.

- [ ] **Step 1: Write the budget sweep test**

`packages/shared/src/__tests__/projection-budget-sweep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyToolBudget, selectNewestEventsByBudget, TOOL_CEILING_FRACTION } from "../event-window.js";
import { coalesceProjection } from "../replay-projection.js";
import { ALL_SCENARIOS, generateSession } from "../test-support/generate-session.js";

const BUDGETS = [1.5 * 1024 * 1024, 1024 * 1024, 512 * 1024, 256 * 1024, 128 * 1024, 64 * 1024, 32 * 1024, 16 * 1024];

describe("budget sweep", () => {
  it("honors the tool ceiling at every budget", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 7);
      for (const budget of BUDGETS) {
        const out = applyToolBudget(coalesceProjection(raw), budget);
        expect(out.toolBytes, `${scenario}@${budget}`).toBeLessThanOrEqual(
          Math.max(Math.floor(budget * TOOL_CEILING_FRACTION), out.toolBytes === 0 ? 0 : out.toolBytes),
        );
      }
    }
  });

  it("keeps the projected range contiguous at every budget", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 7);
      for (const budget of BUDGETS) {
        const out = applyToolBudget(coalesceProjection(raw), budget).events;
        for (let i = 1; i < out.length; i += 1) {
          expect(out[i]!.seq, `${scenario}@${budget}`).toBe(out[i - 1]!.seq + 1);
        }
      }
    }
  });

  it("the window selector accepts every projected range (never malformed)", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 7);
      for (const budget of BUDGETS) {
        const projected = applyToolBudget(coalesceProjection(raw), budget).events;
        const window = selectNewestEventsByBudget(projected, budget);
        expect(window.sourceMalformed, `${scenario}@${budget}`).toBeUndefined();
      }
    }
  });

  it("a tool-heavy session retains at least one chat event at every budget", () => {
    const raw = generateSession("subagent-burst", 7);
    for (const budget of BUDGETS) {
      const projected = applyToolBudget(coalesceProjection(raw), budget).events;
      const window = selectNewestEventsByBudget(projected, budget);
      const chatEvents = window.events.filter(
        (e) => e.event.eventType === "message_start" || e.event.eventType === "message_end",
      );
      expect(chatEvents.length, `budget ${budget}`).toBeGreaterThan(0);
    }
  });

  it("hasMoreOlder is accurate at every budget", () => {
    const raw = generateSession("subagent-burst", 7);
    for (const budget of BUDGETS) {
      const projected = applyToolBudget(coalesceProjection(raw), budget).events;
      const window = selectNewestEventsByBudget(projected, budget);
      expect(window.hasMoreOlder, `budget ${budget}`).toBe(window.events.length < projected.length);
    }
  });

  it("load-older advances to a strictly older range instead of stranding (#101)", () => {
    const raw = generateSession("subagent-burst", 7);
    const budget = 128 * 1024;
    const projected = applyToolBudget(coalesceProjection(raw), budget).events;
    let cursor = projected.at(-1)!.seq + 1;
    const seen = new Set<number>();
    for (let page = 0; page < 5; page += 1) {
      const older = projected.filter((e) => e.seq < cursor);
      if (older.length === 0) break;
      const window = selectNewestEventsByBudget(older, budget);
      expect(window.events.length, `page ${page} must not be empty`).toBeGreaterThan(0);
      const min = window.windowMinSeq!;
      expect(seen.has(min), `page ${page} must not repeat window start ${min}`).toBe(false);
      seen.add(min);
      expect(min).toBeLessThan(cursor);
      cursor = min;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic across the whole sweep", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 7);
      for (const budget of BUDGETS) {
        const a = JSON.stringify(applyToolBudget(coalesceProjection(raw), budget));
        const b = JSON.stringify(applyToolBudget(coalesceProjection(raw), budget));
        expect(a, `${scenario}@${budget}`).toEqual(b);
      }
    }
  });
});
```

- [ ] **Step 2: Run the sweep**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- projection-budget-sweep 2>&1 | tee /tmp/t9.log; grep -n -A 20 'FAIL ' /tmp/t9.log | head -40
```
Expected: PASS. A failure here is a real budget-algorithm defect — fix `applyToolBudget` in Task 5's file, do not relax the sweep.

- [ ] **Step 3: Bump the client replay-cache version**

Entries written by PR #102 must be discarded — the affected sessions simply re-hydrate. Find the version constant:

```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && rg -n "VERSION|version" packages/client/src/lib/replay-cache.ts | head -20
```

Increment that constant by one and extend its doc comment with:

```
// Bumped for hydration-tool-stub-projection: pre-projection entries and any
// residue from the reverted PR #102 are discarded; affected sessions re-hydrate.
```

- [ ] **Step 4: Run the cache tests**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test -- replay-cache 2>&1 | tail -20
```
Expected: PASS. If a test asserts the literal old version number, update it to the new one.

- [ ] **Step 5: Run the full suite, typecheck, and pre-commit**

Run:
```bash
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm test 2>&1 | tee /tmp/t9-all.log; grep -nE 'FAIL|✗' /tmp/t9-all.log | head -30
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && PATH=/home/joe/.nvm/versions/node/v22.22.2/bin:$PATH npm run lint
cd /home/joe/code/zge-workspace/worktrees/omp-dashboard/hydration-tool-stub && pre-commit run --all-files
```
Expected: full suite green (baseline before this work was 11362 passed / 22 skipped / 1175 files — the count should be strictly higher now), `tsc --noEmit` clean, pre-commit clean.

Do NOT claim completion until you have seen all three pass. Paste the actual counts.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/__tests__/projection-budget-sweep.test.ts packages/client/src/lib/replay-cache.ts
git commit -m "test: add projection budget sweep and bump replay cache version"
```

---

## Deferred, tracked separately

- **Golden captured-session test.** The spec asks for a real captured session asserted end to end. There is a candidate capture at `omp-session-2026-07-19T19-20-49-562Z_019f7bd2-f09a-7000-905a-369b9d0a1df2.html` in the workspace root, but it is an HTML export, not JSONL — converting it is its own task and the generated corpus in Task 1 already covers every scenario the spec enumerates. Open a follow-up issue rather than blocking this work.
- **Issue #77 closure.** This design supplies the id-addressable fetch #77 asked for (`fetch_tool_payload` keyed by `toolCallId`). Whether #77 closes on merge is the maintainer's call — raise it on the PR, do not close it unilaterally.
