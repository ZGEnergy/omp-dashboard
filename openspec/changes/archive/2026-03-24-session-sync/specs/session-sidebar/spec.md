## MODIFIED Requirements

### Requirement: Active session list
The session sidebar SHALL display only non-hidden sessions by default. Each session entry SHALL show:
- Status indicator (🟢 green dot for active/idle, 🟡 yellow pulsing dot for streaming, ⚫ gray for ended)
- Source badge (TUI / Zed / tmux)
- Model name and thinking level (e.g., "claude-4-sonnet (high)")
- Token count (formatted: e.g., "45.2k in" / "12k out")
- Cost (formatted: e.g., "$0.23")
- Current tool being executed (if any, e.g., "⚡ Read")
- Relative time since session started (e.g., "3m", "1h")
- Session display name or auto-generated label

Session cards SHALL have a 3D elevated appearance with `rounded-xl`, `shadow-md shadow-black/40`, `border border-white/5`, and a hover effect (`hover:shadow-lg hover:-translate-y-0.5`) with `transition-all duration-200`.

#### Scenario: Only active sessions shown by default
- **WHEN** the sidebar loads
- **THEN** it SHALL display only sessions with `hidden = false`

#### Scenario: Session starts streaming
- **WHEN** an `agent_start` event arrives for a session
- **THEN** the sidebar SHALL update the status indicator to yellow pulsing and show "● streaming"

#### Scenario: Session becomes idle
- **WHEN** an `agent_end` event arrives for a session
- **THEN** the sidebar SHALL update the status indicator to green/connected and show "● idle"

#### Scenario: Session ends and disappears
- **WHEN** a session is unregistered or heartbeat times out
- **THEN** the session SHALL be marked `hidden = true` and removed from the default sidebar view

#### Scenario: Tool execution in progress
- **WHEN** a `session_updated` event arrives with `currentTool` set to a tool name
- **THEN** the sidebar SHALL show the tool name (e.g., "⚡ Read") on the session card until a subsequent update clears `currentTool`

#### Scenario: Stats update
- **WHEN** a `session_updated` event arrives with new token/cost stats
- **THEN** the sidebar SHALL update the displayed token counts and cost values in real-time

#### Scenario: Session card layout
- **WHEN** a session card is rendered
- **THEN** it SHALL display: first line with status dot, project name, source badge, and relative time; second line with model name and thinking level in parentheses; third line with activity indicator (current tool or state label) and token/cost stats; fourth line with editor buttons for each detected editor (only when accessed on localhost)

#### Scenario: Session card 3D styling
- **WHEN** a session card is rendered
- **THEN** it SHALL have rounded-xl corners, a shadow for depth, and a subtle border highlight
- **AND** on hover, it SHALL elevate slightly with increased shadow

#### Scenario: Thinking level displayed
- **WHEN** a session has both `model` and `thinkingLevel` set
- **THEN** the card SHALL display them as "model-name (thinking-level)" on line 2

#### Scenario: Thinking level absent
- **WHEN** a session has `model` set but `thinkingLevel` is undefined
- **THEN** the card SHALL display only the model name on line 2

#### Scenario: Editor buttons shown on localhost
- **WHEN** the dashboard is accessed via localhost and editors are detected for the session's cwd
- **THEN** the session card SHALL display small clickable editor buttons (one per detected editor)

#### Scenario: Editor buttons hidden on remote
- **WHEN** the dashboard is accessed via a non-localhost URL
- **THEN** no editor buttons SHALL be displayed

#### Scenario: Click editor button
- **WHEN** a user clicks an editor button on a session card
- **THEN** the client SHALL call `POST /api/open-editor` with the session's cwd and the editor ID
- **AND** the click SHALL NOT trigger session selection

#### Scenario: Editor button on grouped sessions
- **WHEN** multiple sessions share the same cwd and are displayed under a group header
- **THEN** editor buttons SHALL appear on the group header, not on each individual session card

#### Scenario: Token formatting
- **WHEN** token counts are displayed
- **THEN** values above 1000 SHALL be formatted with "k" suffix (e.g., 12400 → "12.4k"), values below 1000 SHALL show as-is

### Requirement: Session selection
Clicking a session in the sidebar SHALL select it and display its conversation in the chat view. The selected session SHALL be visually highlighted.

#### Scenario: Select active session
- **WHEN** a user clicks an active session in the sidebar
- **THEN** the chat view SHALL load and display that session's conversation with live streaming

#### Scenario: Select inactive session
- **WHEN** a user clicks an inactive session (from hidden/revealed list)
- **THEN** the chat view SHALL load the session's historical conversation (read-only, no input box). If no events are stored, it SHALL show a message indicating no conversation history with options to resume or fork.

#### Scenario: Selected session ends
- **WHEN** the currently selected session's pi process exits
- **THEN** the chat view SHALL show a "Session ended" indicator and disable the input box

### Requirement: Hidden sessions toggle
The sidebar SHALL include a toggle to show hidden (ended) sessions. When enabled, hidden sessions SHALL appear with muted styling and resume/fork action buttons.

#### Scenario: Toggle hidden sessions on
- **WHEN** the user enables the "Show hidden" toggle
- **THEN** all hidden sessions for the selected workspace SHALL appear in the list with reduced opacity and resume/fork buttons

#### Scenario: Toggle hidden sessions off
- **WHEN** the user disables the "Show hidden" toggle
- **THEN** hidden sessions SHALL be removed from the list

#### Scenario: Hidden count indicator
- **WHEN** hidden sessions exist and the toggle is off
- **THEN** the sidebar SHALL show "N hidden" at the bottom of the session list

#### Scenario: Resume button on hidden session
- **WHEN** a hidden session card is shown with the toggle on
- **THEN** it SHALL display a "Resume" button (continue same session) and a "Fork" button (new session from old)

#### Scenario: Resume action
- **WHEN** the user clicks "Resume" on a hidden session
- **THEN** the client SHALL send `resume_session` with `mode: "continue"` and the session ID

#### Scenario: Fork action
- **WHEN** the user clicks "Fork" on a hidden session
- **THEN** the client SHALL send `resume_session` with `mode: "fork"` and the session ID

### Requirement: New session button
The sidebar SHALL include a "+ New session" button that spawns a new pi session in the selected workspace via tmux (see process-manager spec).

#### Scenario: Click new session
- **WHEN** a user clicks "+ New session" in a workspace
- **THEN** the system SHALL spawn pi in tmux for that workspace's path and show a "Starting..." indicator until the session connects

#### Scenario: New session without workspace selected
- **WHEN** a user clicks "+ New session" with no workspace selected
- **THEN** the system SHALL show a workspace picker dialog before spawning

### Requirement: Mobile swipe drawer
On mobile viewports (width < 768px), the session sidebar SHALL be hidden by default and accessible via a swipe-from-left gesture or hamburger menu button.

#### Scenario: Open drawer on mobile
- **WHEN** a user swipes from the left edge or taps the hamburger icon on mobile
- **THEN** the session sidebar SHALL slide in as an overlay

#### Scenario: Close drawer on session select
- **WHEN** a user selects a session in the mobile drawer
- **THEN** the drawer SHALL close and the chat view SHALL show the selected session

### Requirement: Session card layout
- **WHEN** a session card is rendered
- **THEN** it SHALL display: first line with status dot, project name, and relative time; second line with model name and thinking level in parentheses; third line with activity indicator (current tool or state label) and token/cost stats; fourth line with git info (if applicable); then a thin horizontal divider; then an action row with editor buttons, source badge, and hide/unhide button. The source badge SHALL NOT appear on the first line.

#### Scenario: Session card layout
- **WHEN** a session card is rendered
- **THEN** it SHALL display: first line with status dot, project name, and relative time; second line with model name and thinking level; third line with activity and token stats; thin divider; action row with editors, source badge, and hide button

#### Scenario: Editor buttons shown on localhost
- **WHEN** the dashboard is accessed via localhost and editors are detected for the session's cwd
- **THEN** the session card SHALL display editor buttons in the action row below the thin divider

#### Scenario: Editor button on grouped sessions
- **WHEN** multiple sessions share the same cwd and are displayed under a group header
- **THEN** editor buttons SHALL appear on the group header, not on each individual session card

### Requirement: Session display name with firstMessage fallback
The session display name function SHALL use the following fallback chain: explicit name → first user message (truncated to 50 characters) → cwd last segment → session ID prefix. This ensures sessions are distinguishable even when the user has not explicitly named them.

#### Scenario: Named session
- **WHEN** a session has `name` set (e.g., "Fix auth bug")
- **THEN** the display name SHALL be the name

#### Scenario: Unnamed session with first message
- **WHEN** a session has no `name` but has `firstMessage` set (e.g., "Help me fix the authentication module so it...")
- **THEN** the display name SHALL be the firstMessage truncated to 50 characters with "..." appended if truncated

#### Scenario: Unnamed session without first message
- **WHEN** a session has neither `name` nor `firstMessage`
- **THEN** the display name SHALL be the last segment of the cwd (e.g., "my-project")

#### Scenario: Brand new session
- **WHEN** a session has just started with no messages or name
- **THEN** the display name SHALL be the cwd last segment, and SHALL update to the firstMessage once the first turn completes

### Requirement: Session sidebar styling
The session sidebar, session list, and session cards SHALL use theme-aware CSS variables for all background, text, and border colors instead of hardcoded Tailwind dark-mode classes.

#### Scenario: Session sidebar adapts to theme
- **WHEN** the theme changes between light and dark
- **THEN** the sidebar backgrounds, text colors, and borders update to match the active theme
