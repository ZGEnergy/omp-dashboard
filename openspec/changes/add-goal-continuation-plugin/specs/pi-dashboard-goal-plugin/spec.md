## ADDED Requirements

### Requirement: Plugin shipped as `pi-dashboard-goal-plugin` monorepo package

The system SHALL ship a monorepo package at `packages/goal-plugin/` published as `pi-dashboard-goal-plugin`. The package SHALL contain a `pi-dashboard-plugin` manifest with `id: "goal"`, `displayName: "Goal"`, `priority: 100`, and three entries: `bridge`, `server`, `client`. The plugin SHALL be discovered by the existing dashboard plugin loader without loader changes and appear in `GET /api/plugins`.

#### Scenario: Manifest discovery on dashboard boot

- **WHEN** the dashboard server boots and `packages/goal-plugin/` is present
- **THEN** the loader validates the manifest, registers the server entry, and registers the bridge entry into `settings.json#dashboardPluginBridges`
- **AND** the plugin appears in `GET /api/plugins`

#### Scenario: Default-enabled when no config

- **WHEN** no plugin config disables it (`cfg?.enabled !== false`)
- **THEN** the plugin activates on dashboard boot without a manual toggle
- **AND** it is surfaced in Settings ▸ Plugins

### Requirement: Bridge entry runs the judge-driven continuation loop

The plugin bridge entry SHALL register `pi.on("turn_end")` to capture the last assistant text and `pi.on("agent_end")` to run the judge against the current goal. The judge logic (`evaluateWithJudge`, `JudgeService`, continuation-prompt builder, goal-state persistence) SHALL be vendored from `@ricoyudog/pi-goal-hermes` with no TUI coupling. On a "continue" verdict the entry SHALL emit `pi.events.emit("dashboard:enqueue-followup", { text })` and SHALL NOT call `pi.sendUserMessage` directly.

#### Scenario: Judge says continue

- **WHEN** a goal is active, the turn ends with non-empty assistant text, and the judge verdict is "not done"
- **THEN** `turnsUsed` increments, state is persisted, and `dashboard:enqueue-followup` is emitted with the continuation prompt
- **AND** no direct `pi.sendUserMessage` call is made by the plugin

#### Scenario: Judge says done

- **WHEN** the judge verdict is "done"
- **THEN** status transitions to `done`, no continuation is emitted, and a `done` `goal_status` snapshot is broadcast

#### Scenario: Budget exhausted or unparseable

- **WHEN** `turnsUsed >= maxTurns` OR the judge output is unparseable 3 times in a row
- **THEN** status transitions to `paused` with the corresponding reason and no continuation is emitted

#### Scenario: Session reload while active

- **WHEN** `session_start` fires with `reason === "reload"` and the restored goal is active
- **THEN** the goal is paused with reason `"reload"` and a `paused` snapshot is broadcast

### Requirement: Goal status surfaced as a snapshot broadcast

The plugin server SHALL cache the latest `goal_status` per session and `broadcastToSubscribers` on change, replaying the cached snapshot when a browser (re)subscribes. The status payload SHALL include at least `status` (`active` | `paused` | `done` | `cleared`), `goal`, `turnsUsed`, `maxTurns`, and the last verdict/reason. The shared protocol union and the shell `event-reducer.ts` SHALL NOT be modified; the plugin client reducer keys on the plugin's own message type.

#### Scenario: Status change reaches the chip

- **WHEN** the bridge reports a status transition
- **THEN** the plugin server updates its per-session snapshot and broadcasts it
- **AND** the plugin client reducer updates and the `GoalChip` slot renders the new state (`● Pursuing n/m`, `⏸ Paused`, `✓ Achieved`)

#### Scenario: Late subscriber gets current state

- **WHEN** a browser subscribes to a session that already has an active goal
- **THEN** the server replays the cached `goal_status` snapshot
- **AND** the chip renders without waiting for the next transition

#### Scenario: No goal set → chip hidden

- **WHEN** no goal exists for the session
- **THEN** the server caches no snapshot and the `GoalChip` renders nothing

### Requirement: Goal control via plugin action, not slash dispatch

The plugin SHALL expose a web-UI control (goal input plus pause / resume / done / clear and subgoal actions) that dispatches `plugin_action` over the existing plugin action bridge. The plugin server SHALL `registerBrowserHandler("plugin_action", …)` to apply these actions, forwarding set/control intents to the session bridge via `pi.events` where they must reach the running session. The plugin SHALL NOT register a `/goal` slash command in v1.

#### Scenario: Set a goal from the UI

- **WHEN** the user enters goal text in the control and submits
- **THEN** a `plugin_action` is dispatched, the server applies it, the goal becomes active, and the autonomous loop begins on the next idle window
- **AND** this works in both headless and terminal-hosted sessions (no slash-routing dependency)

#### Scenario: Pause / resume / clear from the UI

- **WHEN** the user clicks pause, resume, or clear
- **THEN** the corresponding `plugin_action` is applied, state is persisted, and a fresh `goal_status` snapshot is broadcast

### Requirement: Graceful degradation when plugin absent or goal unset

When the plugin is not installed, the main bridge's follow-up queue SHALL carry only user follow-ups and no goal UI SHALL appear. When the plugin is installed but no goal is set, the bridge hooks SHALL early-return and produce no continuations.

#### Scenario: Plugin uninstalled

- **WHEN** the plugin is removed and the dashboard restarts
- **THEN** no `GoalChip` renders, no continuations are emitted, and `bridgeFollowUp` behaves as user-only
