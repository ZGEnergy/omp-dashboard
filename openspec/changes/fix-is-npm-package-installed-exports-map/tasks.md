## 1. Shared helper

- [x] 1.1 Create `packages/shared/src/managed-package-detect.ts` exporting `isPackageInstalledOnDisk(name: string, managedDir: string, expectedVersion?: string): boolean`. Implementation: `fs.existsSync` on `<managedDir>/node_modules/<...name.split("/")>/package.json`. When `expectedVersion` is provided and not `"*"`, read the file, parse JSON, compare the `version` field. Return false on corrupt JSON.
- [x] 1.2 Add JSDoc explaining the exports-map gotcha and pointing at this openspec change.

## 2. Use the helper in the two call sites

- [x] 2.1 `packages/server/src/bootstrap-install-from-list.ts`: replace the body of `isNpmPackageInstalled` with a delegation to `isPackageInstalledOnDisk(pkgName, managedDir)`. Keep the export for back-compat. Update the inline call site to pass `pkg.version` so version comparison fires.
- [x] 2.2 `packages/electron/src/lib/power-user-install.ts`: replace the body of `isManagedDirPopulated` to iterate `ELECTRON_OWNED_PACKAGES` and call `isPackageInstalledOnDisk(name, managedDir)` for each. Preserve the JSON-parse-failure semantics (return false on corrupt package.json).

## 3. Tests

- [x] 3.1 Unit test `packages/shared/src/__tests__/managed-package-detect.test.ts`. Fixture plants:
  - `<tmp>/node_modules/@scope/restricted-exports/package.json` with `{"version": "1.0.0", "exports": {".": "./index.js"}}`
  - `<tmp>/node_modules/no-exports/package.json` with `{"version": "2.0.0"}`
  - `<tmp>/node_modules/corrupt/package.json` with raw text `not-json`

  Assertions:
  - `isPackageInstalledOnDisk("@scope/restricted-exports", tmp)` → true (the bug-fix scenario)
  - `isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "1.0.0")` → true
  - `isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "2.0.0")` → false
  - `isPackageInstalledOnDisk("@scope/restricted-exports", tmp, "*")` → true (wildcard skips version check)
  - `isPackageInstalledOnDisk("no-exports", tmp)` → true
  - `isPackageInstalledOnDisk("corrupt", tmp)` → false
  - `isPackageInstalledOnDisk("not-there", tmp)` → false

- [x] 3.2 Lint test `packages/shared/src/__tests__/no-require-resolve-pkg-package-json.test.ts`. Walk every `.ts/.tsx` under `packages/*/src/` (excluding `__tests__/`). Fail if any line matches `(?:require|req|createRequire\(.*?\))\.resolve\([^)]+\+\s*["']/package\.json["']\)` without the marker `require-resolve-pkgjson-ok` on the same line.

- [x] 3.3 Existing tests for `isNpmPackageInstalled` and `isManagedDirPopulated` SHALL keep passing. Update any test that relied on the old `require.resolve`-based semantics (e.g. tests that expected `false` when an exports-map blocked resolution).

## 4. Build + smoke

- [x] 4.1 `npm run build:local` in `packages/electron/`. Verify the bundle-staleness gate from `fix-build-installer-stale-server-bundle` detects the changed files and re-bundles.
- [x] 4.2 Install the new DMG (over the existing one). Quit any running PI Dashboard. Relaunch.
- [x] 4.3 Tail `~/.pi/dashboard/server.log` and confirm:
  - `[bootstrap] bootstrap.installable.package name=@earendil-works/pi-coding-agent source=offline-cache status=satisfied`
  - Same for `@fission-ai/openspec` and `tsx`.
  - The `[2026-...] Electron launch ...` line is followed within ~50ms by `[bootstrap] bootstrap.installable.done total=5 installed=5 failed=0`. Compare to current ~5–10s.
- [x] 4.4 `curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8000/api/config` SHALL return `HTTP 200` (was `HTTP 500` before the fix).
- [x] 4.5 Open Settings in the browser. The panel SHALL load with values populated (no "Failed to load settings" toast).

## 5. Docs

- [x] 5.1 `docs/file-index-server.md` row for `bootstrap-install-from-list.ts` extended with: "Presence check delegates to `@blackbelt-technology/pi-dashboard-shared/managed-package-detect.js`; uses fs.existsSync, never `require.resolve` (exports-map traps). See change: fix-is-npm-package-installed-exports-map." Caveman style per AGENTS.md (delegate to subagent).
- [x] 5.2 Add a row for the new `packages/shared/src/managed-package-detect.ts`. Same delegation.
