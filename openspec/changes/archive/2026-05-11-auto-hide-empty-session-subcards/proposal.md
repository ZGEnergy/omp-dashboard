## Why

Two distinct subcards on the desktop session card render as empty boxes today, contradicting the documented "hide when empty" rule in `session-card-subcards`:

1. **OPENSPEC** — renders whenever the session card receives the `openspecChanges`/handler props (essentially always). Sessions whose `cwd` has no `openspec/` directory show an empty OPENSPEC subcard with only an "attach…" CTA, even though OpenSpec is not applicable. There is also no way to suppress the subcard fleet-wide.

2. **MEMORY** — the `honcho-plugin` is bundled as a workspace package and registers two `session-card-memory` claims (`HonchoBadge`, `HonchoCardActions`) **without a predicate**. `useSlotHasClaimsForSession` returns `true` for every session because claims exist at the registry level. The slot consumer then mounts both components — but each returns `null` when the `pi-memory-honcho` extension is not installed (`useExtensionInstalled` gate). Result: an empty translucent panel with the `MEMORY` capsule legend, exactly as the user observed.

The honcho-memory-plugin spec **explicitly requires** that the subcard stay hidden when contributions render `null` (see `openspec/specs/honcho-memory-plugin/spec.md` line 52). The current implementation cannot honor that contract, because `useSlotHasClaimsForSession` checks claim existence — not whether the claim's component will produce visible output. React does not expose a sound way to know that without speculatively rendering.

These are two facets of the same UX issue ("don't render empty subcards"), but they have different mechanisms (host-gated vs. plugin-gated). This proposal ships them together so the rule is consistent across the session card.

## What Changes

### A. Plugin runtime — opt-in `shouldRender` on claims
- Extend `ClaimEntry` and `PluginClaim` with an optional `shouldRender?: (props) => boolean` callback (alongside the existing `predicate`).
- Semantic: `predicate` answers *"does this claim apply to this target?"* (filters claims at registry level). `shouldRender` answers *"will this claim's component produce visible output for this target?"* (gates the **wrapper** without speculative rendering).
- `useSlotHasClaimsForSession(slotId, session)` SHALL return `true` only when at least one matching claim **also** passes `shouldRender(session)` (default: `() => true`).
- The slot consumer SHALL still mount only the components for which `shouldRender` returned `true` (or was absent), so empty contributions don't sneak past the wrapper gate.

### B. Honcho plugin — declare `shouldRender` for its claims
- The two `session-card-memory` claims (`HonchoBadge`, `HonchoCardActions`) SHALL provide a `shouldRender(session)` returning `false` when the `pi-memory-honcho` extension is not installed.
- The check SHALL read from the same source the components use today (extension-installed signal). Because `shouldRender` runs synchronously, the plugin SHALL maintain a sync-readable cache of the install state (populated by the existing async probe), and treat unknown / probing state as `false` (closed by default — no flicker).

### C. OpenSpec subcard — host-side gate (unchanged from prior scope)
- New optional config field `openspec.enabled` (default `true`). When `false`, OpenSpec is fully disabled across the dashboard.
- Server skips OpenSpec polling when disabled and clears cached `OpenSpecData`.
- The OPENSPEC subcard SHALL hide when EITHER:
  - `openspec.enabled === false`, OR
  - `OpenSpecData.initialized === false && pending === false` (no `openspec/` dir in `cwd`).
- Settings UI exposes the `openspec.enabled` toggle.

### D. WORKSPACE / future subcards — automatic benefit from A
- The WORKSPACE subcard already uses `useSlotHasClaimsForSession` for `session-card-badge` and `workspace-action-bar`. Once A lands, plugins contributing to those slots can declare `shouldRender` to avoid the same empty-wrapper bug.
- No code change to `WorkspaceSubcard` is required by this proposal; it inherits the fix.

### Not in scope (deferred)

- A2 (lint rule + dev-mode warning when a claim renders to `null`). Worth doing later as a separate quality-of-life proposal.
- N2 (stop bundling honcho-plugin and ship as opt-in). Separate distribution decision.
- Promoting OPENSPEC to a plugin slot. Mentioned in the prior scope as "future direction"; still out of scope here.
- Generalizing `SessionSubcard` to take a `hidden` prop. The current per-subcard wrapper-component pattern is fine.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dashboard-plugin-loader`: `PluginClaim` interface gains optional `shouldRender` field; manifest validator MUST accept it; loader MUST resolve it (string name → exported function reference) and pass it through to the runtime.
- `session-card-subcards`: OPENSPEC visibility predicate extended (no `openspec/` dir, `openspec.enabled === false`). MEMORY/WORKSPACE behavior clarified to require `shouldRender` semantics (the subcard hides when no claim's `shouldRender` returns true).
- `shared-config`: New optional `openspec.enabled` boolean (default `true`).
- `server-openspec-polling`: Polling gated by `openspec.enabled`; cache cleared on disable.
- `settings-panel`: New `openspec.enabled` toggle.
- `honcho-memory-plugin`: Honcho's two `session-card-memory` claims SHALL declare `shouldRender` reflecting the `pi-memory-honcho` extension-installed state.

## Impact

**Code:**
- `packages/dashboard-plugin-runtime/src/slot-registry.ts` — add `shouldRender` to `ClaimEntry`; new helper `forSessionRendered` (or extend `forSession` with a `mode` flag).
- `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` — `useSlotHasClaimsForSession` consults `shouldRender`; slot consumers (`SessionCardMemorySlot`, `SessionCardBadgeSlot`, `WorkspaceActionBarSlot`, …) skip claims whose `shouldRender` returned `false`.
- `packages/dashboard-plugin-runtime/src/manifest-validator.ts` — accept optional `shouldRender: string` field on claims.
- `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` (or wherever the registry is generated from manifests) — resolve `shouldRender` string → exported function ref, mirror existing predicate handling.
- `packages/honcho-plugin/src/client/index.tsx` — export a `shouldRender` function wired to the install-state cache.
- `packages/honcho-plugin/src/client/hooks.ts` (or wherever `useExtensionInstalled` lives) — expose a sync-readable cached flag the new export can read.
- `packages/honcho-plugin/package.json` — add `shouldRender: "shouldRenderHonchoMemory"` (or similar) to both `session-card-memory` claim entries.
- `packages/shared/src/config.ts` — add `enabled: boolean` to `OpenSpecPollConfig`, default `true`.
- `packages/server/src/directory-service.ts` — short-circuit polling when disabled; clear+broadcast cache on disable transition.
- `packages/server/src/browser-handlers/directory-handler.ts` — `openspec_refresh` no-op when disabled.
- `packages/client/src/components/SessionCard.tsx` — extend OPENSPEC guard with new conditions.
- `packages/client/src/components/SettingsPanel.tsx` — add `openspec.enabled` toggle and disable sibling controls when off.
- Parent of `SessionCard` (`SessionsView.tsx` or equivalent) — pass through `OpenSpecData.initialized`/`pending` (or full `OpenSpecData`).

**APIs:**
- `PluginManifest.PluginClaim.shouldRender?: string` — NEW optional field. Manifest validator accepts; existing manifests still valid.
- `ClaimEntry.shouldRender?: (props) => boolean` — NEW runtime field. Existing claims still resolve.
- `DashboardConfig.openspec.enabled?: boolean` — NEW optional, default `true`. Existing configs unchanged.

**Migration / compatibility:**
- All new fields are optional with sensible defaults. No data migration. No protocol bump.
- Honcho plugin without the `shouldRender` update behaves as today (still has the empty-wrapper bug). After the update, the wrapper hides correctly.
- Old client connecting to new server: receives `openspec_update` with cleared payload when `enabled === false` — falls back to current empty-state UX (attach CTA), no crash.

**Rollback:**
- Pure additive on all surfaces. Drop the spec changes, restore guards, leave the new fields in place (treated as no-op). No data migration needed.

**Risk:**
- Low. The architectural change (`shouldRender`) is opt-in, so existing plugins are unaffected.
- One subtle area: ensuring honcho's sync-readable install-state cache populates **before** the first render so we don't show the subcard for one frame and then hide it. Default to `false` until probe completes — proposal calls this out as "closed by default".
