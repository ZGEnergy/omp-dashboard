# @tintinweb/pi-subagents Dashboard Integration

## Status: BLOCKED — Awaiting Upstream Fixes

This document describes the integration of `@tintinweb/pi-subagents` (v0.5.2) into the pi-agent-dashboard. The integration is implemented but **cannot be properly tested or used** due to upstream issues in the pi-subagents extension. This document serves as a complete reference for reverting the changes and re-implementing when the upstream issues are resolved.

---

## Table of Contents

- [Problem Summary](#problem-summary)
- [Architecture Overview](#architecture-overview)
- [Upstream Issues](#upstream-issues)
- [New Files Created](#new-files-created)
- [Modified Files](#modified-files)
- [How to Revert](#how-to-revert)
- [How to Re-implement](#how-to-re-implement)
- [OpenSpec Artifacts](#openspec-artifacts)
- [Research Files](#research-files)

---

## Problem Summary

### What we tried to build
Dashboard integration that monitors `@tintinweb/pi-subagents` activity — showing agent cards, status badges, and result previews when subagents are spawned.

### Why it doesn't work

Three upstream issues in `@tintinweb/pi-subagents` prevent proper functionality:

1. **Foreground agents don't emit lifecycle events.** The `subagents:created` event is only emitted in the `if (runInBackground)` code path (index.ts line 760). The `subagents:completed` and `subagents:failed` events are only emitted from the `onComplete` callback, which is only called when `options.isBackground === true` (agent-manager.ts line 194). Foreground agents emit `subagents:started` (from `onStart`, line 122) but nothing else — creating ghost cards stuck in "running" state forever.

2. **Foreground agents don't forward the abort signal.** The `Agent` tool's `execute` function receives a `signal` parameter (index.ts line 723), but the foreground path calls `manager.spawnAndWait()` (line 925) without passing `signal`. The inner `AgentSession` has no abort wiring, so pressing Stop in the dashboard cannot kill a running foreground subagent.

3. **Global manager doesn't expose abort methods.** The `Symbol.for("pi-subagents:manager")` global registry (index.ts line 416) only exposes `waitForAll`, `hasRunning`, `spawn`, `getRecord`. It does NOT expose `abort(id)`, `abortAll()`, or `listAgents()`. This prevents external code (like our bridge) from stopping agents.

### Additional testing limitation

The pi harness's built-in `Agent` tool always runs agents in foreground mode regardless of the `run_in_background: true` parameter. When sending prompts to other sessions via the dashboard API, the LLM also consistently chooses foreground execution. This means we cannot trigger real background agent spawning to test the integration.

---

## Architecture Overview

The integration follows the exact same pattern as the existing pi-flows integration:

```
@tintinweb/pi-subagents          Dashboard Bridge            Dashboard Server         Browser Client
─────────────────────          ─────────────────            ─────────────────         ──────────────
pi.events.emit(                pi.events.on(                event_forward msg         reduceSubagentEvent()
  "subagents:created")  ──►      "subagents:created") ──►   stored + broadcast  ──►  SubagentState update
  "subagents:started"              → event_forward msg       extractSessionUpdates    SubagentDashboard
  "subagents:completed"                                      → session field update   SubagentCard
  "subagents:failed"                                                                  SubagentActivityBadge
  "subagents:steered"
```

### Event mapping

| pi-subagents event | Dashboard event type | When emitted |
|---|---|---|
| `subagents:created` | `subagent_created` | Background agent spawned (NOT foreground) |
| `subagents:started` | `subagent_started` | Agent transitions to running (both foreground AND background) |
| `subagents:completed` | `subagent_completed` | Background agent finishes successfully (NOT foreground) |
| `subagents:failed` | `subagent_failed` | Background agent fails (NOT foreground) |
| `subagents:steered` | `subagent_steered` | Steering message sent to running agent |

### The asymmetry problem

`subagents:started` fires for ALL agents, but `subagents:created` and `subagents:completed/failed` only fire for BACKGROUND agents. This creates orphaned "running" cards for foreground agents. The workaround implemented: the client-side reducer only creates entries on `subagent_created` and ignores `subagent_started` for unknown agent IDs.

---

## Upstream Issues

### Issue 1: Missing lifecycle events for foreground agents

**File:** `@tintinweb/pi-subagents/src/index.ts`

**Location of `subagents:created`** (line ~760, inside `if (runInBackground)` block):
```typescript
if (runInBackground) {
  // ...
  id = manager.spawn(pi, ctx, subagentType, params.prompt, { ... });
  pi.events.emit("subagents:created", { id, type, description, isBackground: true });
  return textResult(`Agent started in background...`);
}
// Foreground path below — NO created event emitted
```

**Location of `subagents:completed`** (`@tintinweb/pi-subagents/src/agent-manager.ts`, line ~194):
```typescript
if (options.isBackground) {
  this.runningBackground--;
  this.onComplete?.(record);  // ← onComplete triggers subagents:completed
  this.drainQueue();
}
// Foreground: onComplete is never called
```

**Fix needed:** Emit `subagents:created` and call `onComplete` for foreground agents too.

### Issue 2: Missing abort signal forwarding

**File:** `@tintinweb/pi-subagents/src/index.ts`

**Foreground execution path** (line ~925):
```typescript
const record = await manager.spawnAndWait(pi, ctx, subagentType, params.prompt, {
  description: params.description,
  model,
  maxTurns: effectiveMaxTurns,
  isolated,
  inheritContext,
  thinkingLevel: thinking,
  isolation,
  ...fgCallbacks,
  // ← signal is NOT passed here!
});
```

**Fix needed:** Add `signal` to the options object. The `SpawnOptions` type doesn't include `signal`, so it would also need to be wired through `spawn()` → `startAgent()` → `runAgent()`.

### Issue 3: Limited global manager API

**File:** `@tintinweb/pi-subagents/src/index.ts` (line ~416):
```typescript
(globalThis as any)[MANAGER_KEY] = {
  waitForAll: () => manager.waitForAll(),
  hasRunning: () => manager.hasRunning(),
  spawn: (piRef, ctx, type, prompt, options) => manager.spawn(piRef, ctx, type, prompt, options),
  getRecord: (id) => manager.getRecord(id),
  // Missing: abort(id), abortAll(), listAgents()
};
```

**Fix needed:** Expose `abort`, `abortAll`, and `listAgents` on the global manager.

---

## New Files Created

### 1. `src/extension/subagent-event-wiring.ts`
Bridge event listener module. Registers listeners for 5 `subagents:*` events on `pi.events` and forwards each as an `event_forward` protocol message. Guards with `isSessionReady()` check. Same pattern as `flow-event-wiring.ts`.

### 2. `src/client/lib/subagent-reducer.ts`
Client-side pure reducer. Exports `isSubagentEvent(eventType)` and `reduceSubagentEvent(state, event)`. Handles 5 event types: `subagent_created` (creates agent entry with "queued" status), `subagent_started` (updates to "running" — only for existing entries), `subagent_completed` (updates status + stats), `subagent_failed` (updates status + error), `subagent_steered` (no-op, returns state unchanged).

### 3. `src/client/components/SubagentActivityBadge.tsx`
Session card badge component. Shows `🤖 {count} agents · {running} running` in teal/cyan color. Shows "all completed" when `running === 0 && done >= count`. Returns null when `count <= 0`.

### 4. `src/client/components/SubagentCard.tsx`
Individual agent card component. Shows status icon (colored by state), agent type name (bold), description, stats line (tool uses, tokens, duration), error message, steered note. Completed agents have a click-to-expand result preview (collapsible `<pre>` block, truncated to 2000 chars).

### 5. `src/client/components/SubagentDashboard.tsx`
Sticky panel component above ChatView. Shows header with `🤖 Subagents · {done}/{total} done`, auto-fill grid of `SubagentCard` components (200px min-width). Mobile: collapsed bar that expands on tap. Returns null when no agents.

### 6. `src/client/lib/__tests__/subagent-reducer.test.ts`
10 unit tests covering: `isSubagentEvent` recognition, created/started/completed/failed/steered reducer behavior, unknown agent handling, multiple agents.

### 7. `src/server/__tests__/event-status-extraction-subagent.test.ts`
5 unit tests covering: created/started/completed/failed sentinel values, steered returns null.

### 8. `docs/subagent-ui-plan.md`
Visual mockups and screen plans for the subagent UI (created during design phase).

### 9. `openspec/changes/subagent-integration/`
OpenSpec change artifacts: `proposal.md`, `design.md`, `specs/` (4 spec files), `tasks.md`.

---

## Modified Files

### 1. `src/shared/types.ts`

**Added to `DashboardSession` interface** (after `flowStatus` field):
```typescript
subagentCount?: number;
subagentRunning?: number;
subagentDone?: number;
```

**Added after `FlowState` interface** (before `ApiResponse`):
```typescript
export type SubagentStatus = "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error";

export interface SubagentAgentState {
  id: string;
  type: string;
  description: string;
  status: SubagentStatus;
  isBackground?: boolean;
  toolUses?: number;
  durationMs?: number;
  tokens?: { input: number; output: number; total: number };
  result?: string;
  error?: string;
}

export interface SubagentState {
  agents: Map<string, SubagentAgentState>;
}
```

### 2. `src/extension/bridge.ts`

**Added import** (line 34):
```typescript
import { registerSubagentEventListeners } from "./subagent-event-wiring.js";
```

**Added call in session_start handler** (after `registerFlowEventListeners`):
```typescript
registerSubagentEventListeners(syncBc(), () => sessionReady);
```

### 3. `src/server/event-status-extraction.ts`

**Added to `SessionUpdates` type:**
```typescript
subagentCount?: number;
subagentRunning?: number;
subagentDone?: number;
```

**Added cases to `extractSessionUpdates` switch** (after `flow_complete`):
```typescript
case "subagent_created":
  return { subagentCount: -1 };
case "subagent_started":
  return { subagentRunning: -1 };
case "subagent_completed":
case "subagent_failed":
  return { subagentDone: -1, subagentRunning: -2 };
```

### 4. `src/server/event-wiring.ts`

**Added sentinel resolution block** (after `flowAgentsDone` sentinel handling):
```typescript
const subSentinel = updates.subagentCount === -1 || updates.subagentRunning === -1 || updates.subagentDone === -1;
if (subSentinel) {
  const session = sessionManager.get(sessionId);
  if (updates.subagentCount === -1) updates.subagentCount = (session?.subagentCount ?? 0) + 1;
  if (updates.subagentRunning === -1) {
    if ((session?.subagentCount ?? 0) > 0) {
      updates.subagentRunning = (session?.subagentRunning ?? 0) + 1;
    } else {
      delete updates.subagentRunning;
    }
  }
  if (updates.subagentRunning === -2) updates.subagentRunning = Math.max(0, (session?.subagentRunning ?? 0) - 1);
  if (updates.subagentDone === -1) updates.subagentDone = (session?.subagentDone ?? 0) + 1;
}
```

### 5. `src/client/lib/event-reducer.ts`

**Changed import** (added `FlowState, SubagentState`):
```typescript
import type { DashboardEvent, FlowState, SubagentState } from "../../shared/types.js";
```

**Added import:**
```typescript
import { isSubagentEvent, reduceSubagentEvent } from "./subagent-reducer.js";
```

**Added to `SessionState` interface:**
```typescript
subagentState: SubagentState | null;
```

**Added to `createInitialState()`:**
```typescript
subagentState: null,
```

**Added to reducer default case** (after flow event delegation):
```typescript
if (isSubagentEvent(event.eventType)) {
  next.subagentState = reduceSubagentEvent(next.subagentState, event);
}
```

### 6. `src/client/App.tsx`

**Added import:**
```typescript
import { SubagentDashboard } from "./components/SubagentDashboard.js";
```

**Added SubagentDashboard render** (after FlowDashboard, before ErrorBoundary/ChatView):
```tsx
{selectedState.subagentState && selectedState.subagentState.agents.size > 0 && (
  <div className="sticky top-0 z-[9]">
    <SubagentDashboard subagentState={selectedState.subagentState} />
  </div>
)}
```

### 7. `src/client/components/SessionCard.tsx`

**Added import:**
```typescript
import { SubagentActivityBadge } from "./SubagentActivityBadge.js";
```

**Added badge render in TWO locations** (mobile card ~line 389, desktop card ~line 570 — both after `FlowActivityBadge`):
```tsx
{(session.subagentCount ?? 0) > 0 && (
  <SubagentActivityBadge
    count={session.subagentCount!}
    running={session.subagentRunning ?? 0}
    done={session.subagentDone ?? 0}
  />
)}
```

### 8. `AGENTS.md`

Added 3 key file entries to the Key Files table:
- `src/extension/subagent-event-wiring.ts`
- `src/client/lib/subagent-reducer.ts`
- `src/client/components/SubagentDashboard.tsx`, `SubagentCard.tsx`, `SubagentActivityBadge.tsx`

### 9. `docs/architecture.md`

Added "Subagent Dashboard Data Flow" section (16 lines) after the "Flow Dashboard Data Flow" section.

---

## How to Revert

To completely remove this integration:

### Delete new files
```bash
# Keep docs/plans/tintinweb-subagents.md — this revert/reimplementation guide
rm src/extension/subagent-event-wiring.ts
rm src/client/lib/subagent-reducer.ts
rm src/client/lib/__tests__/subagent-reducer.test.ts
rm src/client/components/SubagentActivityBadge.tsx
rm src/client/components/SubagentCard.tsx
rm src/client/components/SubagentDashboard.tsx
rm src/server/__tests__/event-status-extraction-subagent.test.ts
rm docs/subagent-ui-plan.md
rm -rf openspec/changes/subagent-integration/
```

### Revert modified files

**`src/shared/types.ts`:**
- Remove `subagentCount`, `subagentRunning`, `subagentDone` from `DashboardSession`
- Remove `SubagentStatus`, `SubagentAgentState`, `SubagentState` types and comment

**`src/extension/bridge.ts`:**
- Remove import of `registerSubagentEventListeners`
- Remove the `registerSubagentEventListeners(syncBc(), () => sessionReady)` call and its comment

**`src/server/event-status-extraction.ts`:**
- Remove `subagentCount`, `subagentRunning`, `subagentDone` from `SessionUpdates` type
- Remove `subagent_created`, `subagent_started`, `subagent_completed`, `subagent_failed` cases

**`src/server/event-wiring.ts`:**
- Remove the entire `subSentinel` block (the `const subSentinel = ...` through the closing `}`)

**`src/client/lib/event-reducer.ts`:**
- Change import to: `import type { DashboardEvent, FlowState } from "../../shared/types.js";` (keep `FlowState` — it was missing before and was added as a bug fix alongside the subagent work)
- Remove `import { isSubagentEvent, reduceSubagentEvent }` import
- Remove `subagentState: SubagentState | null` from `SessionState`
- Remove `subagentState: null` from `createInitialState()`
- Remove the `isSubagentEvent` block in the reducer default case

**`src/client/App.tsx`:**
- Remove `import { SubagentDashboard }` import
- Remove the `SubagentDashboard` render block (the `{selectedState.subagentState && ...}` block)

**`src/client/components/SessionCard.tsx`:**
- Remove `import { SubagentActivityBadge }` import
- Remove BOTH `SubagentActivityBadge` render blocks (mobile ~line 389 and desktop ~line 570)

**`AGENTS.md`:**
- Remove the 5 subagent key file entries

**`docs/architecture.md`:**
- Remove the "Subagent Dashboard Data Flow" section

---

## How to Re-implement

When the upstream issues are fixed, re-implementing is straightforward:

### Prerequisites (upstream fixes needed)

1. **`@tintinweb/pi-subagents` emits `subagents:created` for foreground agents** — move the `pi.events.emit("subagents:created", ...)` call before the `if (runInBackground)` check, or emit in both paths
2. **`@tintinweb/pi-subagents` emits `subagents:completed/failed` for foreground agents** — call `this.onComplete?.(record)` in the foreground path too (after `spawnAndWait` resolves)
3. **`@tintinweb/pi-subagents` forwards abort signal** — pass `signal` through `spawnAndWait` → `spawn` → `startAgent` → `runAgent`
4. **Global manager exposes `abort`/`abortAll`** — add to the `Symbol.for("pi-subagents:manager")` object

### Re-implementation steps

1. Restore all files listed above (new files + modifications)
2. The client-side reducer's `subagent_started` handler can be relaxed to create entries again (the foreground ghost card issue will be fixed upstream):
   ```typescript
   case "subagent_started": {
     // With upstream fix, can create entries here too
     agents.set(id, { ...(existing ?? { id, type, description }), status: "running" });
   }
   ```
3. The server-side `subagent_started` guard (`if ((session?.subagentCount ?? 0) > 0)`) can be removed
4. Add abort wiring: in `command-handler.ts` abort case, call `mgr.abortAll()` via the global manager (once it's exposed)
5. Test with real background agents to verify the full lifecycle
6. Rebuild and deploy: `npm run build && curl -X POST http://localhost:8000/api/restart && npm run reload`

### Optional future enhancements

- **Live tool activity**: pi-subagents doesn't emit per-tool events on `pi.events`. Could read JSONL transcripts from `/tmp/pi-subagents-{uid}/` for richer data.
- **Steer from dashboard**: Use `subagents:rpc:stop` to send steering messages from the browser.
- **Spawn from dashboard**: Use `subagents:rpc:spawn` to create agents from the browser UI.

---

## OpenSpec Artifacts

Location: `openspec/changes/subagent-integration/`

| Artifact | Description |
|----------|-------------|
| `proposal.md` | Motivation, capabilities, impact |
| `design.md` | 6 technical decisions, event mapping, risks |
| `specs/subagent-event-bridge/spec.md` | Bridge forwarding requirements + scenarios |
| `specs/subagent-client-state/spec.md` | Reducer + server extraction requirements |
| `specs/subagent-card-grid/spec.md` | Dashboard panel + card requirements |
| `specs/subagent-activity-badge/spec.md` | Session card badge requirements |
| `tasks.md` | 18 implementation tasks (all completed) |

---

## Research Files

| File | Description |
|------|-------------|
| `docs/subagent-ui-plan.md` | Visual screen plan mockups (4 screens) |
| This file | Complete integration documentation |

---

## References

- **@tintinweb/pi-subagents repo:** https://github.com/tintinweb/pi-subagents
- **npm package:** `@tintinweb/pi-subagents` (v0.5.2)
- **pi-flows repo (for comparison):** https://github.com/BlackBeltTechnology/pi-flows
- **Event bus:** `@mariozechner/pi-coding-agent/dist/core/event-bus.js` — single `EventEmitter` shared across all extensions via `createExtensionAPI()` (confirmed: `pi.events` is the same object for all extensions in a session)
