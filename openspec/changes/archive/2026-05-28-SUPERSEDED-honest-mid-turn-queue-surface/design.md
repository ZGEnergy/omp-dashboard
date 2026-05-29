# Design — honest-mid-turn-queue-surface

## Goal

Make the dashboard tell the truth about what pi's extension API supports for the mid-turn message queue. Delete the code that pretends otherwise.

## What pi actually exposes (verified)

Source-checked against `@earendil-works/pi-coding-agent@0.75.5` and the 0.76.0 floor scheduled by `bump-pi-compat-to-0-76`.

### On the `pi` ExtensionAPI object handed to extensions

| Method | Status | Effect |
|---|---|---|
| `pi.sendUserMessage(text, {deliverAs: "steer" \| "followUp"})` | ✅ exposed | Appends to the matching pi queue. |
| `pi.abort()` (and `ctx.abort()`) | ✅ exposed | Calls `AbortController.abort()` on the active run. **Does NOT touch queues.** |
| `pi.clearSteeringQueue()` | ❌ not exposed | `(pi as any).clearSteeringQueue?.()` evaluates to `undefined` and silently does nothing. |
| `pi.clearFollowUpQueue()` | ❌ not exposed | Same. |
| `pi.clearAllQueues()` | ❌ not exposed | Same. |
| `pi.getSteeringMessages()` / `getFollowUpMessages()` | ❌ not exposed | Bridge can't introspect pi's real queue — must maintain its own shadow. |
| Anything on `ctx.sessionManager` for queues | ❌ none | `SessionManager` has session-CRUD methods, no queue methods. |

### Inside pi-coding-agent (NOT reachable from extensions)

- `Agent.clearSteeringQueue()` / `clearFollowUpQueue()` / `clearAllQueues()` exist on the inner Agent class (`pi-agent-core`).
- `AgentSession.clearQueue()` exists and atomically returns the drained text + clears both pi's real queue and the session's own shadow.
- `interactive-mode.ts` calls `clearAllQueues()` via `alt+up` ("yank to editor"). This is pi-TUI's affordance, not an extension affordance.

The wall between these and the extension API is the entire reason this change exists.

## What the bridge does today (and why most of it is wrong)

```
┌──────────────────────────────────────────────────────────────┐
│  client sends remove_followup_entry { index: 2 }             │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  bridge.ts handler:                                          │
│    - mutates bridgeFollowUp shadow (UI source of truth)      │
│    - calls rewriteFollowupQueue([surviving entries])         │
│         which calls (pi as any).clearFollowUpQueue?.()       │
│           ← NO-OP (undefined method)                         │
│         then re-sends survivors via                          │
│           pi.sendUserMessage(t, {deliverAs:"followUp"})      │
│           ← APPENDS to pi's REAL queue                       │
└────────────────────────┬─────────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  pi's real queue now contains:                               │
│    [α, β, γ, α_resent, γ_resent]                            │
│  bridge shadow shows: [α, γ]                                 │
│  user sees: [α, γ]                                           │
│  pi delivers at agent_end: ALL FIVE                          │
└──────────────────────────────────────────────────────────────┘
```

Recorded empirically in `QueuePanel.tsx` header comment, with the test artifact path `/tmp/pi-queue-experiment.mjs` (no longer in tree but documented). The function is broken by construction; no parameter tweak fixes it.

## What stays (and why it is honest)

### Add-side: `pi.sendUserMessage(text, {deliverAs})`

Pi supports it. The bridge already forwards `send_prompt` to it correctly. The shadow's `bridgeSteering.push(text)` / `bridgeFollowUp.push(text)` mirrors the real append. ✅

### Drain-side: bridge intercepts `message_start` events

When pi drains its queue and emits a `user` `message_start` event, the bridge matches the text against the shadow front and splices it (bridge.ts:1214-1232). This is the only mechanism that keeps the shadow honest with pi's actual deliveries. ✅

### Display: read-only `QueuePanel` for follow-up; inline ghost bubbles for steering

`QueuePanel.tsx` shows follow-up entries with `↑`/`↓` cycler. `ChatView.tsx` L506-558 renders each steering entry as a ghost user-message bubble labeled "steering". Both feed from the same `pendingQueues` cache populated by `queue_update` events. ✅

### Cancel-side: `ctx.abort()` cancels the turn, leaves queues alone

`Agent.abort()` only calls `abortController.abort()`. Queued messages persist; they drain when the next prompt arrives. The Stop button label stays unchanged per user direction; users learn the semantics from the QueuePanel subtitle ("delivered when the agent finishes the turn"). ✅

## What gets deleted (and why deletion is safer than dormant)

### Option A — leave dead code with comments (REJECTED)

```ts
// Pi 0.75.5 doesn't expose clearFollowUpQueue. This handler is a no-op.
// TODO: re-enable when upstream pi exposes the method.
if (msg.type === "remove_followup_entry") { /* mutates shadow, lies */ }
```

Why rejected: a future contributor reading the handler sees it run, sees the shadow change, sees the `queue_update` fire, sees the UI update. The lie is invisible at the call site. Empirical bug recurrence has happened before in this codebase (drain matcher had to be added later to plug the original desync).

### Option B — aggressive delete (CHOSEN)

```ts
// no handler. Server-side message reaches the bridge, falls through the
// commandHandler default arm, ignored. Client never sends it because the
// sender is deleted. Protocol type is deleted, so the wire schema rejects
// it at the boundary.
```

Why chosen: removes the attractor surface entirely. The negative-assertion tests (Tasks §7) lock in the absence: if any future PR re-introduces a `remove_followup_entry` handler or message type, the test fails. Upstream pi adding the missing methods would be tracked as a new OpenSpec change, not a silent dependency.

### Option C — keep handlers as honest no-ops (REJECTED for steering / follow-up specific handlers)

The handlers currently:
1. Mutate the shadow (wrong).
2. Call `pi.clear*Queue?.()` (no-op, harmless).
3. Re-send survivors (wrong — appends ghosts).

A "honest no-op" version would just emit `queue_update` with the existing shadow + `command_feedback` saying "not supported". This is more code than deletion and serves the same purpose as "client doesn't send the message in the first place". Not worth keeping.

The defensive `(pi as any).clear*Queue?.()` calls in the `abort:` and `shutdown:` arms ARE deleted in this change. They are no-ops; their presence implies "we clear pi's queues on shutdown" which is provably false. If upstream pi adds the methods later, a new change can re-introduce them with passing tests.

## Spec deltas — the lies being retracted

### Lie 1: "depth-1 follow-up invariant"

Spec text:
> "the bridge SHALL call `pi.clearFollowUpQueue()` THEN `pi.sendUserMessage(text, { deliverAs: "followUp" })`. The clear-then-send sequence enforces a depth-1 invariant on pi's follow-up queue"

Reality: `clearFollowUpQueue` is a no-op. The "invariant" was never enforced. Pi's queue can hold N entries; the dashboard happens to send one at a time but nothing stops the bridge / pi from queueing more.

Replacement: append-only semantics. Multiple follow-up entries are valid. FIFO drain at `agent_end`.

### Lie 2: "Follow-up send while slot is occupied replaces the entry"

Spec scenario asserts "original lost; replace semantics by design". Implementation appends. Two entries are delivered, original first.

Replacement: scenario showing two follow-up sends → two queued entries → both deliver in FIFO order at `agent_end`.

### Lie 3: "Clear all" + per-chip mutation affordances

Spec mandates `clear_queue { sessionId }` button and `remove_queue_entry` per-chip button. Neither exists in UI; both would silently produce ghost duplicates if implemented (see "What the bridge does today"). The "Clear all" message type isn't even in the wire protocol — only the per-target `clear_steering_queue` / `clear_followup_slot` made it in, and both are dead.

Replacement: explicit "read-only" requirement. New requirement forbidding mutation protocol messages.

## Risks

### R1 — silent regression if pi adds the methods upstream and a future PR re-wires the bridge but forgets the spec

Mitigation: the negative-assertion tests assert the **absence** of `clear*Queue` calls in the bridge's abort/shutdown paths. Adding them back without updating the spec + this change fails CI.

### R2 — tests that exercised the dead handlers may have covered surviving behavior incidentally

Mitigation: §7 of tasks reads each test file before delete/rewrite. Any survivor coverage is migrated to a focused test for the surviving behavior (shadow drain, display, sendUserMessage append).

### R3 — wire-protocol type deletion breaks server-side forwarding code

Mitigation: server's `case` arms for these messages are explicitly searched and deleted as part of §4. The discriminated-union narrowing in `browser-protocol.ts` catches any stray references at compile time.

### R4 — users had built workflows around the (broken) mutation surface

Assessment: impossible. QueuePanel is already read-only in main. No user has ever seen a working mutation affordance. The deletion is pure attractor-surface removal.

## Out of scope

- **Upstream pi PR** exposing `clearFollowUpQueue` / `clearSteeringQueue` to extensions. Filed as a tracked task (§8) but not blocking on it.
- **Restoring mutation later**. If upstream lands, a new change `restore-mid-turn-queue-mutation` re-introduces the protocol + handlers + UI affordances WITH the now-working `pi.clear*Queue()` underneath. Spec deltas in that future change will re-add the requirements this change removes.
- **Stop button label / tooltip rework**. User direction: leave unchanged.
- **Steering display rework**. Steering already renders correctly as inline ghost bubbles in ChatView; not touched.
