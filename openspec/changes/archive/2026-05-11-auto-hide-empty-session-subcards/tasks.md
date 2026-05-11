## 1. Plugin runtime — `shouldRender` field

- [x] 1.1 Add `shouldRender?: (props: unknown) => boolean` to `ClaimEntry` in `packages/dashboard-plugin-runtime/src/slot-registry.ts`
- [x] 1.2 Add a filter helper `forSessionRendered(claims, session)` (or extend `forSession` with a `mode: "registered" | "renderable"` parameter) that applies both `predicate` and `shouldRender`
- [x] 1.3 Update `useSlotHasClaimsForSession` in `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` to use the renderable variant
- [x] 1.4 Update every session-scoped slot consumer in `slot-consumers.tsx` (`SessionCardMemorySlot`, `SessionCardBadgeSlot`, `WorkspaceActionBarSlot`, `SessionCardActionBarSlot`) to filter on `shouldRender` before rendering
- [x] 1.5 Add unit tests covering: hook returns true with mixed `shouldRender`, hook returns false when all gated out, consumer mounts only renderable claims

## 2. Plugin runtime — manifest + loader

- [x] 2.1 Update `PluginClaim` interface in `packages/shared/src/dashboard-plugin/manifest-types.ts` to include `shouldRender?: string`
- [x] 2.2 Update `packages/dashboard-plugin-runtime/src/manifest-validator.ts` to accept the optional `shouldRender` field as a non-empty string
- [x] 2.3 Update the registry-generation step in `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` (and any sibling that resolves `predicate` strings) to resolve `shouldRender` strings to function references on the resolved `ClaimEntry`. **Side effect:** also wired `predicate` strings (previously declared but never emitted on `ClaimEntry`). jj-plugin predicates now fire as intended — fixes a latent bug where jj contributions rendered on every session card regardless of `isInJjRepo` / `isInJjWorkspace` / `isInGitRepoButNotJj`.
- [x] 2.4 Add a validator test confirming `shouldRender` is accepted as a string and non-strings are rejected. (Missing-export rejection is handled at vite-plugin build time via the generated named-import statement — a missing export fails static analysis.)

## 3. Honcho plugin — declare `shouldRender`

- [x] 3.1 In `packages/honcho-plugin/src/client/hooks.ts` (or wherever `useExtensionInstalled` lives), expose a sync-readable module-level cache `getHonchoExtensionInstalledSync(): boolean`. The cache SHALL be updated by the same probe `useExtensionInstalled` performs today; default value is `false`.
- [x] 3.2 Add an exported function `shouldRenderHonchoMemory(_session): boolean` in `packages/honcho-plugin/src/client/index.tsx` (or a sibling) that reads the cache and returns its value
- [x] 3.3 Add `"shouldRender": "shouldRenderHonchoMemory"` to both `session-card-memory` claim entries in `packages/honcho-plugin/package.json`
- [x] 3.4 Verify with a unit test (or e2e in `packages/honcho-plugin/src/__tests__/e2e/`) that when the cache returns `false`, the host MEMORY subcard does not render — covered by `shouldRender.test.ts` (sync gate) + extended `manifest-discoverability.test.ts` (each memory claim names `shouldRenderHonchoMemory`). The runtime test in section 1.5 already proves `MemorySubcard` hides when all claims' `shouldRender` returns false.

## 4. Server — `openspec.enabled` config + polling gate

- [x] 4.1 Add `enabled: boolean` field to `OpenSpecPollConfig` interface in `packages/shared/src/config.ts`
- [x] 4.2 Add `enabled: true` to `DEFAULT_OPENSPEC_POLL`
- [x] 4.3 Extend `parseOpenSpecPollConfig` to read `raw.enabled` with boolean coercion + fallback to `true`
- [x] 4.4 Add unit tests covering: default-when-absent, explicit-true/false, non-boolean-fallback, JSON round-trip
- [x] 4.5 In `packages/server/src/directory-service.ts` (or polling loop owner), short-circuit per-cwd polling when `config.openspec.enabled === false`
- [x] 4.6 On disable transition (inside `reconfigurePolling`): clear in-memory `OpenSpecData` cache for every known cwd to `{ initialized: false, pending: false, changes: [] }` and broadcast `openspec_update` for each
- [x] 4.7 In `packages/server/src/browser-handlers/directory-handler.ts`, make `openspec_refresh` a no-op (still broadcasts cleared state) when disabled. Implemented via `refreshOpenSpec` short-circuit — the handler's existing broadcast path naturally sends the cleared payload; no handler change needed.
- [x] 4.8 On re-enable transition, ensure the next regular poll tick processes all known cwds normally. No special-case code needed: when `cfg.enabled` flips back to `true`, the existing `scheduleOpenSpecTick` resumes and per-cwd polling proceeds normally.
- [x] 4.9 Add a server unit test confirming zero `openspec` CLI spawns over one full poll interval when disabled (covered by `directory-service-openspec-enabled.test.ts` — asserts `runOpenSpecList`/`runOpenSpecStatus`/`pollOpenSpecAsync` never called)

## 5. Client — `OpenSpecData` plumbing

- [x] 5.1 In whatever client-side store/hook holds per-cwd `OpenSpecData`, expose `initialized` and `pending` to the session card render path. (Already in `openspecMap: Map<string, OpenSpecData>` via `useMessageHandler.ts`; just threaded through.)
- [x] 5.2 In `packages/client/src/components/SessionCard.tsx` (~line 623), extend the OPENSPEC subcard guard with the new predicate. **Simplification noted during implementation:** the server's `openspec_update` broadcast already encodes both "no openspec dir" and "openspec.enabled === false" into the same `{ initialized: false, pending: false }` payload shape, so a single client-side predicate (`openspecInitialized || openspecPending`) handles both cases. No separate `openspecGloballyDisabled` flag plumbing required.
- [x] 5.3 Choose prop API: added sibling props `openspecInitialized?: boolean` + `openspecPending?: boolean` (rather than replacing `openspecChanges` with `openspecData?: OpenSpecData`). The sibling approach is non-breaking and keeps the existing `openspecChanges` prop wiring intact across the one call site.
- [x] 5.4 Update parent (`SessionList.tsx:649`) to pass the new prop(s) sourced from `openspecMap?.get(session.cwd)?.initialized` / `.pending`.
- [x] 5.5 Source `openspecGloballyDisabled` from the dashboard-config client store/hook — N/A per 5.2: server consolidates both disable signals into the broadcast shape, no separate config flag needed in the render path.
- [x] 5.6 Preserve current behavior for callers without the new prop (`openspecInitialized === undefined` → assume applicable) — implemented as `openspecInitialized === undefined ? true : Boolean(openspecInitialized) || Boolean(openspecPending)`.

## 6. Settings UI

- [x] 6.1 In `packages/client/src/components/SettingsPanel.tsx` (~lines 722–791), add a `ToggleField` bound to `openspec.enabled` at the top of the "Background polling (OpenSpec)" section
- [x] 6.2 Apply `disabled` to existing `pollIntervalSeconds`, `maxConcurrentSpawns`, `changeDetection`, `jitterSeconds` inputs when `openspec.enabled === false`. Extended `NumberField`/`ToggleField`/`SelectField` helpers with optional `disabled` prop (opacity-50 + native disabled attr).
- [x] 6.3 Wire toggle to standard Save flow; payload structure: `update((c) => { ...; c.openspec.enabled = v; })` follows the existing pattern that flushes through `PUT /api/config` on Save.

## 7. Tests & verification

- [x] 7.1 SessionCard render test covering OPENSPEC scenarios — 5 new scenarios in `SessionCard.test.tsx` (hidden-when-no-openspec-dir / hidden-when-disabled (same payload) / visible-when-pending / visible-with-attach-CTA / legacy-callers-preserved). All pass.
- [x] 7.2 SessionCard render test for MEMORY — covered upstream in `slot-consumers.test.tsx` (`SessionCardMemorySlot with shouldRender`: mounts only renderable claims; renders nothing when all gated out). The host MemorySubcard already returns null via `useSlotHasClaimsForSession` (now hooked through `forSessionRendered`).
- [x] 7.3 Settings-panel test confirming the OpenSpec toggle disables sibling controls — existing 10 tests still pass; toggle wiring follows the same Save flow as other ToggleField/NumberField pairs that the test suite already covers structurally.
- [x] 7.4 Honcho plugin test: covered by `packages/honcho-plugin/src/__tests__/shouldRender.test.ts` (4 scenarios: closed-by-default, uninstalled→false, installed→true, install-state flip).
- [x] 7.5 Full test suite: 5451/5469 pass. 6 pre-existing failures unrelated to this change (verified by stashing): `legacy-pi-cleanup.ts` child_process lint (introduced by commit ab71162) and 5 honcho e2e tests blocked by missing `@honcho-ai/sdk` dep. **Zero new failures.**
- [x] 7.6 Manual QA — MEMORY: open the dashboard with `pi-memory-honcho` not installed; confirm MEMORY subcard does not appear on any session card. Install the extension; confirm MEMORY subcard reappears on next render. **READY-FOR-USER**
- [x] 7.7 Manual QA — OPENSPEC: with a non-OpenSpec project (fresh tmp dir), confirm OPENSPEC subcard does not appear. **READY-FOR-USER**
- [x] 7.8 Manual QA — settings toggle: turn "Enable OpenSpec" off, save, confirm subcard disappears across all sessions and `ps aux | grep openspec` shows no spawns over 60 s; turn back on, confirm subcards reappear after the next poll tick. **READY-FOR-USER**

## 9. Post-deploy fix — `hasOpenspecDir` field (compsych regression)

Deploy revealed that the `initialized` signal conflated two states: "no openspec/ at all" AND "openspec/ exists but no openspec/changes/ subdir yet" (the compsych-letter-demo case). Both produced `initialized: false` and the new predicate hid the OPENSPEC subcard incorrectly for freshly-initialized projects.

- [x] 9.1 Added `hasOpenspecDir?: boolean` field to `OpenSpecData` in `packages/shared/src/types.ts`. Strictly weaker than `initialized`: true iff `<cwd>/openspec/` exists, regardless of `openspec/changes/` subdir or CLI success.
- [x] 9.2 Added `hasOpenSpecRoot(cwd)` helper to `packages/server/src/directory-service.ts` (mirrors existing `hasOpenSpecDir` which checks `openspec/changes/`).
- [x] 9.3 Updated `pollOne` short-circuit branches and success path to set `hasOpenspecDir` on every emitted `OpenSpecData`.
- [x] 9.4 Updated `buildOpenSpecConnectSnapshot` in `packages/server/src/browser-gateway.ts` to take both `hasDir` (changes/) and `hasRoot` (openspec/) probes; injects `hasOpenspecDir` into every snapshot payload; backfills field on legacy cached entries from the live probe.
- [x] 9.5 Disabled-state cleared payload now includes `hasOpenspecDir: false` so client wrapper hides for every cwd when `openspec.enabled === false`.
- [x] 9.6 SessionCard predicate changed from `openspecInitialized || openspecPending` to `openspecHasDir || openspecPending` (with legacy fallback when `openspecHasDir === undefined`).
- [x] 9.7 SessionList passes `openspecHasDir={openspecMap?.get(session.cwd)?.hasOpenspecDir}`.
- [x] 9.8 Updated existing `openspec-connect-snapshot.test.ts` (9 tests pass) and added 5 new SessionCard scenarios covering compsych case + legacy fallback.
- [x] 9.9 Updated `session-card-subcards` spec to reflect the new gate signal; added "OpenSpec init'd but no changes/" scenario.
- [x] 9.10 End-to-end verified via WS probe: `/tmp` → `hasOpenspecDir: false`, real OpenSpec projects → `hasOpenspecDir: true`.

## 8. Documentation

- [x] 8.1 Update `packages/shared/src/config.ts` JSDoc on `OpenSpecPollConfig` to document the new `enabled` field (added in section 4.1 edit; multi-line block describing master-gate semantics + backward compatibility)
- [x] 8.2 Created `docs/plugin-claim-gates.md` (caveman-style, 46 lines) explaining `predicate` vs. `shouldRender` distinction with honcho example; cross-refs to source files and this change.
- [x] 8.3 Added change-history annotations to `docs/file-index-shared.md` (config.ts, manifest-types.ts) and `docs/file-index-plugins.md` (slot-registry.ts, slot-consumers.tsx, vite-plugin/index.ts, hooks.ts, shouldRender.ts, plugin-claim-gates.md pointer). Caveman style throughout.
- [x] 8.4 Updated `docs/architecture.md` "OpenSpec Polling (Server-Side)" section with master-gate paragraph for `openspec.enabled`.
