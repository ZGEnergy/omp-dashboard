## Context

Pi-flows defines 6 step types: `agent`, `fork`, `conditional`, `agent-decision`, `agent-loop-decision`, `flow-ref`. Only `agent` steps emit `onAgentStarted`/`onAgentComplete` observer callbacks. Three decision step types (`fork` autonomous, `agent-decision`, `agent-loop-decision`) call `spawnAgent()` directly without notifying observers, making them invisible to both TUI and web dashboards.

The dashboard data model uses `FlowState.agents` (a Map keyed by step ID) to track step execution state, and `FlowState.dagSteps` (an array) for graph rendering. Neither carries step type information through to the UI components, so all cards and graph nodes look identical.

The TUI card grid uses a hardcoded `CARD_HEIGHT=8` which truncates the bottom border when an alias line is present (9 lines rendered).

## Goals / Non-Goals

**Goals:**
- Decision agents (fork/agent-decision/agent-loop-decision) emit lifecycle events so dashboards show real-time progress
- Each step type has visually distinct rendering in graph and agent cards
- TUI card grid handles variable card heights without truncation
- Interactive-only fork steps (no agent spawn) show as graph-only nodes, not agent cards

**Non-Goals:**
- Refactoring `FlowAgentState` to a more accurate name (e.g., `FlowStepState`) — too much churn
- Adding loopback edges to the DAG graph for loop visualization — complex layout, defer
- Persisting flow state across server restarts — separate concern

## Decisions

### 1. Add event emission in pi-flows execution handlers

Add `onAgentStarted`/`onAgentComplete` calls wrapping the `spawnAgent()` call in three functions:
- `executeAgentDecisionStep` (line 717)
- `executeAgentLoopDecisionStep` (line 769, after the existing `onLoopIteration` call)
- `spawnForkDecisionAgent` (line 549)

The `agentName` parameter uses `step.agent` and `stepId` uses `step.id`, matching the pattern in `executeAgentStep`.

**Alternative considered**: Wrapping `spawnAgent()` itself to always emit events. Rejected because `spawnAgent` is a low-level function used in other contexts (tests, one-off agents) where observer notification doesn't apply.

### 2. Propagate `stepType` through events to dashboard

Add `stepType` field to:
- `FlowAgentState` in `types.ts` (optional string)
- The `flow_started` event already sends `stepType` per step in `dagSteps`; populate `FlowAgentState.stepType` from this during `flow_started` reduction

The `flow_agent_started` event doesn't need to carry `stepType` — the reducer already has it from the initial `dagSteps` array.

### 3. Graph node styling: rectangles with icon indicators

Revert the diamond `<polygon>` rendering to rectangles for ALL node types. Keep uniform border styling (solid, rx=5). Differentiate ONLY via a small icon prefix in the label text:
- Agent steps: no prefix (default)
- Fork/decision steps: `◇` prefix
- Loop-decision steps: `↻` prefix
- Conditional steps: `?` prefix

No border changes, no fill changes, no shape changes. Just icon indicators in the label. This keeps the graph clean and readable.

### 4. Graph edge completeness: implicit sequential edges

Currently the graph only draws edges from explicit `blockedBy` arrays. But flows have implicit sequential ordering:
- **Segment ordering**: Non-agent steps (fork, loop-decision) act as segment separators. Steps in the next segment implicitly depend on the separator completing.
- **Loop exit_target**: `agent-loop-decision` has an `exit_target` pointing to the next step — this is an implicit edge.
- **Fork branches**: `fork.branches[option]` points to the branch step — the branch depends on the fork completing.

The `dagSteps` array already carries `loopTarget`/`exitTarget`. The graph builder (`agentsToGraphSteps`) should synthesize additional edges:
1. For `agent-loop-decision` steps: add `exitTarget` as a dependency of that target (i.e., `final-summary.blockedBy` should include `quality-loop`)
2. For steps with no `blockedBy` that appear after a separator step in the YAML order: infer an edge from the preceding separator

The simplest approach: walk `dagSteps` in order. For each step with empty `blockedBy` (except the first step), look at the previous step in the array — if the previous step is a separator (fork/conditional/loop-decision), add an edge from that separator to this step. Also add `exitTarget → step` edges for loop-decision steps.

### 5. Web agent cards: type-specific icon badges

Use `stepType` on `FlowAgentState` to:
- Show a type badge/icon in the card header (e.g., "◇ Fork" or "↻ Loop")
- Use a subtle left-border accent color: blue for agent, amber for fork/decision, purple for loop
- Cards for steps without agents (interactive fork, conditional) are NOT rendered — they only appear in the graph

### 5. TUI card rendering: use renderBox() helper

The `agent-card.ts` manually builds borders (`┌─┐`, `│...│`, `└─┘`) and the grid uses a hardcoded `CARD_HEIGHT=8` which truncates when optional lines are present. Refactor the card to use the existing `renderBox()` helper from `box-renderer.ts`, which correctly handles border rendering and produces the exact number of lines needed.

The grid's `CARD_HEIGHT` then becomes the rendered output length from `renderBox()`, computed per-row as `Math.max(...rowCards.map(c => c.render(...).length))`. This avoids truncation and eliminates duplicated border logic.

### 6. Filter agent cards: only show steps that spawn agents

Steps without agents (interactive fork, conditional, flow-ref) should not appear as cards. The `flow_started` handler in the reducer should only create `FlowAgentState` entries for steps where `step.agent` is defined. Steps without agents are graph-only.

For interactive forks (user selects an option): the step has `agent` defined in the YAML (for auto-decide fallback) but may not actually spawn it. The card should still exist but may show "pending" or "waiting for user" until/unless the agent is spawned.

## Risks / Trade-offs

- **[Risk] Fork step with optional agent creates card that may never activate** → Acceptable; card shows "pending" which correctly indicates the step hasn't been reached yet. If the user picks interactively, the card stays pending — this is less confusing than having it appear/disappear dynamically.

- **[Risk] Multiple steps sharing same agent name confuse `findAgent()` lookup** → Current `findAgent()` searches by both key (stepId) and agentName field. When `flow_agent_started` fires with `agentName="fork-transformer"` and multiple steps use that agent, `findAgent` returns the first match. This is acceptable because pi-flows dispatches agents sequentially within a segment — the first unresolved match is the correct one.

- **[Trade-off] Dynamic TUI card height may cause grid row misalignment** → The grid pads shorter cards to match the tallest in the row. This means all cards in a row expand to the tallest card's height, which may add whitespace. Acceptable.
