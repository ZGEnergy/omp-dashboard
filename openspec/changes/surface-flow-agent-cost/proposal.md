## Why

pi-flows now emits per-agent USD cost on `flow:agent-complete` (change `surface-agent-node-cost` in `~/BB/pi-packages/pi-flows`): `result.cost` rides the event and the bridge's catch-all forwards the event `data` verbatim, so the value already *arrives* at the dashboard client. But the flows-plugin drops it — the reducer does not read `result.cost`, `FlowAgentState` has no `cost` field, and neither `FlowAgentCard` nor `FlowAgentDetail` render it. The pi-flows TUI card shows spend next to tokens; the web dashboard still shows only `↑12k ↓3k · 4.2s`. This closes that parity gap so operators see per-agent spend in the browser too.

## What Changes

- `FlowAgentState` gains an optional `cost?: number` (USD), a sibling of the existing `tokens` field.
- The `flow_agent_complete` reducer case reads `result.cost` and stores it on the agent state (mirroring how it already reads `result.tokens`).
- `FlowAgentCard` appends a `$` segment to its complete-state stats line (`↑12k ↓3k · $0.0142 · 4.2s`) only when `cost > 0`, mirroring the existing token/duration suppression and matching pi-flows' `formatCost` precision (`$0.01` when ≥ 1, `$0.0142` sub-dollar).
- `FlowAgentDetail` header shows cost alongside the tokens/duration it already displays, when present and nonzero.
- No transport or event-contract change: the bridge already forwards `result.cost` verbatim. No new dependency.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `flow-agent-card`: the card SHALL display accumulated per-agent USD cost from the completion event's `result.cost`, next to tokens and duration, suppressed when zero/absent.
- `flow-agent-detail`: the detail header SHALL show per-agent USD cost alongside tokens and duration, when present and nonzero.

## Impact

- **Code:** `packages/shared/src/types.ts` (`FlowAgentState.cost`), `packages/flows-plugin/src/flow-reducer.ts` (`flow_agent_complete` case reads/stores cost), `packages/flows-plugin/src/client/FlowAgentCard.tsx` (render + a `formatCost` helper), `packages/flows-plugin/src/client/FlowAgentDetail.tsx` (header render).
- **Events/API:** none. `flow_agent_complete` already carries `result.cost` (forwarded verbatim by the bridge EventBus catch-all); this change only consumes it.
- **Dependencies:** relies on pi-flows `surface-agent-node-cost` being present in the connected pi session. When absent, `result.cost` is `undefined` and the dashboard degrades to today's tokens-only display.
- **Docs:** per-file rows in `packages/flows-plugin/src/client/AGENTS.md` and `packages/shared/src/AGENTS.md` as needed.
