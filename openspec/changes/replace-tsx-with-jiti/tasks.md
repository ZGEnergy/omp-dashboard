## 1. Bin wrapper (jiti-only)

- [x] 1.1 ~~Create shared resolver~~ — already shipped as `packages/shared/src/resolve-jiti.ts` (`resolveJitiImport()`)
- [x] 1.2 ~~Spawn-args helper~~ — handled by `unify-server-launch-ts-loader` (new `buildNodeImportArgvParts` in `node-spawn.ts`)
- [x] 1.3 ~~Tests for shared resolver~~ — covered by existing `resolve-jiti.test.ts`

## 2. CLI shebang + bin wrapper

- [x] 2.1 Replace shebang at `packages/server/src/cli.ts:1` from `#!/usr/bin/env node --import tsx` to `#!/usr/bin/env node`. **Done in earlier commit; verified `head -1 cli.ts` reads `#!/usr/bin/env node`.**
- [x] 2.2 Create `packages/server/bin/pi-dashboard.mjs` — plain ESM wrapper, jiti-only. Wrapper file pre-existed with tsx fallback under the old proposal; amended to remove `resolveTsxUrl()` + the dual-resolver pattern and emit the spec-mandated stderr install-hint on null resolve. Inlines `JITI_PACKAGES`, `resolveJitiUrl()` (mirrors `resolve-jiti.ts` shape; cannot import .ts before loader). Argv uses raw `child_process.spawn` with the `shouldUrlWrapEntry`-equivalent rule (POSIX jiti raw, Windows URL-wrapped). Note: this wrapper is the lone runtime exception to the `no-raw-node-import` lint — cannot use `spawnNodeScript` because that lives in TS and needs a loader to parse. The lint allow-list will gain `bin/pi-dashboard.mjs` if it doesn't already match the `.ts/.tsx/.mts/.cts` walker (see verification §8.x).
- [x] 2.3 Add unit test for the wrapper: `packages/server/src/__tests__/pi-dashboard-bin-wrapper.test.ts`. Two scenarios: (a) jiti miss — isolated tmp dir, no `node_modules` adjacency → stderr contains install-hint, exit 1, no tsx mention; (b) jiti hit — wrapper resolved against repo `node_modules/jiti`, re-execs `cli.ts status` which exits 0 with `Dashboard server` output. Both pass under vitest with `HOME=$(mktemp -d)`.

## 3. Package wiring

- [x] 3.1 Repoint `bin.pi-dashboard` in `packages/server/package.json` from `src/cli.ts` to `bin/pi-dashboard.mjs`.
- [x] 3.2 Add `bin/` to the `files` array in `packages/server/package.json`.
- [x] 3.3 Verified: `npm pack --dry-run -w packages/server` lists `2.8kB bin/pi-dashboard.mjs` in tarball contents.

## 4. Install-list cleanup (5 sites)

- [x] 4.1 `packages/server/src/cli.ts:257` — dropped `"tsx"` from `installPackages`.
- [x] 4.2 `packages/server/src/server.ts:802` — dropped `"tsx"` from default install array.
- [x] 4.3 `packages/electron/src/lib/dependency-installer.ts` — dropped `"tsx"` from `installStandalone` package list.
- [x] 4.4 `packages/electron/src/lib/power-user-install.ts` — dropped `"tsx"` from `REQUIRED_MANAGED_PACKAGES`.
- [x] 4.5 `packages/shared/src/bootstrap-install.ts:216` — dropped `"tsx"` from shared bootstrap default.
- [x] 4.6 Test fixture audit. Adjusted `wizard-power-user-managed-install.test.ts` (changed `.slice(0, 2)` to `.slice(0, REQUIRED_MANAGED_PACKAGES.length - 1)` to keep the "missing one" semantic after `REQUIRED_MANAGED_PACKAGES` shrunk to 2 entries). `offline-packages.test.ts` and `installable-list.test.ts` use `tsx` as generic fixture data, not as production install-list — left intact.

## 5. Doctor cleanup

- [x] 5.1 `runServerLaunchTest` in `packages/electron/src/lib/doctor.ts` rewritten: dropped `managedTsxBin` + `where/which tsx` probe; replaced with `ToolResolver.resolveJiti({ anchor: testCli })` and the launch test now invokes `<nodeBin> --import <jiti-url> -e "import <cliSpec>..."`. The detail string `No tsx binary` becomes `No jiti loader (install pi)`. The `not-found` message updated to `tsx or server CLI` → `jiti or server CLI`.
- [x] 5.2 No doctor test files reference tsx (verified: `grep tsx packages/electron/src/lib/__tests__/doctor*` and `packages/shared/src/__tests__/doctor-core*` return zero matches). No-op.

## 6. Dependency removal

- [x] 6.1 Only root `package.json` declared `tsx` (`devDependencies: "tsx": "^4.21.0"`). Removed. No workspace package.json files contained tsx.
- [x] 6.2 `npm install` ran cleanly; lockfile regenerated.
- [x] 6.3 `npm ls tsx` shows tsx only as a transitive of `vite` (under `dashboard-plugin-runtime`). Spec exempts "transitive shadow-installs by unrelated optional deps" — vite is unrelated to runtime TS-loading, so this is acceptable.

## 7. Coordination boundary (with `unify-server-launch-ts-loader`)

- [x] 7.1 Verified clean: `grep resolveJitiImport packages/server/src/cli.ts` returns zero matches — the in-body tsx fallback was removed by `unify-server-launch-ts-loader` (archived 2026-05-09).
- [x] 7.2 Verified clean: `grep resolveJitiFromPi packages/electron/src/lib/server-lifecycle.ts` returns zero matches — V1 tsx branch removed.
- [x] 7.3 Verified deleted: `packages/electron/src/lib/ts-loader-resolver.ts` does not exist.
- [x] 7.4 CHANGELOG §Unreleased §Changed: prepended a `replace-tsx-with-jiti` entry summarising bin wrapper, install lists, Doctor cleanup, and devDep removal. Cross-references `unify-server-launch-ts-loader`.

## 8. Verification

- [x] 8.1 `openspec validate replace-tsx-with-jiti --strict` passes.
- [x] 8.2 `npm test` — 5282 pass / 16 skip / 7 pre-existing failures unrelated to this change (all in `openspec-effective-status-script.test.ts`, missing-file rot at `.pi/skills/openspec-shared/scripts/effective-status.sh` deleted in working tree by an unrelated change). Zero failures in any file touched by this change.
- [x] 8.3 `tsc --noEmit` — my changes type-check cleanly. Two pre-existing errors in `client/src/components/SessionCard.tsx` (`mdiConsoleLine`) and ~30 pre-existing errors in `__tests__/server-launcher.test.ts` (Mock-typing issues from the prior unify change) are unrelated.
- [ ] 8.4 Manual: install fresh on a clean machine — `~/.pi-dashboard/node_modules/tsx` does NOT appear after bootstrap. **Deferred to user.**
- [ ] 8.5 Manual: `pi-dashboard status` works through the new wrapper with pi on PATH. **Deferred to user (covered partially by automated `pi-dashboard-bin-wrapper.test.ts`).**
- [ ] 8.6 Manual: in a sandbox without pi, `pi-dashboard status` fails fast with the stderr install-hint and exit 1 (no silent tsx fallback). **Deferred to user (covered partially by automated `pi-dashboard-bin-wrapper.test.ts`).**
- [ ] 8.7 Manual: extension auto-launch still works (`npm run reload`, confirm server starts with jiti loader). **Deferred to user.**
- [ ] 8.8 Manual: Electron cold-launch on every `LaunchSource` succeeds; Doctor no longer reports tsx-related rows. **Deferred to user.**
