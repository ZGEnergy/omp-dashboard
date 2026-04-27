## MODIFIED Requirements

### Requirement: Flow agent lifecycle events
The flow engine SHALL emit `onAgentStarted` and `onAgentComplete` observer callbacks for ALL step types that spawn an LLM agent session, not only `stepType: "agent"` steps.

The following step types MUST emit lifecycle events when they spawn an agent:
- `agent` (already emits — no change)
- `agent-decision` (spawns decision agent — MUST emit)
- `agent-loop-decision` (spawns decision agent — MUST emit)
- `fork` when in autonomous mode or auto-decide (spawns decision agent — MUST emit)

The following step types MUST NOT emit agent lifecycle events:
- `fork` in interactive mode (no agent spawned)
- `conditional` (pure routing, no agent)
- `flow-ref` (sub-flow agents emit their own events)

#### Scenario: Agent-decision step emits lifecycle events
- **WHEN** an `agent-decision` step executes
- **THEN** `onAgentStarted` SHALL be called with `(step.agent, step.id)` before `spawnAgent()`
- **AND** `onAgentComplete` SHALL be called with `(step.agent, step.id, result)` after `spawnAgent()` returns

#### Scenario: Agent-loop-decision step emits lifecycle events
- **WHEN** an `agent-loop-decision` step executes
- **THEN** `onLoopIteration` SHALL be called first (existing behavior)
- **AND** `onAgentStarted` SHALL be called with `(step.agent, step.id)` before `spawnAgent()`
- **AND** `onAgentComplete` SHALL be called with `(step.agent, step.id, result)` after `spawnAgent()` returns

#### Scenario: Fork autonomous decision emits lifecycle events
- **WHEN** a `fork` step spawns a decision agent (autonomous, auto-decide, or custom-decide)
- **THEN** `onAgentStarted` SHALL be called with `(agentName, step.id)` before `spawnAgent()`
- **AND** `onAgentComplete` SHALL be called with `(agentName, step.id, result)` after `spawnAgent()` returns
- **AND** `onAutoDecision` SHALL continue to be called after completion (existing behavior)

#### Scenario: Interactive fork does not emit agent events
- **WHEN** a `fork` step is handled interactively (user selects an option)
- **THEN** no `onAgentStarted` or `onAgentComplete` SHALL be emitted
