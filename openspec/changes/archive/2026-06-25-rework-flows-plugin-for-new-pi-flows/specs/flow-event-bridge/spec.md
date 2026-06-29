## ADDED Requirements

### Requirement: Lifecycle events carry nodeKind and failure outcome

The bridge's `FLOW_EVENT_MAP` passthrough SHALL preserve the `nodeKind` discriminator (`"agent" | "agent-decision" | "code" | "code-decision" | "fork" | "flow-ref"`) and the node failure outcome (`"success" | "soft" | "hard"`) on forwarded lifecycle events, so the dashboard can render distinct node cards and soft-vs-hard failure states without re-deriving them. Per the pi-flows `surface-node-kind` change, `nodeKind` is emitted by every executor, forwarded through the FlowManager seam, and carried inside the event `data` (the dashboard only preserves it; it does not synthesize it).

#### Scenario: nodeKind forwarded
- **WHEN** pi-flows emits `flow:agent-started` / `flow:agent-complete` for a step carrying `nodeKind: "code-decision"` in its `data`
- **THEN** the forwarded `flow_agent_started` / `flow_agent_complete` events SHALL retain `nodeKind: "code-decision"`

#### Scenario: Pre-contract runs lack nodeKind
- **WHEN** a forwarded lifecycle event has no `nodeKind` (a run persisted before `surface-node-kind`)
- **THEN** the passthrough SHALL forward the event unchanged and the dashboard SHALL treat the step as an agent card

#### Scenario: Failure outcome forwarded
- **WHEN** a step completes with a soft failure (routed to `on_error`) or a hard failure (flow halted)
- **THEN** the forwarded completion event SHALL carry the outcome so the card can distinguish soft from hard

### Requirement: Dashboard emits inbound flow:set-edit-mode

The bridge SHALL accept a dashboard-originated request to set edit-mode and emit `flow:set-edit-mode { enabled }` on `pi.events` for pi-flows to handle (persist `flows.editFlow`, sync skill visibility, reconcile tools, live-reload).

#### Scenario: Edit-mode request forwarded to pi.events
- **WHEN** the dashboard sends a set-edit-mode request with `{ enabled: true }`
- **THEN** the bridge SHALL emit `pi.events.emit("flow:set-edit-mode", { enabled: true })`

#### Scenario: Non-boolean enabled ignored
- **WHEN** a set-edit-mode request arrives without a boolean `enabled`
- **THEN** the bridge SHALL NOT emit the event

## REMOVED Requirements

### Requirement: Bridge emits flows:new-request for /flows:new
**Reason**: Upstream pi-flows deleted the `/flows:new` command and the flow-architect authoring path (remove-flow-architect). Authoring now happens via the `edit-flow` skill and main-session `flow_write`/`flow_agents` tool calls.
**Migration**: Use the New/Edit launcher, which issues `/skill:edit-flow [name]` via `onSendPrompt`; the bridge no longer special-cases `/flows:new`.

### Requirement: Bridge emits flows:edit-request for /flows:edit
**Reason**: Upstream pi-flows deleted the `/flows:edit` command alongside the flow-architect removal.
**Migration**: Use the New/Edit launcher (`/skill:edit-flow [name]`); the bridge no longer special-cases `/flows:edit`.
