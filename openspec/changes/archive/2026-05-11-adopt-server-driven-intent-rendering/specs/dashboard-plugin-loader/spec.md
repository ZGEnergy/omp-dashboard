## MODIFIED Requirements

### Requirement: Slot consumers SHALL accept BOTH refs-registry claims AND intent broadcasts

The slot consumer pattern (e.g. `ContentViewSlot`, `SessionCardActionBarSlot`, etc.) SHALL render both static refs-registry claims (current pattern, `claim.Component` from the generated plugin-registry.tsx) AND server-broadcast intent contributions from the IntentStore. The two pathways are coextensive during migration. For slots with `multiplicity: "many"`, both are rendered. For `multiplicity: "one-active"` slots, intent broadcasts take precedence over legacy claims when both are present from the same plugin.

This expressly SUPERSEDES the model from `add-plugin-ui-primitive-registry` (archived 2026-05-11) where plugins were expected to ship React code that imported the primitive registry via `useUiPrimitive`. The registry mechanism survives unchanged; the EXPECTED CALLER moves from plugin code to the shell-side IntentRenderer.

#### Scenario: Slot consumer renders both legacy claim and intent contribution

- **GIVEN** the legacy refs-registry has a claim for slot "session-card-action-bar" from plugin "jj"
- **AND** the IntentStore has an intent for slot "session-card-action-bar" from plugin "flows" (which has migrated)
- **WHEN** `SessionCardActionBarSlot` renders for the session
- **THEN** the slot consumer SHALL render both contributions: the legacy claim's React component AND the intent-driven IntentRenderer output
- **AND** the rendering order SHALL follow each contribution's pluginId priority

#### Scenario: Plugin that has fully migrated registers no refs-registry claims

- **GIVEN** plugin "flows" has migrated all 12 claims to intent broadcasts
- **WHEN** the plugin's manifest is scanned by the vite-plugin at build time
- **THEN** the plugin's manifest claims have empty `"claims": []` (or no longer include `component` fields)
- **AND** the legacy refs-registry path renders nothing for "flows" (it has no registered claims)
- **AND** the intent path renders everything for "flows" (driven by server broadcasts)

### Requirement: Server-side plugin discovery SHALL NOT depend on `process.cwd()`

The `discoverPlugins()` function SHALL discover plugin manifests from a stable location independent of where the server process was launched. Today the function reads `process.cwd() + "packages/"` which returns empty when the server runs from outside the monorepo (verified: `/api/health.plugins[]` is empty when server runs from `/home/skrot1`).

The discovery mechanism SHALL look in (in order):
1. The repo root determined by `import.meta.url` resolution from `dashboard-plugin-runtime/src/server/loader.ts` (when the runtime package is installed in a monorepo)
2. `~/.pi/dashboard/plugins/` (user-installed plugins, as proposed by `add-plugin-activation-ui`)
3. Bundled plugins in the dashboard's own `resources/` (production install)

Without this fix, the intent broadcast pathway is unusable: plugin server entries never load, so no intents fire.

#### Scenario: Dashboard installed via npm-global discovers plugins

- **GIVEN** dashboard is installed at `~/.pi-dashboard/node_modules/@blackbelt-technology/pi-dashboard-server/`
- **AND** the server is started with `pi-dashboard start` from any directory
- **WHEN** `discoverPlugins()` runs at server boot
- **THEN** plugin discovery SHALL find every installed plugin package (whether bundled in `resources/` or installed via `~/.pi/dashboard/plugins/`)
- **AND** `/api/health.plugins[]` SHALL list every discovered plugin with its loaded state
- **AND** each plugin's server entry SHALL be activated, ready to broadcast intents
