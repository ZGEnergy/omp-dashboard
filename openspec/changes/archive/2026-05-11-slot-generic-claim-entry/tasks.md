## 1. Shared slot taxonomy

- [x] 1.1 In `packages/shared/src/dashboard-plugin/slot-types.ts`, add internal `SessionScopedSlot` and `FolderScopedSlot` union aliases enumerating the eight session-scoped slot ids and the one folder-scoped slot id (per design D1 and dashboard-shell-slots delta).
- [x] 1.2 Add public `export type SlotPredicateInput<S extends SlotId>` conditional type returning `DashboardSession | null | undefined` for `SessionScopedSlot`, `FolderDescriptor` for `FolderScopedSlot`, and `never` otherwise.
- [x] 1.3 Append a compile-time exhaustiveness assertion (analogous to `_AssertAllSlotsCovered`) named `_AssertAllSlotsPredicateClassified` that fails type-checking if a `SlotId` lacks a `SlotPredicateInput` classification.
- [x] 1.4 Verify the new `SlotPredicateInput` is exported from the shared package's `dashboard-plugin/slot-types.js` entry (already a public path).

## 2. Runtime registry contract

- [x] 2.1 In `packages/dashboard-plugin-runtime/src/slot-registry.ts`, import `SlotPredicateInput` from the shared package alongside the existing `SlotId` import.
- [x] 2.2 Convert `interface ClaimEntry` to `interface ClaimEntry<S extends SlotId = SlotId>` with `slot: S`, `predicate?: (input: SlotPredicateInput<S>) => boolean`, `shouldRender?: (input: SlotPredicateInput<S>) => boolean`. Leave all other fields untouched.
- [x] 2.3 Confirm `SlotRegistry`, filter helpers (`forSession`, `forSessionRendered`, `forFolder`, `forCommand`, `forTab`, `forToolName`), and `createSlotRegistry()` compile unchanged — the default `S = SlotId` keeps their signatures intact (per design D2).

## 3. Static-registry generator

- [x] 3.1 In `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts`, regenerate `packages/client/src/generated/plugin-registry.tsx`. First attempt: rely on TypeScript's discriminant narrowing on the `slot:` field within `ClaimEntry[]` literals. Inspect the regenerated output to confirm session-shaped predicates registered on session slots type-check (per design D3). Method-shorthand bivariance on `predicate`/`shouldRender` made this work without regenerating — the existing generated file type-checks under the new contract.
- [x] 3.2 If step 3.1 leaves any TS2322 errors in `plugin-registry.tsx`, update the emitter to write each claim as `{ … slot: "literal" as const, … } satisfies ClaimEntry<"literal">`. Re-run regeneration and re-check. Not needed — step 3.1 sufficient.

## 4. In-tree plugin updates

- [x] 4.1 In `packages/honcho-plugin/src/client/shouldRender.ts`, retype the exported function from `(_session: unknown): boolean` to `(session: DashboardSession | null | undefined): boolean`. Update internal references inside the function body to use the now-typed `session` parameter. Runtime behavior MUST remain identical (verify against `packages/honcho-plugin/src/__tests__/shouldRender.test.ts`). Test fixtures retyped from `{ id: "s1" }` to `null` (function ignores the arg).
- [x] 4.2 Confirm `packages/jj-plugin/src/client/predicates.ts` requires no source changes — its existing strongly-typed predicates are the canonical shape under the new contract.

## 5. Verification

- [x] 5.1 Run `npm run lint` and confirm the three `plugin-registry.tsx` TS2322 errors are gone, with no new TypeScript errors introduced anywhere.
- [x] 5.2 Run `npm test` and confirm zero regressions. The honcho `shouldRender.test.ts` suite MUST still pass with the retyped function (parameter narrowing is purely TS-level). Test fixtures retyped to pass `null` instead of `{ id: "s1" }`. Pre-existing failures (legacy-pi-cleanup child_process lint, honcho e2e @honcho-ai/sdk module-not-found) confirmed unrelated via baseline-stash check.
- [x] 5.3 Manually sanity-check `packages/client/src/generated/plugin-registry.tsx`: every jj-plugin claim and honcho-plugin claim renders the same predicate/shouldRender references as before, only the surrounding type context has changed.
- [x] 5.4 Add a regression unit test at `packages/dashboard-plugin-runtime/src/__tests__/claim-entry-typing.test.ts` with `@ts-expect-error` lines for session↔folder predicate cross-registration. Surfaced and corrected an overreaching spec scenario about `never`-input slots: method-shorthand bivariance makes those registrations compile (filter helpers ignore them at runtime); spec + design + test updated to honest behavior.

## 6. Documentation

- [x] 6.1 Update the entry for `packages/dashboard-plugin-runtime/src/slot-registry.ts` in `docs/file-index-plugins.md` (or whichever split owns it) to note the new generic `ClaimEntry<S>` shape. Single-row, caveman style. Done via delegated subagent.
- [x] 6.2 Update the entry for `packages/shared/src/dashboard-plugin/slot-types.ts` in `docs/file-index-shared.md` to record `SlotPredicateInput<S>` as an additional public export. Single-row, caveman style. Plus honcho `shouldRender.ts` row updated in `docs/file-index-plugins.md`. Done via delegated subagent.
- [-] 6.3 If `dashboard-plugin-skill` ships predicate authoring guidance, add a sentence noting that plugins MAY type predicate parameters precisely against `SlotPredicateInput<"slot-id">` and that legacy `unknown` parameters remain accepted. Skipped — dashboard-plugin-skill currently has no predicate authoring section to extend; the regression-test fixture documents the contract in code. Capture as future-doc TODO if a predicate authoring guide is added.

## 7. Archive readiness

- [x] 7.1 Run `openspec validate slot-generic-claim-entry --strict` and confirm clean output.
- [x] 7.2 Ensure every task above is checked off and the working tree shows no unrelated diff. Working tree contains: 6 source files changed (slot-types, slot-registry, honcho shouldRender + test, settings panel, directory-service test), 2 docs rows updated, 1 new regression test, full proposal directory under `openspec/changes/slot-generic-claim-entry/`. Source edits 1.1 + 1.2 (the trivial drift from commit 5514c38) plus the slot-generic-claim-entry change — nothing unrelated.
