## Why

The OpenSpec workflow profile (`core` / `expanded` / `custom`) decides which `/opsx:` action buttons appear on session cards and the composer, but the dashboard can only **read** it via `openspec config list --json` — there is no way to change it without dropping to a terminal. The profile lives in a machine-global file (`~/.config/openspec/config.json`) shared by every tool, and individual projects only pick up workflow changes when `openspec update` regenerates their skill files. Users need to set the profile and refresh projects from the dashboard, with clear messaging about the global blast radius.

## What Changes

- Add a **POST `/api/openspec/config`** endpoint that writes the global OpenSpec config (`profile` + `workflows[]`). For `core`, shell out to the real CLI preset (`openspec config profile core`); for `expanded` / `custom`, write `~/.config/openspec/config.json` directly via an **atomic tmp-file + rename** (no CLI preset exists for those).
- Add a **POST `/api/openspec/update`** endpoint that runs `openspec update` for one cwd or for all known cwds (session cwds + pinned dirs).
- Add a **staleness signal**: per-cwd, record a signature of the workflow set at the last dashboard-run update (in the preferences store). Expose a **GET `/api/openspec/update-status`** that reports each known cwd as `up-to-date`, `needs-update`, or `unknown`.
- Add an **OpenSpec Workflow Profile** section to Settings → Advanced: radio (Core / Expanded / Custom) with an 11-chip workflow multiselect under Custom, a **Save profile** button (writes global config only — instant dashboard effect, no project mutation), an **Update all projects** button, and a **collapsible** per-cwd list (collapsed by default) showing each project's staleness badge and a per-cwd **Update** button.
- A warning banner states the profile change affects OpenSpec for **all tools on this machine**.
- Decouple Save from Update: saving never mutates project repos; `openspec update` is always explicit (per-cwd or update-all).
- Bust the server-side 30s `configCache` and the client `useOpenSpecConfig` cache on save so buttons re-render immediately.

## Capabilities

### New Capabilities
- `openspec-profile-config`: Read, write, and apply the global OpenSpec workflow profile from the dashboard — global config write (preset for core, atomic JSON for expanded/custom), per-cwd and bulk `openspec update`, and per-cwd staleness reporting.

### Modified Capabilities
- `settings-panel`: Adds the OpenSpec Workflow Profile section (profile radio + custom workflow multiselect + Save + Update-all + collapsible per-cwd update list) to the Advanced tab.

## Impact

- **Shared** (`packages/shared/src/platform/openspec.ts`): new `OPENSPEC_CONFIG_PROFILE` and `OPENSPEC_UPDATE` recipes; `writeOpenSpecConfigFile()` atomic JSON helper; workflow-set signature helper.
- **Server** (`packages/server/src/routes/openspec-routes.ts`): `POST /api/openspec/config`, `POST /api/openspec/update`, `GET /api/openspec/update-status`; configCache invalidation. `preferences-store.ts`: persist per-cwd update signatures.
- **Client** (`packages/client/src/lib/openspec-config-api.ts`): `saveOpenSpecConfig()`, `runOpenSpecUpdate()`, `fetchUpdateStatus()` helpers + cache reset. New `OpenSpecProfileSection.tsx` mounted in `SettingsPanel` Advanced tab.
- **Config file**: dashboard now writes `~/.config/openspec/config.json` (global, shared with Claude Code / Cursor / CLI).
- No breaking changes; additive endpoints + UI.
