## MODIFIED Requirements

### Requirement: Agent card visual distinction by step type
Agent cards SHALL visually distinguish between regular agent steps and decision/control-flow steps.

- Regular agent steps (`stepType: "agent"`): default card styling (current)
- Fork/decision steps (`stepType: "fork"`, `"agent-decision"`): type badge showing `◇ Fork` or `◇ Decision` in the card header
- Loop-decision steps (`stepType: "agent-loop-decision"`): type badge showing `↻ Loop` in the card header
- Steps without agents: SHALL NOT render as cards (graph-only)

#### Scenario: Fork step card shows type badge
- **WHEN** an agent card renders for a step with `stepType: "fork"`
- **THEN** the card header SHALL include a `◇` icon or "Fork" badge next to the step name

#### Scenario: Loop step card shows type badge
- **WHEN** an agent card renders for a step with `stepType: "agent-loop-decision"`
- **THEN** the card header SHALL include a `↻` icon or "Loop" badge next to the step name

#### Scenario: Conditional step has no card
- **WHEN** a flow contains a `conditional` step without an agent field
- **THEN** no agent card SHALL be rendered for that step
