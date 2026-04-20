## ADDED Requirements

### Requirement: Session card displays flow activity badge
When a flow is active for a session, the session card SHALL display a flow activity badge below the OpenSpec activity badge. The badge SHALL show the flow name, agent progress, and status.

#### Scenario: Running flow badge
- **WHEN** a session has `activeFlowName` set and `flowStatus` is `"running"`
- **THEN** the session card SHALL display a badge like "🔄 research-and-build · 2/4 agents" with an animated/accent color

#### Scenario: Complete flow badge
- **WHEN** `flowStatus` is `"success"`
- **THEN** the badge SHALL show "✓ <flowName> · complete" in a success color

#### Scenario: Error flow badge
- **WHEN** `flowStatus` is `"error"`
- **THEN** the badge SHALL show "⚠ <flowName> · error" in an error color

#### Scenario: No flow active
- **WHEN** a session has no `activeFlowName`
- **THEN** no flow activity badge SHALL be displayed

### Requirement: Badge follows OpenSpecActivityBadge pattern
The flow activity badge SHALL use the same visual style as `OpenSpecActivityBadge`: 11px text, left-indented, icon + truncated text, compact single line.

#### Scenario: Visual consistency
- **WHEN** both OpenSpec and flow badges are visible
- **THEN** they SHALL have consistent styling and vertical spacing

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
