## ADDED Requirements

### Requirement: Session card SHALL show a closing state while shutdown is in flight

When the user triggers shutdown of a session card, the client SHALL set a
transient client-side `closing` flag on that session and render a distinct
closing visual until the session is removed. The flag is client-only —
bridges and the server SHALL NOT send `closing`.

While `closing` is true, the card SHALL: dim to indicate it is no longer
active, replace the close (✕) control with a spinner, and disable the close
control so re-clicks are no-ops. The card SHALL remain readable (name and
status legible) so the user can identify which session is closing.

#### Scenario: Closing state appears immediately on click
- **GIVEN** an idle session card
- **WHEN** the user clicks the close (✕) control
- **THEN** the card SHALL immediately dim and show a spinner in place of the ✕
- **AND** further clicks on the close control SHALL be no-ops

#### Scenario: Streaming confirm still gates the close
- **GIVEN** a streaming session card
- **WHEN** the user clicks the close control
- **THEN** the existing "Session is currently running. Exit anyway?" confirm
  SHALL appear first
- **AND** the closing state SHALL appear only after the user confirms

### Requirement: Closing state SHALL clear when the session is removed or after a timeout

The closing state SHALL clear automatically when the server's `session_removed`
broadcast removes the card. If `session_removed` never arrives, a bounded
safety-revert timeout SHALL clear `closing` so the card can never remain in the
closing state indefinitely, after which the close control SHALL work again.

#### Scenario: Normal removal clears the closing state
- **GIVEN** a card in the closing state
- **WHEN** `session_removed` arrives for that session
- **THEN** the card SHALL be removed from the list

#### Scenario: Missing removal reverts after timeout
- **GIVEN** a card in the closing state
- **WHEN** no `session_removed` arrives before the safety-revert timeout elapses
- **THEN** the card SHALL revert from closing to its normal state
- **AND** the close control SHALL be usable again so the user can retry
