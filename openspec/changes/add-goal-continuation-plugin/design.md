## Context

Port Hermes `/goal` (judge-driven cross-turn continuation, the "Ralph loop") into the dashboard as a plugin. The dashboard-agnostic core already exists in `@ricoyudog/pi-goal-hermes`. Three grounded code traces fixed the architecture; this document records the four load-bearing decisions and the timing facts that force them.

### Established facts (from traces)

- **`bridgeFollowUp` lifecycle** (`packages/extension/src/bridge.ts`): `bufferFollowupSend(text)` pushes only while `isAgentStreaming === true` (cap 20). On `agent_end`, `isAgentStreaming` flips `false` FIRST, then `setTimeout(() => drainFollowupQueue(0), 0)` is scheduled. `drainFollowupQueue` gates on `isDraining` lock, non-empty buffer, `!ctx.hasPendingMessages()`, and `ctx.isIdle()` (retry 20×100ms). It POPs one entry then `pi.sendUserMessage(entry)` (no `deliverAs`) = fresh turn. One entry per `agent_end`.
- **Why a naive port deadlocks**: the port's judge runs inside its own `agent_end` handler and is async (~500ms model call). By the time it resolves, (a) `isAgentStreaming` is already `false` so `bufferFollowupSend` no-ops, and (b) the bridge's `setTimeout(0)` drain already ran against an empty buffer. A late push lands in a buffer nothing re-drains → stall.
- **TUI surfaces don't cross the bridge**: `ctx.ui.setStatus` / `notify` / `registerMessageRenderer` produce zero dashboard output. The forwarded event allowlist (`bridge.ts` ~1143) carries core pi events only.
- **Plugin three-part model** (`flows-plugin`): `bridge/` entry auto-registers as a pi extension (`settings.json#dashboardPluginBridges` → `packages[]`) and receives full `ExtensionAPI`; `server/` gets `ServerPluginContext` (`registerPiHandler` / `registerBrowserHandler` / `broadcastToSubscribers` / `sessionManager` / `eventStore`); `client/` ships its own reducer (`useSessionEvents`) + slot UI. Plugins coordinate with the main bridge via `pi.events.emit/on` (proven: `prompt:register-adapter` → `promptBus.registerAdapter`).

## Goals / Non-Goals

**Goals**
- Judge-driven continuation loop usable in dashboard sessions.
- Goal status visible as a live chip; goal controllable from the web UI.
- Zero edits to the shared protocol union, the shell `event-reducer.ts`, or slash routing.
- Continuations cannot race or double-inject against user follow-ups.

**Non-Goals (v1)**
- Typed `/goal` in the dashboard chat input (needs Path C RPC keeper / dead Path B; UI control covers the need).
- Image-bearing continuations (inherits `bridgeFollowUp` text-only limit).
- Changing the standalone `@ricoyudog/pi-goal-hermes` package.

## Decision 1: Vendor the judge core, replace only injection + UX

**Choice:** Copy `judge-service.ts`, `goal-manager.ts` (`evaluateWithJudge`), `goal-state.ts`, `continuation-prompt.ts` from `@ricoyudog/pi-goal-hermes` into `packages/goal-plugin/src/bridge/`. Replace `index.ts` turn-injection (`queueContinuation` → emit `dashboard:enqueue-followup`) and delete all TUI UX (`setStatus` / `notify` / `registerMessageRenderer`) in favour of `goal_status` broadcasts.

**Rationale:** The judge + state machine + continuation-prompt builder are pure logic with no dashboard or TUI coupling — verified by reading them. Only the two surfaces that don't cross the bridge (injection, UX) need replacing.

**Rejected:** (a) Depend on the npm package as-is — its `index.ts` runs a parallel `sendUserMessage` engine (Decision 2 forbids). (b) Reimplement the judge from scratch — wasteful; the port is correct.

## Decision 2: ONE continuation engine via `enqueueSystemFollowup`

**Choice:** Add `enqueueSystemFollowup(text)` to the main bridge: push into `bridgeFollowUp` WITHOUT the `isAgentStreaming` gate, then `setTimeout(() => drainFollowupQueue(0), 0)`. Expose it through `pi.events.on("dashboard:enqueue-followup", e => enqueueSystemFollowup(e.text))`. The plugin bridge emits that event on a "continue" verdict and NEVER calls `pi.sendUserMessage`.

**Rationale:** Collapses user follow-ups and goal continuations into the single existing drain path. `isDraining` lock + one-entry-per-`agent_end` already serialize them; no new race surface. Defeats both timing walls: the ungated push survives the closed `isAgentStreaming` gate, and the explicit drain schedule re-runs after the judge resolves. Generic — any plugin can request a system follow-up.

**Ordering:** push to the BACK of `bridgeFollowUp` (default) so a user follow-up queued mid-goal-turn wins; goal continuation rides the next `agent_end`. (Front-insert via the existing `unshift` primitive is a config knob if "goal authoritative" is wanted later.)

**Rejected:** (a) Parallel `queueContinuation` (the port's approach) — two engines racing `isIdle()` → double turns. (b) Reuse `bufferFollowupSend` directly — its `isAgentStreaming` gate is shut at judge time → silent no-op + stall.

## Decision 3: Plugin-owned status via snapshot broadcast (mirror `queue_update`)

**Choice:** The plugin server caches the latest `goal_status` per session and `broadcastToSubscribers` on change, replaying on (re)subscribe — identical semantics to the core `queue_update` snapshot (`protocol.ts:8`). The plugin client reducer keys on its OWN message type; a `GoalChip` slot reads it. No `goal_status` in the shared protocol union, no `case` in the shell `event-reducer.ts`.

**Rationale:** Goal status is a single current value, not a log — snapshot model fits (survives reconnect, no replay-the-whole-log rebuild). Plugins already own reducers + slots (flows intents prove it end-to-end). Keeps core untouched.

**Rejected:** (a) Add `goal_status` to the shared union + shell reducer + a shell `GoalChip` — edits core for plugin-local data. (b) `rawEvent` JSON card (the `default:` fallback) — works with zero code but is unreadable; unacceptable as the primary UX.

## Decision 4: Control via `plugin_action`, not slash dispatch

**Choice:** Set / pause / resume / done / clear / subgoal originate from a plugin client control (input + buttons) that dispatches `plugin_action` over the existing plugin action bridge; the plugin server `registerBrowserHandler("plugin_action", …)` applies them (forwarding set/control intents to the bridge via `pi.events` where they must reach the session). No `/goal` slash command in v1.

**Rationale:** Bypasses the documented extension-slash-command routing bug (`docs/slash-command.md`) entirely — works in headless AND terminal-hosted sessions, with no dependency on the dead Path B (`pi.dispatchCommand` absent at pi 0.74.1) or the headless-only Path C RPC keeper. Flows already uses `plugin_action` this way.

**Rejected:** Register `/goal` via `pi.registerCommand` — only routes in dashboard chat through Path C (headless-spawned sessions only); tmux/Windows-Terminal sessions get the error toast. Deferred to a follow-up once upstream ships `dispatchCommand`.

## Risks / Trade-offs

- **Core coupling**: the plugin depends on `enqueueSystemFollowup` existing in the main bridge → versioned together. Mitigated: the primitive is generic and small; document the `dashboard:enqueue-followup` event contract in `docs/`.
- **Judge cost/latency**: a model call per turn. Mitigated: fast model + `maxTurns` budget (default 20) + the port's 3-strikes-unparseable pause.
- **Reload semantics**: active goal + session reload → pause with reason `"reload"` (port behaviour), resume from UI. Avoids a runaway loop across reconnects.
- **Vendor drift**: vendored judge files fork from upstream `@ricoyudog/pi-goal-hermes`. Mitigated: record the source commit in a header comment; the files are small and stable.

## Migration / Rollout

Additive. Install the plugin → autonomous loop + chip + control appear. Uninstall → bridge hooks dormant, chip hidden, `bridgeFollowUp` reverts to user-only follow-ups. The `enqueueSystemFollowup` primitive is inert when no plugin emits `dashboard:enqueue-followup`.
