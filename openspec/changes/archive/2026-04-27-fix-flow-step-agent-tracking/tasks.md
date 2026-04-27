## 1. Pi-flows: Add missing lifecycle events

- [x] 1.1 Add `onAgentStarted`/`onAgentComplete` calls to `executeAgentDecisionStep` in `flow-execution.ts` (wrap around `spawnAgent()` call at line ~743)
- [x] 1.2 Add `onAgentStarted`/`onAgentComplete` calls to `executeAgentLoopDecisionStep` in `flow-execution.ts` (after `onLoopIteration`, wrap around `spawnAgent()` call at line ~809)
- [x] 1.3 Add `onAgentStarted`/`onAgentComplete` calls to `spawnForkDecisionAgent` in `flow-execution.ts` (wrap around `spawnAgent()` call at line ~585)

## 2. Pi-flows: Fix TUI card rendering with renderBox()

- [x] 2.1 Refactor `agent-card.ts` to use `renderBox()` from `box-renderer.ts` instead of manually building `┌─┐ │ └─┘` borders — SKIPPED: card borders work correctly, the actual bug was grid truncation. renderBox refactor deferred as cosmetic.
- [x] 2.2 Update `grid-component.ts` to compute row height from actual rendered card line count instead of hardcoded `CARD_HEIGHT=8`

## 3. Dashboard: Add stepType to FlowAgentState

- [x] 3.1 Add optional `stepType?: string` field to `FlowAgentState` in `packages/shared/src/types.ts`
- [x] 3.2 Populate `stepType` in the `flow_started` handler in `flow-reducer.ts` by looking up step type from `dagSteps` when creating agent entries

## 4. Dashboard: Fix graph node styling

- [x] 4.1 Revert diamond polygon rendering in `FlowGraph.tsx` back to uniform rectangles (solid border, rx=5) for all node types
- [x] 4.2 Remove all border style differences (no dashed, no double border, no different rx) — keep uniform styling
- [x] 4.3 Add label prefix icons per step type: `◇` for fork/decision, `↻` for loop, `?` for conditional (no prefix for regular agent)

## 5. Dashboard: Graph edge completeness

- [x] 5.1 In `agentsToGraphSteps()` (FlowDashboard.tsx and FlowSummary.tsx), synthesize implicit edges: for each step with empty `blockedBy` (except the first), add an edge from the previous separator step in dagSteps order
- [x] 5.2 Add `exitTarget` edges: for `agent-loop-decision` steps, add the exit_target step's blockedBy to include the loop step ID
- [x] 5.3 Verify the graph shows a fully connected flow for `flow-test.yaml` (generate-code → pick-style → branches → validate-transform → quality-loop → final-summary)

## 6. Dashboard: Agent card visual distinction

- [x] 6.1 Add step type badge/icon to `FlowAgentCard.tsx` header — show `◇ Fork`, `↻ Loop`, or `◇ Decision` badge for non-agent step types
- [x] 6.2 Filter out steps without agents from card rendering in `FlowDashboard.tsx` (conditional steps, flow-ref without agent)
- [x] 6.3 Update `FlowSummary.tsx` agent list to show step type indicator per entry

## 7. Testing

- [x] 7.1 Update `event-reducer-flow.test.ts` to verify `stepType` is populated on `FlowAgentState` entries
- [x] 7.2 Verify existing tests pass after all changes
- [x] 7.3 Build client and restart server, manually test with `flow-test` flow
