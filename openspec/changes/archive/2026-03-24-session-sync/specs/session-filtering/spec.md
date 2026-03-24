## MODIFIED Requirements

### Requirement: Active-only toggle
The session list SHALL include an "Active only" toggle button in its header area. When enabled, sessions with status "ended" SHALL be hidden from the list. The toggle SHALL default to ON (only active/non-hidden sessions shown), reflecting the new hidden lifecycle where ended sessions are hidden by default.

#### Scenario: Toggle active-only ON
- **WHEN** the user enables the "Active only" toggle
- **THEN** all sessions with `hidden = true` or status "ended" SHALL be removed from the visible list

#### Scenario: Toggle active-only OFF
- **WHEN** the user disables the "Active only" toggle
- **THEN** ended and hidden sessions SHALL reappear in the list (with muted styling for hidden sessions)

#### Scenario: Active-only persists across reload
- **WHEN** the user sets active-only and reloads the page
- **THEN** the toggle SHALL restore its previous state from localStorage

### Requirement: Per-card hide
Each session card SHALL display a hide button `[✕]`. Clicking it SHALL set the session's `hidden` flag to `true` on the server and remove the card from the visible list.

#### Scenario: Hide a session card
- **WHEN** the user clicks the hide button on a session card
- **THEN** the session SHALL be marked `hidden = true` in SQLite via the server and removed from the visible list

#### Scenario: Hide an active session
- **WHEN** the user hides a session that is still active (not ended)
- **THEN** the session SHALL be hidden regardless of its status

### Requirement: Show hidden toggle
The session list SHALL include a "Show hidden" toggle. When enabled, hidden sessions SHALL reappear in the list with a muted visual style (reduced opacity) and an unhide button `[↩]` replacing the hide button. Hidden sessions SHALL also show resume/fork buttons.

#### Scenario: Reveal hidden sessions
- **WHEN** the user enables "Show hidden"
- **THEN** all hidden sessions SHALL appear in the list with reduced opacity, an unhide `[↩]` button, and resume/fork action buttons

#### Scenario: Unhide a session
- **WHEN** the user clicks the unhide `[↩]` button on a hidden session
- **THEN** the session SHALL be marked `hidden = false` in SQLite via the server and displayed normally

### Requirement: Hidden count indicator
When hidden sessions exist and "Show hidden" is OFF, the session list SHALL display an "N hidden" indicator at the bottom of the list.

#### Scenario: Hidden sessions exist
- **WHEN** one or more sessions are hidden and "Show hidden" is OFF
- **THEN** the list SHALL show "N hidden" at the bottom where N is the count

#### Scenario: No hidden sessions
- **WHEN** no sessions are hidden
- **THEN** the hidden count indicator SHALL NOT be displayed

### Requirement: Filter interaction
The active-only toggle, per-card hide, and server-side hidden flag SHALL work together. The server-side `hidden` flag is the source of truth.

#### Scenario: Hidden active session with active-only ON
- **WHEN** an active session has `hidden = true` and "Active only" is ON
- **THEN** the session SHALL NOT be visible

#### Scenario: Ended session with show-hidden ON
- **WHEN** an ended session has `hidden = true` and "Show hidden" is ON
- **THEN** the session SHALL be visible with muted styling and resume/fork buttons

### Requirement: Stale hidden ID pruning
Hidden state is now server-side (`hidden` column in SQLite). The client-side localStorage hidden set is no longer used. The server is the source of truth for visibility.

#### Scenario: Migration from client-side hidden
- **WHEN** the client detects a legacy `hiddenSessions` key in localStorage
- **THEN** it SHALL ignore it (server-side hidden flag takes precedence) and remove the key
