# Fix stale "Managed install" Doctor check

## Why

Doctor currently emits a `WARN` row on every clean install:

> **Managed install (~/.pi-dashboard)** — Not created yet — will be set up on first run.
> *Run the setup wizard (Help → Setup) to finish first-run install.*

The advice is wrong on three counts under the post-`eliminate-electron-runtime-install` architecture:

1. **The directory is never created.** Change `2026-05-26-eliminate-electron-runtime-install` removed the runtime-install pyramid. Pi / openspec / tsx now ship pre-installed under `resources/server/node_modules/` inside the immutable bundle. No code path under `packages/electron/src/` or `packages/server/src/` writes to `~/.pi-dashboard/` anymore. Verified: `grep -rn "\.pi-dashboard" packages/{electron,server}/src` returns only doctor / advisory / legacy-detector callers.
2. **The "Help → Setup" wizard the suggestion points to no longer installs anything.** Today's wizard (`packages/electron/src/renderer/wizard.html`, ~179 LOC) is a welcome card with a `[Launch dashboard]` CTA. `wizard-state.ts` carries an explicit `TODO(simplify-electron-bootstrap-derived-state Phase C)` noting it is kept only for the `LAUNCH_SOURCE_V2=false` legacy path and is to be deleted.
3. **A second Doctor row, in the same report, directly contradicts the first.** `packages/electron/src/lib/doctor.ts:333` emits:
   > **Legacy install directory** — `~/.pi-dashboard` no longer used. Safe to delete manually.

   So a user upgrading from pre-R3 sees one row saying "incomplete, run wizard" and another saying "safe to delete". The two rows describe the same directory.

Net effect: clean installs ship with a perpetual yellow ⚠ that cannot be resolved by any user action.

## What Changes

### Single source of truth — move the legacy advisory into shared

- Delete the obsolete `Managed install (~/.pi-dashboard)` `safeCheck(...)` block in `packages/shared/src/doctor-core.ts` (lines 1056–1074) and its companion entries in `SECTION_OF` (line 390) and `SUGGESTIONS` (lines 505–508).
- Replace it with a single advisory built from the existing `detectLegacyManagedDir()` helper (already in `packages/shared/src/legacy-managed-dir.ts`). The advisory row is **emitted only when `legacy.present === true`** — clean installs see nothing.
- Remove the duplicate emission block in `packages/electron/src/lib/doctor.ts` (lines 333–356) — the Electron Doctor inherits the shared row via `runSharedChecks(...)`.

### Why move it into shared (not just delete the shared row)

`packages/server/src/routes/doctor-routes.ts` also calls `runSharedChecks(...)` to power Settings → Diagnostics in the browser (`DiagnosticsSection.tsx`). If we only delete the stale row, the server-rendered Doctor loses the **correct** legacy-cleanup advisory entirely. Moving the advisory into `doctor-core.ts` fixes the false positive AND extends the genuine signal to the browser surface.

### Resulting Doctor output

| State                                | Before                                                    | After                                              |
|--------------------------------------|-----------------------------------------------------------|----------------------------------------------------|
| Clean install (no `~/.pi-dashboard/`)| ⚠ "Not created yet — run setup wizard"                    | *(no diagnostics row)*                             |
| Upgrade from pre-R3 (dir present)    | ⚠ "Managed install" + ⚠ "Legacy install directory"        | ⚠ "Legacy install directory — safe to delete"     |

### Non-goals

- Not sweeping every "Run the setup wizard (Help → Setup)" string elsewhere in `doctor-core.ts` (lines 437, 443, 460, 474, 500). Those suggestions guard different checks (bundled Node missing, pi library missing, etc.); whether they are still accurate is a separate question that deserves its own change. Surface it after this one lands.
- Not removing `~/.pi-dashboard/mode.json` or `recommended.json` writes from `wizard-state.ts` — that file is already TODO'd for deletion under Phase C of `simplify-electron-bootstrap-derived-state`. Out of scope here.
- No spec capability changes. The diagnostic UI is implementation detail; no `openspec/specs/` capability owns the row taxonomy.

## Impact

- `packages/shared/src/doctor-core.ts` — net `-25` lines in three spots, `+~15` lines for the legacy advisory.
- `packages/electron/src/lib/doctor.ts` — net `-25` lines (delete the now-redundant advisory).
- `packages/shared/src/__tests__/doctor-format.test.ts` — fixture row name `"Managed install (~/.pi-dashboard)"` → `"Legacy install directory"` (cosmetic; the test only checks section ordering).
- New unit test in `packages/shared/src/__tests__/doctor-core.test.ts` (or extend existing) covering: legacy dir absent → no advisory row; present → one advisory row with correct path / pkgCount / sizeMb.
- `packages/server/src/__tests__/doctor-routes.test.ts` (if present) gains one regression case asserting no "Managed install" row on the happy path.
- No migration. No rollback risk: removed rows are advisory-only and previously emitted false warnings.
- Compatibility: doctor JSON consumers that key off the row name "Managed install (~/.pi-dashboard)" will no longer see it. Confirmed via `grep -rn "Managed install"` — only doctor-core, doctor.ts, doctor-format.test, and dist artifacts reference the literal. No client component or CI step keys off it.
