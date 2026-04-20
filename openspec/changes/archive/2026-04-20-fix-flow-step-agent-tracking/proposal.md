## Why

Pi-flows has 6 step types but only `agent` steps emit lifecycle events (`onAgentStarted`/`onAgentComplete`). Decision step types (`fork`, `agent-decision`, `agent-loop-decision`) spawn real LLM agents but never notify observers — making them invisible to both the TUI dashboard and web dashboard. After the first agent step completes, the UI freezes with no progress indication until the entire flow finishes.

Additionally, the dashboard graph renders all node types identically, the TUI card grid truncates the bottom border when alias lines are present, and the web agent cards don't visually distinguish decision/loop steps from worker agents.

## What Changes

- **Add missing `onAgentStarted`/`onAgentComplete` calls** in pi-flows `flow-execution.ts` for `executeAgentDecisionStep`, `executeAgentLoopDecisionStep`, and `spawnForkDecisionAgent`
- **Add `stepType` field to `FlowAgentState`** so the dashboard can distinguish worker agents from decision/loop/fork agents
- **Propagate `stepType` through `flow_started` → `flow_agent_started` events** so cards know their type from the start
- **Fix graph node rendering** — revert oversized diamond shapes to rectangles with subtle border/icon differences per step type
- **Fix TUI card height** — `CARD_HEIGHT=8` in `grid-component.ts` truncates the bottom border when an alias line is present (9 lines rendered, 8 read)
- **Visually distinguish decision/loop agent cards** on both web and TUI with type-specific icons or accent colors
- **Fix interactive fork steps** — these don't spawn agents and should NOT appear as agent cards; they should be control-flow-only graph nodes

## Capabilities

### New Capabilities
- `flow-step-type-tracking`: Track step type (agent, fork, agent-decision, agent-loop-decision, conditional, flow-ref) through events and display type-appropriate UI for each

### Modified Capabilities
- `flow-event-bridge`: Decision step types must emit `onAgentStarted`/`onAgentComplete` events so the bridge forwards them to the dashboard
- `flow-card-status`: Agent cards must display differently for decision/loop/fork step types vs regular worker agents
- `flow-card-grid`: TUI card grid must handle variable card heights (alias line makes cards 9 lines instead of 8)

## Impact

- **pi-flows** (`extensions/flow-engine/flow-execution.ts`): 3 functions need `onAgentStarted`/`onAgentComplete` calls added
- **pi-flows** (`extensions/flow-dashboard/grid-component.ts`): `CARD_HEIGHT` constant needs to be dynamic or increased
- **pi-agent-dashboard shared** (`packages/shared/src/types.ts`): `FlowAgentState` needs `stepType` field
- **pi-agent-dashboard client** (`packages/client/src/components/FlowGraph.tsx`): Node rendering per step type
- **pi-agent-dashboard client** (`packages/client/src/components/FlowAgentCard.tsx`): Card visual distinction per step type
- **pi-agent-dashboard client** (`packages/client/src/lib/flow-reducer.ts`): Populate `stepType` from dagSteps data
- **pi-agent-dashboard client** (`packages/client/src/components/FlowDashboard.tsx`): Filter interactive-only steps from agent cards
