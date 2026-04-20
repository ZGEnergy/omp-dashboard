## 1. Providers-ready hook

- [x] 1.1 Add failing test `packages/client/src/hooks/__tests__/useProvidersReady.test.ts`: hook returns `ready=false, count=0` while loading; returns `ready=true, count=N` when `/api/providers` has any entry with non-empty `apiKey`; returns `ready=false` when all entries have empty `apiKey`.
- [x] 1.2 Implement `packages/client/src/hooks/useProvidersReady.ts` fetching `/api/providers` on mount; cache result in hook state.
- [x] 1.3 Add window `focus` refetch listener and a listener for `provider-auth-event` custom event; clean up on unmount.
- [x] 1.4 Run client tests; confirm new assertions pass.

## 2. Lift `PinDirectoryDialog` into App

- [x] 2.1 Add failing test `packages/client/src/components/__tests__/SessionList.test.tsx` (extend existing or add): "Add folder" button calls `onOpenPinDialog` prop instead of rendering dialog internally.
- [x] 2.2 Remove `showPinDialog` state and `<PinDirectoryDialog>` mount from `SessionList.tsx`; add `onOpenPinDialog?: () => void` prop; wire the "Add folder" button to it.
- [x] 2.3 In `App.tsx`, add `pinDialogOpen` state, mount `<PinDirectoryDialog>` once inside a `DialogPortal` when open, wire its `onPin` to the existing `send({ type: "pin_directory", path })` call, and pass `onOpenPinDialog={() => setPinDialogOpen(true)}` to `SessionList`.
- [x] 2.4 Manual smoke (noted in tests/description): sidebar "Add folder" still opens the dialog and still pins the chosen directory.

## 3. LandingPage redesign

- [x] 3.1 Add failing test `packages/client/src/components/__tests__/LandingPage.test.tsx` covering all three cards × three states:
  - Step ① pending when `providersReady=false`; clicking CTA calls `navigate("/settings?tab=providers")`.
  - Step ① done row when `providersReady=true`.
  - Step ② locked with "Requires: credentials" when `providersReady=false`.
  - Step ② pending when `providersReady=true && pinnedCount===0`; CTA calls `onOpenPinDialog`.
  - Step ② done row when `pinnedCount>0`.
  - Step ③ locked with "Requires: a folder" when `pinnedCount===0`.
  - Step ③ pending when `pinnedCount>0 && sessionsCount===0`; CTA calls `onSpawnSession(firstPinnedCwd)`.
  - Step ③ done row when `sessionsCount>0`.
  - All three done → compact "✔ …" rows only, no CTA buttons rendered.
- [x] 3.2 Rewrite `LandingPage.tsx` to accept `{ providersReady, pinnedCount, sessionsCount, firstPinnedCwd, onOpenPinDialog, onSpawnSession, navigate }`.
- [x] 3.3 Render the header block (π + title) unchanged for all users. Render three cards/rows per the state table in `design.md` D1.
- [x] 3.4 Use existing styling tokens (`--border-secondary`, `--text-tertiary`, etc.) and Tailwind classes consistent with neighbouring components (see `SessionList.tsx`, `FolderActionBar.tsx`).
- [x] 3.5 Ensure locked CTAs have `disabled` attribute and visible disabled styling plus a `title` attribute explaining the prerequisite.

## 4. Wire LandingPage into App

- [x] 4.1 Compute `firstPinnedCwd` in `App.tsx` from the existing pinned groups/preferences (first entry of `pinnedDirs`).
- [x] 4.2 Compute `pinnedCount` and `sessionsCount` from existing state (`pinnedDirs.length`, `sessions.length`).
- [x] 4.3 Pass all props to both `<LandingPage />` sites (desktop `sessionDetail ?? <LandingPage … />` and mobile twin).
- [x] 4.4 Use `useProvidersReady()` near existing bootstrap hooks in `App.tsx`; pass `ready` as `providersReady`.
- [x] 4.5 Extend `packages/client/src/components/__tests__/routing.test.tsx`: the LandingPage test was superseded by the dedicated `LandingPage.test.tsx` covering the 3-card structure end-to-end; routing test keeps its existing minimal-fallback assertion which remains valid (no-props backward-compat path).

## 5. Cross-cutting verification

- [x] 5.1 Ran affected vitest suites (`useProvidersReady`, `LandingPage`, `SessionList`) — all new tests pass (28/28 new+existing). 4 pre-existing `SessionList spawn button` failures exist on `main` and are unrelated to this change. Full `npm test` skipped per user request (kills sessions).
- [x] 5.2 Type-check: `npx tsc -b` passes for `packages/client`; remaining errors are pre-existing in `packages/server`.
- [x] 5.3 Manual smoke — fresh state transitions verified by user.
- [x] 5.4 Manual smoke — fully-configured returning user shows three ✔ rows only.
- [x] 5.5 Manual smoke — sidebar "Add folder" button still opens the dialog (regression ok).

## 6. Docs

- [x] 6.1 Update `AGENTS.md`: `LandingPage.tsx` one-liner to reflect onboarding role; add `useProvidersReady.ts`; note `PinDirectoryDialog` mount moved to `App.tsx`.
- [x] 6.2 Update `docs/architecture.md` (UI section) with a short paragraph on the onboarding surface and which endpoints it observes.
- [x] 6.3 README does not reference the old empty-state text; no update needed.
