## MODIFIED Requirements

### Requirement: Drawer default state is collapsed and persists per session server-side
The background-processes drawer's initial expansion state SHALL be derived from a per-session stored boolean, NOT from the activity bar context. When the session has no stored choice, the drawer SHALL render collapsed. A user toggle SHALL persist to `<session>.meta.json#processDrawerCollapsed`, SHALL be broadcast on the session object so every connected client reflects it, and SHALL be honored on reload. The stored value SHALL be pruned automatically when the session is deleted (its meta file is removed).

This supersedes the prior contextual default (`expanded === true` when the activity bar is empty and the drawer is non-empty).

#### Scenario: No stored choice renders collapsed
- **GIVEN** a session with 2 background processes and no `processDrawerCollapsed` value in its meta
- **WHEN** the PROCESS subcard renders
- **THEN** the drawer SHALL render collapsed (`expanded === false`)
- **AND** the `⚠ 2 background processes` summary row SHALL still be visible

#### Scenario: Stored expanded choice is honored on load
- **GIVEN** a session whose meta has `processDrawerCollapsed === false`
- **WHEN** the PROCESS subcard renders
- **THEN** the drawer SHALL render expanded

#### Scenario: User toggle persists server-side
- **GIVEN** a collapsed drawer for session `S`
- **WHEN** the user clicks the summary row to expand it
- **THEN** the client SHALL send `set_session_process_drawer { sessionId: "S", collapsed: false }`
- **AND** the server SHALL write `processDrawerCollapsed: false` to `S`'s meta and rebroadcast the session

#### Scenario: Choice survives reload and syncs across clients
- **GIVEN** the user has expanded the drawer for session `S` on client A
- **WHEN** client A reloads, or client B is already connected
- **THEN** both clients SHALL render the drawer for `S` expanded

#### Scenario: Stored value pruned on session delete
- **GIVEN** a session `S` with a stored `processDrawerCollapsed` value
- **WHEN** session `S` is deleted and its `.meta.json` removed
- **THEN** no orphan `processDrawerCollapsed` value SHALL persist for `S`
