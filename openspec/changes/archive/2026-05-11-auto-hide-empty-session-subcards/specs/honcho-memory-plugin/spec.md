## ADDED Requirements

### Requirement: Honcho `session-card-memory` claims declare `shouldRender`

The two `session-card-memory` claims contributed by the honcho plugin (`HonchoBadge`, `HonchoCardActions`) SHALL each declare a `shouldRender` function that returns `false` when the `pi-memory-honcho` extension is not installed and `true` otherwise. This makes the host's `MemorySubcard` wrapper hide entirely when honcho is bundled but the extension is uninstalled (the previously-observed empty-MEMORY-panel bug).

The `shouldRender` function MUST be synchronous. The honcho plugin SHALL maintain a sync-readable cache of the install state (populated by the existing async `useExtensionInstalled` probe) that the function reads. The cache SHALL default to `false` (closed by default) until the first probe completes — preferring an extra moment of "MEMORY hidden" over a frame of "MEMORY visible then disappears".

The cache SHALL update reactively: when the install state changes (e.g. user installs `pi-memory-honcho` from the Settings panel), the cache flips to `true` and any session card listening via `useSlotHasClaimsForSession("session-card-memory", session)` re-renders with the subcard now visible.

#### Scenario: Honcho package.json declares shouldRender for both claims
- **WHEN** `packages/honcho-plugin/package.json#pi-dashboard-plugin.claims` is inspected
- **THEN** the two entries with `slot: "session-card-memory"` SHALL each include a `shouldRender` field naming an exported function

#### Scenario: shouldRender returns false when extension uninstalled
- **WHEN** the `pi-memory-honcho` extension is not in `/api/packages/installed`
- **AND** the honcho plugin's `shouldRender(session)` is invoked for any session
- **THEN** it SHALL return `false`

#### Scenario: shouldRender returns true when extension installed
- **WHEN** the `pi-memory-honcho` extension is in `/api/packages/installed`
- **AND** the honcho plugin's `shouldRender(session)` is invoked for any session
- **THEN** it SHALL return `true`

#### Scenario: shouldRender returns false during initial probe
- **WHEN** the honcho plugin has just loaded and the extension-installed probe has not yet completed
- **AND** `shouldRender(session)` is invoked
- **THEN** it SHALL return `false` (closed by default to prevent flicker)

#### Scenario: MEMORY subcard re-appears after extension installed
- **WHEN** the user installs `pi-memory-honcho` from the Settings panel
- **AND** the install-state cache updates
- **THEN** session cards SHALL re-render with the MEMORY subcard now visible (the existing "running pi sessions must reload" toast behavior is unchanged)
