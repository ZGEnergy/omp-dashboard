## REMOVED Requirements

### Requirement: Architect sessions render as single-card flow dashboard
**Reason**: Upstream pi-flows deleted the flow-architect agent and its entire event lifecycle (remove-flow-architect). No `flow_started` event for an architect agent is ever emitted again, so there is nothing to render.
**Migration**: Author flows from the main session via the `edit-flow` skill; authoring appears as ordinary `flow_write`/`flow_agents` tool-call cards (see `flow-authoring-renderers`).

### Requirement: Architect tool calls visible in card
**Reason**: The architect agent and its `agent_catalog`/`agent_write`/`flow_write`/`flow_preview`/`skill_read` tool-call stream were removed upstream.
**Migration**: `flow_write` and `flow_agents` tool calls now render in the main-session chat timeline via the `flow-authoring-renderers` capability.

### Requirement: Architect decisions forwarded via UI proxy
**Reason**: The architect's save/replan/cancel `ui.select()` decision lifecycle was removed with the architect.
**Migration**: None — human steering happens directly in the main session via the `edit-flow` skill.

### Requirement: Agent detail available for architect
**Reason**: There is no architect card to open a detail view for.
**Migration**: None.
