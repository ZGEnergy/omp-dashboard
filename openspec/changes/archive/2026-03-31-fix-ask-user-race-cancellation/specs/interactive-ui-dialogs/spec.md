## ADDED Requirements

### Requirement: Dismissed state for interactive dialogs
The interactive UI dialog system SHALL support a `"dismissed"` status in addition to `"pending"`, `"resolved"`, and `"cancelled"`. When a `ui_dismiss` message is received for a pending dialog, the event reducer SHALL transition it to `"dismissed"` status. The interactive renderers SHALL display dismissed dialogs as compact cards with an "Answered in terminal" indicator.

#### Scenario: Dismiss message transitions pending dialog
- **WHEN** a `ui_dismiss` message arrives for a pending interactive request
- **THEN** the event reducer SHALL update the request status to `"dismissed"`

#### Scenario: Dismiss for non-pending dialog is ignored
- **WHEN** a `ui_dismiss` message arrives for an already resolved or cancelled request
- **THEN** the event reducer SHALL not change the request status

#### Scenario: Dismissed dialog renders as compact card
- **WHEN** an interactive dialog has status `"dismissed"`
- **THEN** the renderer SHALL display a compact card showing the title and an "Answered in terminal" indicator, similar to the resolved state styling
