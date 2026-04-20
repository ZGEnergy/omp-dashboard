## ADDED Requirements

### Requirement: Step type tracking through event pipeline
The system SHALL propagate step type information (`agent`, `fork`, `agent-decision`, `agent-loop-decision`, `conditional`, `flow-ref`) from the flow configuration through to the dashboard UI components.

#### Scenario: Step type available in FlowAgentState
- **WHEN** a `flow_started` event is received with `dagSteps` containing steps of various types
- **THEN** each `FlowAgentState` entry created in the reducer SHALL have a `stepType` field matching the step's type from `dagSteps`

#### Scenario: Step type used for graph node rendering
- **WHEN** the flow graph renders nodes from `dagSteps`
- **THEN** all nodes SHALL render as uniform rectangles with identical border styling
- **AND** fork/decision steps SHALL have a `◇` prefix in their label
- **AND** loop-decision steps SHALL have a `↻` prefix in their label
- **AND** conditional steps SHALL have a `?` prefix in their label

#### Scenario: Step type used for agent card rendering
- **WHEN** agent cards render from `FlowAgentState` entries
- **THEN** decision/loop step cards SHALL display a type indicator (icon or badge) in the card header
- **AND** steps without an agent field (interactive-only conditional, flow-ref without agent) SHALL NOT render as agent cards

### Requirement: Graph edges include implicit sequential dependencies
The flow graph SHALL render edges for ALL sequential dependencies, not only explicit `blockedBy` arrays. Implicit edges include:
- Steps following a separator step (fork, conditional, loop-decision) in YAML order that have no `blockedBy`
- `exit_target` of `agent-loop-decision` steps (the exit target depends on the loop step completing)

#### Scenario: Loop exit target connected to loop step
- **WHEN** the graph renders an `agent-loop-decision` step with `exitTarget: "final-summary"`
- **THEN** an edge SHALL be drawn from the loop step to `final-summary`

#### Scenario: Steps after separator with no blockedBy get implicit edge
- **WHEN** a step has empty `blockedBy` and is preceded by a separator step (fork/conditional/loop-decision) in dagSteps order
- **THEN** an edge SHALL be drawn from the preceding separator to this step

#### Scenario: First step has no implicit edge
- **WHEN** the first step in the flow has empty `blockedBy`
- **THEN** no implicit edge SHALL be added (it is the entry point)

### Requirement: Graph label prefix by step type
The flow graph SHALL prefix node labels to indicate step type:
- Agent steps: no prefix (default)
- Fork/decision steps: `◇` prefix
- Loop-decision steps: `↻` prefix
- Conditional steps: `?` prefix

#### Scenario: Fork step label in graph
- **WHEN** a graph node has `stepType: "fork"`
- **THEN** its rendered label SHALL be prefixed with `◇` (e.g., `◇ pick-style`)
