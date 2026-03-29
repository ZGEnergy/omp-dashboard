## ADDED Requirements

### Requirement: Card pulse distinguishes ask_user from processing

When a session's `currentTool` is `"ask_user"`, the session card must use a distinct purple pulse animation instead of the amber working pulse used for streaming/resuming.

#### Scenario: Session waiting for ask_user input
- **WHEN** `session.currentTool === "ask_user"`
- **THEN** the card applies the `card-input-pulse` CSS class (purple tint)
- **AND** does NOT apply `card-working-pulse`

#### Scenario: Session streaming normally
- **WHEN** `session.status === "streaming"` and `currentTool` is not `"ask_user"`
- **THEN** the card applies `card-working-pulse` (amber tint, unchanged behavior)

#### Scenario: Session idle or ended
- **WHEN** `session.status` is `"idle"` or `"ended"` and `currentTool` is not set
- **THEN** no pulse class is applied

### Requirement: ActivityIndicator shows "Waiting for input" for ask_user

The `ActivityIndicator` component must display a distinct label when the session is executing the `ask_user` tool.

#### Scenario: ask_user tool active
- **WHEN** `session.currentTool === "ask_user"`
- **THEN** the activity indicator shows "Waiting for input" in purple text
- **AND** does NOT show the generic "⚡ ask_user" tool indicator

#### Scenario: Other tool active
- **WHEN** `session.currentTool` is set to any value other than `"ask_user"`
- **THEN** the activity indicator shows the tool name with flash icon in yellow (unchanged)

### Requirement: CSS animation for card-input-pulse

A `card-input-pulse` keyframe animation must exist in the stylesheet with a purple/violet background tint, visually distinct from the amber `card-working-pulse`.

#### Scenario: Animation definition
- **WHEN** `card-input-pulse` class is applied to an element
- **THEN** the element pulses with a purple tint (`rgba(168, 85, 247, 0.08)` at 50%)
- **AND** returns to transparent at 0% and 100%
