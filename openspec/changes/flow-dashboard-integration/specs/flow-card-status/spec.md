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
