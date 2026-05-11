## Why

`ClaimEntry.predicate` and `ClaimEntry.shouldRender` are typed `(props: unknown) => boolean`, but at runtime are always called with one of exactly two concrete shapes determined by the slot id:

- `forSession(claims, session: DashboardSession)` → `predicate(session)` for session-scoped slots (`session-card-badge`, `workspace-action-bar`, `content-view`, …).
- `forFolder(claims, folder: FolderDescriptor)` → `predicate(folder)` for `sidebar-folder-section`.

The `unknown` contract pushes the type system out of the way at exactly the boundary where a slot/predicate mismatch should be caught. In-tree plugins already split along the gap: `honcho-plugin` writes `(_session: unknown) => boolean` defensively, while `jj-plugin` writes `(session: DashboardSession | null | undefined) => boolean` — which TypeScript rejects at the registration site (contravariant param) and forces a workaround. Neither plugin is "wrong"; the registry contract is.

Tightening this now — while every plugin in the registry is in-tree — costs little and prevents a future class of registration-time mistakes (e.g. attaching a session-shaped predicate to `sidebar-folder-section`).

## What Changes

- Introduce `SlotPredicateInput<S extends SlotId>` mapped type in `@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/slot-types.js`, keyed by the existing `SlotId` taxonomy.
- Make `ClaimEntry` generic over slot id: `ClaimEntry<S extends SlotId = SlotId>`, with `predicate?: (input: SlotPredicateInput<S>) => boolean` and `shouldRender?: (input: SlotPredicateInput<S>) => boolean`.
- `viteDashboardPluginsPlugin` generator emits each entry typed as `ClaimEntry<"literal-slot-id">`, so slot/predicate-shape mismatches surface at build time.
- `honcho-plugin`'s `shouldRenderHonchoMemory` retyped from `(_session: unknown)` to `(session: DashboardSession | null | undefined)`.
- `jj-plugin` predicates: no source change — TypeScript will now accept them.
- **Non-BREAKING**: external plugins typed against `unknown` remain valid (contravariance allows a more-permissive parameter type to satisfy a narrower one).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `dashboard-plugin-loader`: tighten the `ClaimEntry` predicate/shouldRender contract from `(props: unknown) => boolean` to a slot-keyed `(input: SlotPredicateInput<S>) => boolean`. Affects the runtime registry types and the static-registry generator.
- `dashboard-shell-slots`: extend the slot taxonomy with a `SlotPredicateInput<S>` mapped type classifying each slot id as session-scoped, folder-scoped, or predicate-irrelevant.

## Impact

- **Code touched**: `packages/shared/src/dashboard-plugin/slot-types.ts` (new mapped type), `packages/dashboard-plugin-runtime/src/slot-registry.ts` (generic `ClaimEntry`), `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` (emit literal slot ids), `packages/client/src/generated/plugin-registry.tsx` (regenerated), `packages/honcho-plugin/src/client/shouldRender.ts` (retype). Estimated ~80 LoC net.
- **APIs**: `ClaimEntry` is exported from `@blackbelt-technology/dashboard-plugin-runtime`. Type signature becomes generic with a `SlotId` default, so existing untyped usage compiles unchanged. `SlotPredicateInput<S>` is a new public type export from `@blackbelt-technology/pi-dashboard-shared`.
- **Dependencies**: none.
- **Migration**: external plugins need no source changes. In-tree `honcho-plugin` gains stronger types on `shouldRenderHonchoMemory`. `jj-plugin` is unblocked (3 compile errors in generated `plugin-registry.tsx` resolved).
- **Rollback**: revert the generic on `ClaimEntry` and the `SlotPredicateInput` export. Plugin sources continue to work either way.
