## ADDED Requirements

### Requirement: Folder-scoped goal record store

The system SHALL persist goals as cwd-keyed `GoalRecord` entries durable across restarts, mirroring the OpenSpec group store (atomic write, per-folder).

#### Scenario: Create and persist a goal
- **WHEN** a goal is created for folder cwd `C` with an objective
- **THEN** a `GoalRecord { id, cwd: C, objective, status: "pursuing", sessionIds: [], createdAt, updatedAt }` is persisted
- **AND** it survives a dashboard server restart

#### Scenario: Goals are scoped to their folder
- **WHEN** goals are listed for folder cwd `C`
- **THEN** only `GoalRecord`s with `cwd === C` are returned

### Requirement: Goals folder nav slot

The folder group SHALL render a `Goals (N) →` nav slot plus a `+ Goal` action, as a sibling of the `Automations` and `OpenSpec` slots.

#### Scenario: Nav slot shows count and opens page
- **WHEN** folder `C` has N goals
- **THEN** the slot shows `Goals (N)`
- **AND** activating the slot navigates to the goals page for `C`

#### Scenario: Create affordance
- **WHEN** the user activates `+ Goal`
- **THEN** a create flow captures an objective and creates a `GoalRecord` for `C`

### Requirement: Goals content page

The system SHALL provide a goals content page at `/folder/:encodedCwd/goals` structured like the OpenSpec board (back, title, refresh, new-goal, status filter, goal cards).

#### Scenario: Page lists goal cards with status
- **WHEN** the goals page for `C` is opened
- **THEN** each goal renders a card with objective, a status badge (Pursuing / Paused / Achieved), and progress (turns n/m + success criteria)

#### Scenario: Filter by status
- **WHEN** the user selects the `Paused` status filter
- **THEN** only goals with `status === "paused"` are shown

### Requirement: Goal-to-session linking (1:N)

A goal SHALL own zero or more sessions, trackable and mutable from the goal card.

#### Scenario: Spawn a session under a goal
- **WHEN** the user activates `+ New session` on goal `G`
- **THEN** the spawned session is stamped with `goalId === G.id`
- **AND** `G.sessionIds` includes the new session id

#### Scenario: Link an existing running session
- **WHEN** the user links running session `S` to goal `G`
- **THEN** `G.sessionIds` includes `S` and `S` meta carries `goalId === G.id`

#### Scenario: Unlink a session
- **WHEN** the user unlinks session `S` from goal `G`
- **THEN** `G.sessionIds` no longer includes `S` and `S` meta `goalId` is cleared

#### Scenario: Deleting a goal clears links
- **WHEN** goal `G` is deleted
- **THEN** every session formerly in `G.sessionIds` has its `goalId` cleared

### Requirement: Embedded chatview for goal sessions including hidden ones

The goal detail page SHALL open the chat view of any linked session, including auto-hidden driver/worker sessions, without changing their `hidden` status in the sidebar.

#### Scenario: Open the driver session chatview
- **WHEN** the user opens goal detail for `G` whose `driverSessionId` is an auto-hidden session
- **THEN** that session's chat view renders embedded in the goal detail page
- **AND** the session remains `hidden` in the sidebar (not auto-navigated, not unhidden)

#### Scenario: Switch between linked sessions
- **WHEN** goal `G` has multiple linked sessions
- **THEN** the goal detail page provides tabs to switch the embedded chatview across `G.sessionIds`

### Requirement: Per-session goal control demotes to a link chip

With goal creation/management at the folder level, the session-card goal surface SHALL become a read-only link to the owning goal rather than a create/control surface.

#### Scenario: Session card chip links to its goal
- **WHEN** session `S` has `goalId === G.id`
- **THEN** its session-card goal chip is read-only and navigates to goal `G` detail when activated
- **AND** the "Set a goal…" input no longer appears on the session card

#### Scenario: Live status rolls up by goalId
- **WHEN** a `goal_status` snapshot for session `S` (carrying `goalId === G.id`) updates
- **THEN** goal `G`'s card reflects the latest live turns/verdict/paused state for that session
