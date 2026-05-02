## 1. Hot-fix capture

- [x] 1.1 Hot-fix in `packages/client/src/App.tsx` line 1512 — gate `<ContentViewSlot/>` on `_pluginRegistry.getClaims("content-view").length > 0` (already deployed during session `019dc93e-ff44-7063-8083-3632afdebc2b`)
- [x] 1.2 Verify the chat view (`sessionDetail`) renders for selected sessions when no plugin claims `content-view` (verified post-restart in production)

## 2. Regression test

- [x] 2.1 Write `packages/client/src/__tests__/content-view-slot-fallback.test.tsx` — three cases: broken pattern (renders nothing), fixed pattern with `claimCount=0` (renders fallback), fixed pattern with `claimCount=1` (renders slot)
- [x] 2.2 Verify the regression test passes against the current (fixed) code

## 3. Repository lint

- [x] 3.1 Write `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts` — scan `packages/client/src/App.tsx` (and a `SCAN_FILES` allowlist for future shell files) for `<\w+Slot/>` adjacent to `??` without a `getClaims(` / `.length [><=]` gate
- [x] 3.2 Two-stage matcher: cap slot-tag span at 300 chars, restrict inter-token vocabulary to `[\s:)null]` between `/>` and `??`, then check a 120-char lookback for the gate token
- [x] 3.3 Sanity tests: matcher catches direct `<Slot/> ?? fb` shape AND the ternary-wrapped production-bug shape, but does NOT match sibling-mounted slots or properly-gated slots
- [x] 3.4 Verify the lint catches the actual production bug by temporarily reverting the App.tsx fix (sed-revert + run test → confirm failure with `App.tsx:1513` line reference) and restoring

## 4. Spec + documentation

- [x] 4.1 Add the anti-pattern Requirement to the `dashboard-shell-slots` capability via `specs/dashboard-shell-slots/spec.md` ADDED Requirements (5 scenarios: direct shape, ternary-wrapped shape, gated shape, sibling-mounted, behavior-test pin)
- [x] 4.2 Add a "JSX slot wrappers and `??` fallback chains" subsection to `docs/architecture.md` § "Plugin Architecture" (mounted as `#### JSX slot wrappers and `??` fallback chains — anti-pattern` after the "Future Work" paragraph), documenting the anti-pattern and the lint guarantee
- [x] 4.3 Cross-link this change from each pending `extract-*-as-plugin/proposal.md` (`extract-flows-as-plugin`, `extract-openspec-as-plugin`, `extract-subagents-as-plugin`, `extract-git-as-plugin`) so each inherits the guardrail when it integrates new slot consumers

## 5. Verification

- [x] 5.1 `npm run build` succeeds (already verified during the deploy of `add-extension-ui-decorations`)
- [x] 5.2 All tests in this change pass: `cd packages/client && npx vitest run src/__tests__/no-jsx-slot-nullish-fallback.test.ts src/__tests__/content-view-slot-fallback.test.tsx` → 8 tests passed
- [x] 5.3 Negative test confirmed: reverting the App.tsx fix makes the lint fail with `App.tsx:1513` line reference
