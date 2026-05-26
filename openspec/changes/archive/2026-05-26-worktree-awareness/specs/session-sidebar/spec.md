## MODIFIED Requirements

### Requirement: Active session list
The session sidebar SHALL display all active and idle sessions for the selected workspace. Each session entry SHALL show:
- Status indicator (🟢 green dot for active/idle, 🟡 yellow pulsing dot for streaming, ⚫ gray for ended)
- Source badge (TUI / Zed / tmux)
- Model name and thinking level (e.g., "claude-4-sonnet (high)")
- Token count (formatted: e.g., "45.2k in" / "12k out")
- Cost (formatted: e.g., "$0.23")
- Current tool being executed (if any, e.g., "⚡ Read")
- Relative time since session started (e.g., "3m", "1h")
- Session display name or auto-generated label

Session cards SHALL have a 3D elevated appearance with `rounded-xl`, `shadow-md shadow-black/40`, `border border-white/5`, and a hover effect (`hover:shadow-lg hover:-translate-y-0.5`) with `transition-all duration-200`.

When `session.isWorktree` is `true`, the session card SHALL show the worktree folder name (last segment of `session.cwd`) with a tree icon (🌲) instead of the branch name with a branch icon. The group header SHALL continue showing the branch name as before.

#### Scenario: Session starts streaming
- **WHEN** an `agent_start` event arrives for a session
- **THEN** the sidebar SHALL update the status indicator to yellow pulsing and show "● streaming"

#### Scenario: Session becomes idle
- **WHEN** an `agent_end` event arrives for a session
- **THEN** the sidebar SHALL update the status indicator to green/connected and show "● idle"

#### Scenario: Session is active (connected, no agent activity yet)
- **WHEN** a session is registered but no agent activity has occurred
- **THEN** the sidebar SHALL show a green status indicator

#### Scenario: Session ends
- **WHEN** a session is unregistered or heartbeat times out
- **THEN** the sidebar SHALL show a gray status indicator

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

#### Scenario: Session in worktree shows worktree name
- **WHEN** a session card is rendered for a session where `isWorktree` is `true`
- **THEN** the card SHALL show "🌲 <folder-name>" (last segment of CWD) instead of "⎇ <branch>"

#### Scenario: Session in normal checkout shows branch
- **WHEN** a session card is rendered for a session where `isWorktree` is `false` or `undefined`
- **THEN** the card SHALL show "⎇ <branch>" as before

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
