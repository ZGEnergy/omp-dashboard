## Why

The dashboard's flows edit-mode is driven by a single **global** knob (`plugins.flows.editFlow` in `~/.pi/dashboard/config.json`) that a per-session `useEffect` reconciles down into every session. This fights pi-flows' own design, which already resolves `flows.editFlow` two-tier (`<cwd>/.pi/settings.json` project value overrides `~/.pi/agent/settings.json` global). The result is broken in practice:

- The reconcile short-circuits on `flows.length === 0`, so edit-mode never activates in a fresh cwd — the exact state where you need it to author your first flow.
- One global value stamps the same setting into every open project's `.pi/settings.json`, destroying hand-set per-project values and making pi-flows' native per-cwd layer unusable.
- The event write (`flow:set-edit-mode`) cannot reload the session, so skill/tool visibility silently defers to "next session".

An earlier draft (`fix-flows-edit-mode-per-cwd-reload`, superseded by this change) put a per-cwd switch on the session-card flows subcard. That is now deprecated: the folder card/sidebar is being compacted (`focus-driven-folder-compaction`), and per-cwd controls have since gained a proper home — change #232 (`folder-resource-activation-toggle`) established the DirectorySettings surface (`/folder/:cwd/settings`) as the place for folder-scoped enable/disable controls, including a landed scope-aware reload endpoint (`POST /api/resources/reload { scope, cwd }`). What is missing is a way for a **decoupled plugin** to contribute a section there.

## What Changes

- **Add a generic `folder-settings-section` slot** (react-only, multiplicity many, props `{ cwd }`), hosted by `DirectorySettings` — the folder-scoped twin of the existing global `settings-section` slot. Any plugin can contribute per-cwd settings without touching the folder card.
- **flows-plugin claims the slot** with a one-row "Flow authoring (edit mode)" toggle. It displays the **effective** value (`project ?? global`) with a source hint when inherited from global, writes the **project** value on toggle, and triggers the landed folder-scoped reload (`POST /api/resources/reload { scope: "local", cwd }`) so tools + edit-flow skill apply live. Works with zero flows and with zero open sessions.
- **Server: edit-mode read/write endpoint** following the #232 route pattern: GET returns `{ project, global, effective }` read from pi-flows' own two files; PUT writes the requested scope (`project` → `<cwd>/.pi/settings.json`, `global` → `~/.pi/agent/settings.json`) with a format-preserving JSON merge.
- **Global setting stays, retargeted:** `FlowsSettings` (global settings section) keeps its toggle but now writes pi's real global layer (`~/.pi/agent/settings.json#flows.editFlow`) via the same endpoint, instead of the dashboard-private `plugins.flows.editFlow` config.
- **Remove the private config + destructive reconcile:** delete `editFlow` from `configSchema.json` and the `flows.length`-guarded reconcile `useEffect` in `SessionFlowActionsClaim`. The subcard's `editMode` gating switches from `usePluginConfig` to the effective read-back. pi-flows' `project ?? global` resolution at `session_start` replaces the reconcile.

## Capabilities

### New Capabilities
- `folder-settings-sections`: a generic react-only slot rendering plugin-contributed sections on the DirectorySettings surface, scoped to the folder's cwd.

### Modified Capabilities
- `flows-edit-mode-settings`: remove the dashboard-private global config default and the auto-reconcile-on-availability requirement; redefine edit-mode as a folder-settings toggle (project scope) plus a retargeted global toggle (pi global scope), with effective-value read-back and folder-scoped live reload.

## Impact

- **Code (this repo):**
  - `packages/shared/src/dashboard-plugin/slot-types.ts` — add `folder-settings-section` (react-only, many; non-breaking minor).
  - `packages/client/src/components/DirectorySettings/DirectorySettings.tsx` — host the slot.
  - `packages/server/src/routes/` — new flows edit-mode read/write route (pattern: `resource-activation-routes.ts`); reuses landed `POST /api/resources/reload`.
  - `packages/flows-plugin/` — slot claim + toggle component; `FlowsSettings` retargeted to global scope; `configSchema.json` drops `editFlow`; `SessionFlowActions.tsx` drops the reconcile `useEffect` and reads effective edit-mode.
  - `packages/client/src/generated/plugin-registry.tsx` — regenerate.
- **No changes** to pi-flows (its `edit-flow-config.ts` resolution and `session_start` reconcile are already correct) or to the bridge (`flow_management set-edit-mode` remains available but is no longer the dashboard's write path).
- **Behavioral:** existing `~/.pi/dashboard/config.json#plugins.flows.editFlow` values become inert (safe to ignore). Per-cwd control lives on the folder settings page; global default lives in pi's own settings file.
- **Consumers:** other plugins (kb, memory, automation) gain a folder-scoped settings surface for free via the new slot.
