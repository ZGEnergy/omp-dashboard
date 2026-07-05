## REMOVED Requirements

### Requirement: Global edit-mode default in plugin config

**Reason:** The dashboard kept a private global copy of edit-mode in `~/.pi/dashboard/config.json#plugins.flows.editFlow` and reconciled it into sessions. This fought pi-flows' own two-tier resolution (`~/.pi/agent/settings.json` global + `<cwd>/.pi/settings.json` project, project wins), producing a redundant third source of truth.

**Migration:** Set edit-mode per cwd on the folder settings page (writes `<cwd>/.pi/settings.json`), or globally via the retargeted FlowsSettings toggle (writes `~/.pi/agent/settings.json`, which pi-flows already honors). Existing `plugins.flows.editFlow` values become inert and can be ignored or removed.

### Requirement: Edit-mode default reconciled to a session on flows availability

**Reason:** The reconcile `useEffect` short-circuited on `flows.length === 0`, so edit-mode never activated in a fresh cwd (the state where authoring the first flow requires it), and the single global value stamped the same setting into every open project — destroying manual per-project values. pi-flows already resolves the effective value at `session_start`, making a dashboard-driven reconcile both unnecessary and harmful.

**Migration:** None required. pi-flows resolves `projectFlag ?? globalFlag` at each `session_start`; the folder settings toggle writes the project value directly.

### Requirement: Optional per-session override toggle

**Reason:** Superseded. Edit-mode is a cwd-scoped setting; its control belongs on the folder settings surface (established by change #232 for folder-scoped activation controls), not on a session card. The session-card flows subcard remains display/action-only, consistent with the ongoing folder/sidebar compaction work.

**Migration:** Use the folder settings page toggle for the cwd; all sessions in that cwd follow it after reload.

## ADDED Requirements

### Requirement: Per-cwd edit-mode toggle on the folder settings page

The flows-plugin SHALL contribute an edit-mode toggle to the folder settings surface via the `folder-settings-section` slot. The toggle SHALL display the **effective** value (`project ?? global ?? false`) read from pi-flows' own settings files, with a visible hint when the value is inherited from the global layer. Toggling SHALL write `flows.editFlow` to that folder's `<cwd>/.pi/settings.json` via a scope-aware server route that preserves unrelated keys in the file. The toggle SHALL function when the cwd has zero flows and when no session is connected for that cwd. The dashboard SHALL NOT maintain any separate edit-mode copy in its own config.

#### Scenario: Toggle persists per cwd without a session
- **WHEN** the user enables edit-mode on the folder settings page for a cwd with no connected session
- **THEN** the server SHALL write `flows.editFlow: true` to `<cwd>/.pi/settings.json`, preserving unrelated keys
- **AND** the next session started in that cwd SHALL see the flow authoring tools and edit-flow skill

#### Scenario: Effective value read-back
- **WHEN** the project file has no `flows.editFlow` but the global file has `flows.editFlow: true`
- **THEN** the toggle SHALL render enabled with a hint that the value is inherited from global

#### Scenario: No dashboard-private config write
- **WHEN** the edit-mode toggle is used at either scope
- **THEN** no `~/.pi/dashboard/config.json` plugin-config value SHALL be written or read for edit-mode

### Requirement: Edit-mode toggle reloads affected sessions live

After a project-scope edit-mode write, the dashboard SHALL invoke the folder-scoped reload endpoint (`POST /api/resources/reload { scope: "local", cwd }`) so connected sessions in that cwd re-read the persisted value at `session_start` and the flow authoring tools + edit-flow skill visibility apply live. The reload SHALL reuse the existing universal reload primitive (no new mechanism) and SHALL be a no-op when no session is connected for the cwd.

#### Scenario: Toggle reloads connected sessions in the cwd
- **WHEN** the user toggles edit-mode for a cwd with a connected idle session
- **THEN** the dashboard SHALL call the folder-scoped reload endpoint after the write
- **AND** after reload the session's flow authoring tools and edit-flow skill SHALL reflect the new value without a manual `/reload`

#### Scenario: No connected session
- **WHEN** the user toggles edit-mode for a cwd with no connected sessions
- **THEN** the write SHALL succeed and the reload call SHALL affect zero sessions without error

### Requirement: Global edit-mode default targets pi's global settings layer

The FlowsSettings global settings section SHALL read and write the global edit-mode default in pi's own `~/.pi/agent/settings.json` (`flows.editFlow`) via the scope-aware route, instead of a dashboard plugin-config value. Project values SHALL continue to override the global per pi-flows' resolution.

#### Scenario: Global default honored where no project value exists
- **WHEN** the user enables the global default and a cwd has no project-level `flows.editFlow`
- **THEN** sessions in that cwd SHALL resolve edit-mode enabled at `session_start`

#### Scenario: Project value wins over global
- **WHEN** the global default is enabled and a cwd's project file sets `flows.editFlow: false`
- **THEN** sessions in that cwd SHALL resolve edit-mode disabled
