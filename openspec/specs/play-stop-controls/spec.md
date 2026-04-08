## MODIFIED Requirements

### Requirement: Stop button during streaming
A red Stop button (■) SHALL appear at the end of the input field when the session is streaming OR when a pending prompt exists. When clicked, it SHALL send an `abort` message and transition to a "Force Stop" state.

#### Scenario: Stop button visible during streaming
- **WHEN** the session status is "streaming"
- **THEN** a red Stop button is visible next to the Play button

#### Scenario: Stop button visible during pending
- **WHEN** a `pendingPrompt` exists on the session state
- **THEN** a red Stop button is visible next to the Play button

#### Scenario: Stop button hidden when idle
- **WHEN** the session status is "idle" or "ended" AND no `pendingPrompt` exists
- **THEN** the Stop button is not visible

#### Scenario: Stop button sends abort
- **WHEN** user clicks the Stop button while session is streaming
- **THEN** an `abort` message is sent to the session
- **AND** the button transitions to "Force Stop" state (orange, pulsing animation)

#### Scenario: Force Stop button visible after abort
- **WHEN** an abort has been sent AND the session is still streaming
- **THEN** an orange pulsing "Force Stop" button (⚠) SHALL be displayed instead of the red Stop button

#### Scenario: Force Stop sends force_kill
- **WHEN** user clicks the "Force Stop" button
- **THEN** a `force_kill` message is sent to the session
- **AND** the button transitions to "Killing..." state (non-interactive)

#### Scenario: Button resets when session stops streaming
- **WHEN** the session status changes away from "streaming"
- **THEN** the button state resets to initial (no abort/force-kill state)

### Requirement: Killing state feedback
When a force kill has been initiated, the button SHALL show a "Killing..." label and be non-interactive until the session status changes.

#### Scenario: Killing state displayed
- **WHEN** a `force_kill` message has been sent
- **THEN** the button SHALL display "Killing..." with a disabled/non-interactive appearance

#### Scenario: Killing state clears on session end
- **WHEN** the session status changes to "ended" after a force kill
- **THEN** the button SHALL be hidden (standard behavior for ended sessions)
