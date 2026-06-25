## Context

`packages/flows-plugin/` was built for the pre-rework pi-flows model. Seven recent pi-flows changes (archived in the pi-flows repo: remove-flow-architect, add-code-node, node-failure-model, enhance-agent-node-contract, unify-decision-routing, harden-flow-wiring, add-edit-mode-toggle) changed the engine out from under it:

- flow-architect is deleted; no `flow:architect-*` / `architect_*` event is ever emitted again.
- Authoring is now main-session tool calls (`flow_write`, `flow_agents`); `/flows:new` and `/flows:edit` are gone.
- New step kinds `code` and `code-decision`; `conditional` and `agent-loop-decision` removed; loop = backward edge + `max_iterations`.
- Failure model gained soft/hard outcomes; agents gained validated typed outputs.
- Edit-mode is driven by an inbound `flow:set-edit-mode { enabled }` event the dashboard emits.

The dashboard plugin runtime already exposes every API this rework needs: the `tool-renderer` slot (`ToolRendererSlot`, manifest `{ slot:"tool-renderer", toolName, component }`), the `ui:markdown-content` primitive (auto-renders ```mermaid fences via `MermaidBlock` with zoom/pan), and the settings pattern (`usePluginConfig` + `plugin_config_write` + `useSettingsDraftSource`, as used by `automation-plugin`).

This is a dashboard-repo-only change. pi-flows already ships the engine + events.

## Goals / Non-Goals

**Goals:**
- Render the new running node kinds (`code`, `code-decision`) with outputs and soft/hard failure states.
- Render authoring tool calls (`flow_write`, `flow_agents`) in the chat timeline via tool-renderer claims.
- Provide a global edit-mode default that auto-reconciles to sessions via `flow:set-edit-mode`.
- Delete all dead flow-architect code, events, and claims.
- Keep the live FlowGraph minimal (names + running highlight); details live in the cards.

**Non-Goals:**
- Changing pi-flows engine behavior or event payloads (verify-only; file a follow-up if a field is missing).
- Animating the live graph or embedding rich custom blocks in graph nodes (cards carry detail).
- Replaying old persisted architect runs.
- A per-project settings UI beyond the per-session override toggle.

## Decisions

**D1 — Two render paths.** Authoring tool calls run in the main session, so they arrive as ordinary tool-call timeline entries and render through the `tool-renderer` slot. Running steps keep flowing through `FLOW_EVENT_MAP` → flow-reducer → flow card grid. *Alternative:* synthesize fake flow events for authoring — rejected; authoring is not a flow run and would pollute the grid.

**D2 — Graph renderer split by context.** Live running graph stays the existing React/dagre `FlowGraph`, kept minimal (names + running-step highlight), extended with `code`/`code-decision` shapes and backward edges. The static authoring snapshot in the `flow_write` card uses Mermaid via `ui:markdown-content`. *Alternative:* Mermaid everywhere — rejected; live highlight/animation would require per-event re-render + injected CSS, while React/dagre binds to live state natively and the user wants the live graph minimal anyway. *Alternative:* dagre everywhere — rejected; Mermaid is ~free for the one-shot snapshot and matches the mockup.

**D3 — Render from the real tool contract; parse args for richer body.** Results carry only `{written,name,namespace,command,path,diagnostics[]}` / catalog array. The graph snapshot + step/agent counts are parsed client-side from the tool ARGS (submitted YAML). Diagnostics drive success/error states. *Alternative:* lobby pi-flows to enrich the result — rejected; cross-repo coupling for data already present in the args. *Alternative:* fetch canonical file from disk — deferred; args are zero-latency and equal the disk content on success.

**D4 — Edit-mode = global default, reconciled to session.** A global plugin-config default is the single source of truth. On flows-plugin availability per session (existing `flowsAvailability`/`flow:rediscover` hook), the dashboard emits `flow:set-edit-mode { enabled: globalDefault }`; pi-flows persists it to that project's local `.pi/settings.json`. An optional per-session subcard toggle overrides without touching the global. *Alternative:* per-session prompts — rejected (decision bloat). *Alternative:* literal global-only with no local write — rejected; pi-flows can only honor the project setting, so the dashboard must write it down.

**D5 — New/Edit launches the skill, never authors.** The launcher builds `/skill:edit-flow [name]` and fires the shared `onSendPrompt` prop, identical to the OpenSpec action buttons (`SessionOpenSpecActions` / `NewChangeDialog`). The dashboard never calls `flow_write` itself — human steering stays in the session.

**D7 — Replay is generic; the new nodes ride it for free if their data is in the event payload.** pi-flows persists the raw `flow:*` stream as `flow-event` session entries (`flow-session-persistence`); on reload `replayEntriesAsEvents` (`packages/shared/src/state-replay.ts`) re-forwards each record verbatim (`makeEvent(eventType, data)`, duck-typed, kind-agnostic) and the idempotent `reduceFlowEvent` rebuilds the timeline. `code`/`code-decision` REUSE the `flow:agent-started`/`flow:agent-complete` event names (per unify-decision-routing), so persistence, `FLOW_EVENT_MAP`, and replay already cover them with **no new entry**. The pi-flows `surface-node-kind` change finalizes the contract this relies on: `nodeKind`, typed `outputs`/`branch`, and the soft/hard outcome live INSIDE the event `data` (emitted by every executor, forwarded through the FlowManager seam). The card type is decided once at `started` from `nodeKind`. Every new reducer case is a pure idempotent fold. The `↻ n/max` loop pill derives from the persisted `flow_loop_iteration` event, not a runtime counter. Authoring cards (`flow_write`/`flow_agents`) are main-session tool calls that replay via pi's ordinary tool-entry replay, reconstructing the snapshot/view-file from the persisted args. *Alternative:* persist a `FlowState` snapshot per node — rejected (duplicates the fold, drops unknown kinds).

**D8 — Resolve in-flight cards when the flow ends.** `flow_complete` marks the flow terminal but does not downgrade step cards still `running`. With the clear-orphaned reconciliation emitting a synthesized `flow:complete { status: "interrupted" }` on resume of a dead run, a `code` node started-without-completion would otherwise spin forever. The reducer (or card) SHALL render non-terminal cards as interrupted once the flow is terminal. *Alternative:* leave as-is — rejected; the new code cards would visibly hang on every interrupted run.

**D6 — Delete architect outright.** Remove `architect-reducer.ts`, `FlowArchitect*.tsx`, `ArchitectInputPrompt`, their tests, the two architect slot claims, and the 14 `architect_*` `FLOW_EVENT_MAP` entries. *Alternative:* keep dormant for replay — rejected; events are dead, old runs predate the new model, and the dead code is the plugin's biggest confusion source.

## Risks / Trade-offs

- **Cross-repo version skew** → the `nodeKind` contract is owned by the pi-flows `surface-node-kind` change; a dashboard running against an older pi-flows (no `nodeKind`) must not break. Mitigation: the reducer reads `nodeKind` when present and falls back to an agent card otherwise (same fallback covers runs persisted before `surface-node-kind`). The dashboard change lands independently.
- **Client-side YAML parse of tool args can drift from pi-flows' parser** → keep the parse shallow (steps, kinds, edges, counts) and degrade gracefully (omit graph/counts, keep success state) rather than erroring.
- **Architect deletion is breaking for any external consumer of those events/claims** → acceptable; events are already dead upstream and this is a coordinated rework.
- **Data not in the event payload** → resolved upstream: `surface-node-kind` guarantees `nodeKind`/`branch`/outcome ride inside `data` and forward through FlowManager (the historic drop that motivated `surface-node-kind`). Task 1 now consumes that finalized contract rather than verifying an assumption; the agent-card fallback still covers pre-contract persisted runs on replay.
- **Best-effort flush** → flow events buffer in the parent session until its first assistant flush; a kill before flush loses unwritten events (pre-existing, unchanged by this work).
- **Global→local edit-mode write touches project settings on session connect** → only fires on the availability signal and is idempotent (same value re-emitted); pi-flows ignores no-op/invalid payloads.

## Migration Plan

1. Land event-map + reducer changes (kind/outcome passthrough, drop architect mappings) — backward-safe: unknown kinds already fall back to agent rendering.
2. Add node cards (code/code-decision/outputs/soft-hard) behind the new kinds.
3. Extend FlowGraph node set; remove dead `conditional`/`agent-loop-decision`/`loopTarget` branches.
4. Add tool-renderer claims + authoring cards + New/Edit launcher.
5. Add edit-mode settings section + reconcile emission + subcard toggle/gating.
6. Delete architect code/claims/tests last (after consumers stop referencing them).
7. Rebuild: `npm run build` → `POST /api/restart` → `npm run reload`.

Rollback: revert the change; the plugin returns to the architect-era renderers (which only mis-render against the new engine, no data loss).

## Resolved (pinned from surface-node-kind, task 1.1/1.2)

- **Field name:** `nodeKind` (renamed from `kind` to avoid colliding with the `text|thinking|tool|error` timeline-entry kind). Rides inside `flow:agent-started` / `flow:agent-complete` `data`, forwarded verbatim by the bridge catch-all (no `FLOW_EVENT_MAP` entry).
- **Taxonomy:** `agent | agent-decision | code | code-decision | fork | flow-ref`.
- **Card type decided once at `started`**; the reducer sets `nodeKind` there and does not change it at complete.
- **Chosen branch:** `result.typedOutputs.branch` on the completion event (code-decision). Mirror fallback `data.branch`.
- **Code handler target:** `data.target` on the `started` event (resolved path; full source NOT captured).
- **Outcome:** `result.outcome` (`success|soft|hard`), fallback `data.outcome`, else derived from `result.success`.
- **Unknown/missing nodeKind** → agent card (additive tag; baseline rendering never breaks).

## Open Questions
- Whether the global edit-mode reconcile should also fire on an explicit global-config change (re-push to all connected available sessions), or only on per-session availability. Lean: both, but per-session availability is the must-have.
