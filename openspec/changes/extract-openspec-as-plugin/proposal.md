## Why

OpenSpec is currently woven through the dashboard core: ~34 client files and ~31 server files reference OpenSpec types, polling, REST routes, components, hooks, and reducers. `App.tsx` has hard-coded conditional rendering for `ArchiveBrowserView`, `SpecsBrowserView`, `OpenSpecPreview`, and `MarkdownPreviewView` (used by OpenSpec readers). `SessionCard.tsx` directly imports `OpenSpecActivityBadge` and `SessionOpenSpecActions`. `SessionList.tsx` imports `FolderOpenSpecSection`. Adding a sibling concept (e.g. ragger, judo workspace explorer) means accreting more conditional branches and imports in the same files.

The umbrella proposal `dashboard-plugin-architecture` introduces the plugin loader and slot taxonomy. This change uses that infrastructure to **move OpenSpec into a first-class plugin package** at `packages/openspec-plugin/`, register its UI via slot claims, and remove all OpenSpec-specific code from the dashboard shell.

After this lands, the dashboard works without OpenSpec (slots empty, no `/specs` route, no folder section, no badge, no action bar) and OpenSpec can ship independently.

This change DEPENDS ON `dashboard-plugin-architecture` and `add-dashboard-shell-slots-runtime` being implemented first.

## What Changes

- **NEW**: `packages/openspec-plugin/` package with `pi-dashboard-plugin` manifest and three subdirs:
  - `client/` — `FolderOpenSpecSection`, `OpenSpecActivityBadge`, `SessionOpenSpecActions`, `ArchiveBrowserView`, `SpecsBrowserView`, `OpenSpecPreview`, `TasksPopover`, all OpenSpec hooks (`useOpenSpecReader`, `useOpenSpecActions`, `useArchiveListing`, `useMainSpecsReader`), `openspec-helpers.tsx`, `openspec-tasks-api.ts`.
  - `server/` — `openspec-archive.ts`, `openspec-tasks.ts`, `routes/openspec-routes.ts`, OpenSpec parts of `directory-service.ts`, `session-bootstrap.ts`, `event-wiring.ts`, `browser-handlers/directory-handler.ts`, `session-meta-handler.ts`, `config-api.ts`, `system-routes.ts`.
  - `bridge/` — OpenSpec parts of activity detection (`openspec-activity-detector.ts` from shared, plus the auto-attach logic from the bridge).
  - `shared/` — OpenSpec types extracted from `packages/shared/src/types.ts` (`OpenSpecPhase`, `OpenSpecData`, `OpenSpecChange`, `OpenSpecArtifact`, `OpenSpecPollConfig`).
  - `client/settings/OpenSpecSettings.tsx` — NEW React component claiming the `settings-section` slot, surfacing the existing `pollIntervalSeconds`/`maxConcurrentSpawns`/`changeDetection`/`jitterSeconds` fields previously buried in core SettingsPanel.
- **MOVE** (not copy): every OpenSpec-related file from `packages/{client,server,shared}/` into `packages/openspec-plugin/`. Use `git mv` to preserve history.
- **NEW**: Slot claims in the manifest:
  - `sidebar-folder-section` → `FolderOpenSpecSection`
  - `session-card-badge` → `OpenSpecActivityBadge` (with predicate: only sessions with `openspecPhase` or `openspecChange`)
  - `session-card-action-bar` → `SessionOpenSpecActions`
  - `command-route` `/specs` → `SpecsBrowserView`
  - `command-route` `/archive` → `ArchiveBrowserView`
  - `command-route` `/openspec/:changeName` → `OpenSpecPreview`
  - `anchored-popover` `openspec-tasks-button` → `TasksPopover`
  - `settings-section` → `OpenSpecSettings` (replaces today's hardcoded openspec section in core SettingsPanel)
- **REMOVE** from `packages/{client,server,shared}/`: every imports / type references / branch that targets the moved files.
- **REMOVE** from `App.tsx`: ~150 LOC of OpenSpec-specific conditional rendering (replaced by `<ContentViewSlot/>`).
- **REMOVE** from `SessionCard.tsx`: direct imports of OpenSpec components (replaced by `<SessionCardBadgeSlot/>` and `<SessionCardActionBarSlot/>`).
- **REMOVE** from `SessionList.tsx`: direct import of `FolderOpenSpecSection` (replaced by `<SidebarFolderSectionSlot/>`).
- **NEW**: `OpenSpecData` and related types are re-exported from `@blackbelt-technology/openspec-plugin/types` for any consumer that still needs them; the dashboard core no longer imports them.

## Capabilities

### New Capabilities

None. This change is a refactor that uses `dashboard-shell-slots` and `dashboard-plugin-loader` already established by the umbrella.

### Modified Capabilities

- `extension-ui-system`: unchanged (separate concern).
- Existing OpenSpec capability specs (e.g. `openspec-polling`, `openspec-archive`, `openspec-attach-detach`, `openspec-tasks-popover`) — their main spec files in `openspec/specs/` move under `packages/openspec-plugin/specs/` and become plugin-internal documentation. The umbrella's plugin loader spec governs how they integrate.

## Impact

- `packages/client/src/App.tsx` — ~150 LOC reduction, removal of imports and conditionals.
- `packages/client/src/components/SessionCard.tsx`, `SessionList.tsx` — replace direct imports with slot consumers.
- `packages/server/src/server.ts` — remove OpenSpec route registration (now done by plugin's server entry).
- `packages/shared/src/types.ts` — remove OpenSpec-specific types.
- `packages/openspec-plugin/` — NEW package with all moved files.
- 60+ test files — paths in import statements update; behavioral assertions unchanged.
- `AGENTS.md` Key Files — replace internal OpenSpec entries with the plugin package and its manifest.
- `docs/architecture.md` — update OpenSpec section to point at the plugin package.

## Migration Risks

- **Test imports**: many tests import from internal paths. All test files need import-path rewrites. Mechanical but voluminous.
- **Type re-export**: any external code (e.g. the `pi-dashboard` skill in `.pi/skills/`) that uses OpenSpec types via `pi-dashboard-shared` paths needs a re-export shim, or the skill updates its imports.
- **Bridge auto-attach**: the OpenSpec activity detector currently lives in the bridge. Moving it into the plugin's `bridge/` entry means the dashboard server registers the plugin's bridge into `~/.pi/agent/settings.json` (per `dashboard-plugin-loader` spec). Validate that auto-attach behavior is identical post-move.
- **REST route prefix**: `/api/openspec/*` routes are owned by the plugin now. Other consumers of those routes (skills, scripts) must continue to work — same prefix, same shapes.
- **Config schema**: `openspec` config namespace moves from top-level to `plugins.openspec.*`. Migration is automated:
  1. Plugin's `configSchema` declares all four fields (`pollIntervalSeconds`, `maxConcurrentSpawns`, `changeDetection`, `jitterSeconds`) with their existing defaults and clamps from `parseOpenSpecPollConfig`.
  2. On first server start with the plugin enabled, the plugin's server entry checks for top-level `openspec.*` keys; if found, copies them under `plugins.openspec.*`, writes `plugins.openspec._migrated_from = "top-level"`, leaves the legacy keys in place for one release cycle (warning logged).
  3. The follow-up release deletes the legacy keys.
- **Settings UI migration**: existing core SettingsPanel has no dedicated openspec section today (config is loaded but not surfaced in UI). After extraction, OpenSpec's settings appear as a plugin section in the Settings page — a UI gain, not just parity.

## References

- Umbrella: `openspec/changes/dashboard-plugin-architecture/`
- Sibling extraction: `openspec/changes/extract-flows-as-plugin/`
- Layout scan results: `openspec/changes/dashboard-plugin-architecture/design.md` §"Current dashboard layout"
- Existing OpenSpec capabilities currently in `openspec/specs/`: `openspec-polling`, `openspec-archive`, `openspec-attach-detach`, `openspec-tasks-popover`, etc. (final list confirmed during implementation).
