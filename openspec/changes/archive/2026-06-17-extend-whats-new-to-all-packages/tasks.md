# Tasks

## 1. Server: relax the endpoint gate
- [x] 1.1 In `pi-changelog-routes.ts`, replace the `CORE_PACKAGE_NAMES.includes(pkg)` check with `isValidNpmPackageName(pkg)`: reject empty, `..`, and `/` except a single scope slash (`@scope/name`).
- [x] 1.2 Keep all downstream behavior unchanged (range validation, findChangelogPath, remote-first, empty-on-missing).
- [x] 1.3 Verify: `pkg=pi-web-access` → 200 with 21 releases; `pkg=../../etc/passwd` → 400; `pkg=pi-agent-browser` (no CHANGELOG) → 200 empty.

## 2. Server: resolve globally-installed packages
- [x] 2.1 Add `isValidNpmPackageName(pkg)` to `changelog-fs.ts` (exported, type guard).
- [x] 2.2 Add **Strategy 4** to `findChangelogPath`: search global node_modules roots derived from `process.execPath` (`<prefix>/lib/node_modules` Unix/nvm, `<prefix>/node_modules` Windows). Test seam `opts.globalNodeModules`. Covers packages that are NOT dashboard dependencies (the prior gap — global extensions were invisible to bare-import + walk-up strategies).

## 3. Client: per-row wiring
- [x] 3.1 New `WhatsNewPackageRow.tsx` wrapper owns its own `usePiChangelog` hook + `WhatsNewDialog` state so it can render inside `.map()` (hooks cannot run in a loop in the parent).
- [x] 3.2 `UnifiedPackagesSection.renderInstalledRow` routes recommended/other rows through the wrapper; query enabled only when `updateAvailable`. `npmNameFromSource()` derives the package name from `npm:<name>[@version]`, returns null for git/local (no query).
- [x] 3.3 Empty changelog response → `whatsNewKind` undefined → no icon, no warning.
- [x] 3.4 Range for non-core rows: `from=installedVersion`, `to=9999.0.0` sentinel (all newer releases); dialog `latestVersion` falls back to top release version / `data.to`.

## 4. Tests
- [x] 4.1 `pi-changelog-routes.test.ts`: malformed-name (`..%2F..`) → 400; valid non-core name (`evil-pkg`) with no CHANGELOG → 200 empty.
- [x] 4.2 Existing whitelist-rejection test replaced by the two name-format tests above.

## 5. Verify
- [x] 5.1 `npm test -- changelog` green (73/73).
- [x] 5.2 Rebuilt client + restarted; browser check: pi core shows ⓘ icon; up-to-date recommended extensions correctly show no icon (no update → no query).
- [x] 5.3 Live-confirm icon on a non-core package that has a pending update (blocked: all installed extensions currently up-to-date; server path proven via `pi-web-access` → 21 releases).
