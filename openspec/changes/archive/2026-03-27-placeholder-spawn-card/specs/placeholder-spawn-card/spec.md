## ADDED Requirements

### Requirement: Placeholder card shown during session spawn
When the user clicks "New" to spawn a session in a workspace group, the system SHALL immediately render a placeholder skeleton card at the top of that group's session list. The placeholder SHALL display a pulse/loading animation to indicate a spawn is in progress.

#### Scenario: User clicks New in a group
- **WHEN** user clicks the "New" button in a workspace group header
- **THEN** a placeholder card with pulse animation SHALL appear at the top of that group's session list immediately, before any server response

#### Scenario: Placeholder appears above existing sessions
- **WHEN** a placeholder card is rendered for a group
- **THEN** it SHALL appear before all real session cards in that group

### Requirement: New button disabled during spawn
While a spawn is in progress for a workspace group, the "New" button for that specific group SHALL be disabled. Other groups' "New" buttons SHALL remain enabled and functional.

#### Scenario: New button disabled for spawning group
- **WHEN** a spawn is in progress for a workspace group
- **THEN** the "New" button for that group SHALL be disabled (not clickable)
- **AND** "New" buttons for other groups SHALL remain enabled

#### Scenario: New button re-enabled after spawn completes
- **WHEN** the spawn completes (session added or failure)
- **THEN** the "New" button for that group SHALL be re-enabled

### Requirement: Placeholder replaced on session added
When a `session_added` message arrives for the same cwd as a spawning group, the system SHALL remove the placeholder card. The real session card SHALL appear in its place via the normal session rendering.

#### Scenario: Session added replaces placeholder
- **WHEN** a `session_added` message arrives with a cwd matching a spawning group
- **THEN** the placeholder card SHALL be removed
- **AND** the real session card SHALL render in the group's session list

### Requirement: Placeholder removed on spawn failure
When a `spawn_result` message arrives with `success: false`, the system SHALL remove the placeholder card for the matching cwd and display an error toast.

#### Scenario: Spawn fails
- **WHEN** a `spawn_result` message arrives with `success: false`
- **THEN** the placeholder card for that cwd SHALL be removed
- **AND** an error toast SHALL be displayed

### Requirement: Safety timeout for stuck placeholders
If neither `session_added` nor a failed `spawn_result` clears the placeholder within 30 seconds, the system SHALL automatically remove the placeholder to prevent stuck UI states.

#### Scenario: Timeout clears placeholder
- **WHEN** 30 seconds elapse after spawn was initiated
- **AND** the placeholder has not been cleared by `session_added` or `spawn_result`
- **THEN** the placeholder SHALL be automatically removed
- **AND** the "New" button SHALL be re-enabled
