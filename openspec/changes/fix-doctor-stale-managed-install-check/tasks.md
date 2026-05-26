# Tasks

## 1. Delete the stale "Managed install" check from shared doctor

- [ ] 1.1 In `packages/shared/src/doctor-core.ts`, remove the `safeCheck("Managed install (~/.pi-dashboard)", ...)` block (currently lines 1056–1074).
- [ ] 1.2 Remove the `"Managed install (~/.pi-dashboard)": "diagnostics"` entry from `SECTION_OF` (line 390).
- [ ] 1.3 Remove the `"Managed install (~/.pi-dashboard)": (status) => ...` entry from `SUGGESTIONS` (lines 505–508).
- [ ] 1.4 Grep `packages/shared/src/doctor-core.ts` for the literal `"Managed install"` — assert zero remaining occurrences (no leftover comments referencing the deleted row).

## 2. Move the legacy-directory advisory into shared

- [ ] 2.1 In `packages/shared/src/doctor-core.ts`, near the bottom of `runSharedChecks(...)` (after the existing Watchdog block, before `return checks`), add a new advisory:
  ```ts
  // Legacy ~/.pi-dashboard advisory — emit only when the directory exists.
  // Under R3 nothing reads or writes it; this row tells the user it's safe
  // to delete. See change: fix-doctor-stale-managed-install-check.
  try {
    const { detectLegacyManagedDir } = await import("./legacy-managed-dir.js");
    const legacy = detectLegacyManagedDir();
    if (legacy.present) {
      checks.push({
        name: "Legacy install directory",
        section: "diagnostics",
        status: "warning",
        message: `Legacy directory at ${legacy.path} — no longer used. Safe to delete manually.`,
        detail: `${legacy.pkgCount} packages, ~${legacy.sizeMb} MB.`,
        suggestion:
          "Left over from a previous version. Nothing reads or writes it under the immutable-bundle architecture. " +
          `Delete it manually (e.g. \`rm -rf ${legacy.path}\`) to reclaim disk space.`,
      });
    }
  } catch {
    /* advisory only — never block doctor output */
  }
  ```
- [ ] 2.2 Add `"Legacy install directory": "diagnostics"` to `SECTION_OF`. (Belt-and-suspenders — `stampSectionsAndSuggestions` falls back to `"diagnostics"` anyway, but explicit beats inferred.)
- [ ] 2.3 No `SUGGESTIONS` entry needed — the row already carries an inline `suggestion`. Verify `stampSectionsAndSuggestions` honours the pre-set `suggestion` and does not overwrite (re-read line 1083 to confirm `!c.suggestion` guard is in place).

## 3. Drop the duplicate advisory from the Electron Doctor

- [ ] 3.1 In `packages/electron/src/lib/doctor.ts`, delete the `// ── Legacy ~/.pi-dashboard/ advisory ──` block (currently lines 333–357), including its `import("@blackbelt-technology/pi-dashboard-shared/legacy-managed-dir.js")` call.
- [ ] 3.2 Verify the file still compiles — `npm run build -w packages/electron` clean. The `legacy-managed-dir.js` import was scoped inside the deleted block, so no dangling top-level import.

## 4. Tests

- [ ] 4.1 In `packages/shared/src/__tests__/doctor-format.test.ts:30`, rename the fixture row `"Managed install (~/.pi-dashboard)"` → `"Legacy install directory"`. The test only validates section ordering; the row name change is cosmetic but keeps the codebase grep-clean of the obsolete literal.
- [ ] 4.2 Add `packages/shared/src/__tests__/doctor-core-legacy-advisory.test.ts` (new file). Two cases:
  - Mock `detectLegacyManagedDir` to return `{ present: false }` → `runSharedChecks(...)` result contains no row with `name === "Legacy install directory"`.
  - Mock to return `{ present: true, path: "/fake/.pi-dashboard", pkgCount: 4, sizeMb: 42 }` → result contains exactly one row with that name, `status === "warning"`, `message` includes the path, `detail` includes `"4 packages"` and `"42 MB"`.

  Stub via `vi.mock("../legacy-managed-dir.js", ...)`. Pass a `runSharedChecks` deps shape that short-circuits other expensive probes (mirror the existing test fixtures for that file — locate via `grep -rn "runSharedChecks" packages/shared/src/__tests__`).
- [ ] 4.3 If `packages/server/src/__tests__/doctor-routes.test.ts` exists, add a regression case: with no `~/.pi-dashboard/` on disk, `GET /api/doctor` response contains no row with `name === "Managed install (~/.pi-dashboard)"`. (Stub `detectLegacyManagedDir` if the test is hermetic; otherwise rely on the absent dir on the CI runner.)
- [ ] 4.4 Grep the repo for the literal `"Managed install"` — only matches should be (a) historical references inside `openspec/changes/archive/...` and (b) dist artifacts under `packages/electron/out/`. No live source under `packages/*/src/` should still carry the literal.

## 5. Manual verification

- [ ] 5.1 Clean machine (no `~/.pi-dashboard/`): launch Electron Doctor → Diagnostics section shows no "Managed install" and no "Legacy install directory" rows.
- [ ] 5.2 Upgrade simulation: `mkdir -p ~/.pi-dashboard/node_modules/dummy` → re-run Doctor → exactly one row "Legacy install directory" in Diagnostics with status `warning`. Browse Settings → Diagnostics in the browser, confirm the same row appears via `/api/doctor`.
- [ ] 5.3 Cleanup: `rm -rf ~/.pi-dashboard` (only if the test machine actually had no real legacy install — for the developer's own machine, follow the suggestion text verbatim).

## 6. Docs

- [ ] 6.1 No AGENTS.md change — the deleted check was not in the architectural-backbone "Key Files" list.
- [ ] 6.2 Update `docs/file-index-shared.md` row for `legacy-managed-dir.ts`: append "Used by `runSharedChecks` to emit the sole `~/.pi-dashboard` advisory row. See change: fix-doctor-stale-managed-install-check." (Caveman style, per Documentation Update Protocol — delegate the write to a general-purpose subagent.)
- [ ] 6.3 Update `docs/file-index-shared.md` row for `doctor-core.ts`: append "Advisory row for legacy `~/.pi-dashboard` lives here under `runSharedChecks`. See change: fix-doctor-stale-managed-install-check." (Same delegation rule.)
- [ ] 6.4 Update `docs/file-index-electron.md` row for `doctor.ts`: append "Duplicate legacy-`~/.pi-dashboard` advisory removed — shared `runSharedChecks` now owns it. See change: fix-doctor-stale-managed-install-check." (Same delegation rule.)
- [ ] 6.5 No `docs/faq.md` entry needed — the change removes a confusing warning, doesn't introduce one.

## 7. Verify

- [ ] 7.1 `npm test` runs green across `packages/shared`, `packages/server`, `packages/electron`.
- [ ] 7.2 `openspec validate fix-doctor-stale-managed-install-check --strict`.
- [ ] 7.3 Restart dashboard (`curl -X POST http://localhost:8000/api/restart`), browse to Settings → Diagnostics, confirm no "Managed install (~/.pi-dashboard)" row appears on a clean install.
