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

- [ ] 4.1 `packages/server/src/cli.ts:255` — remove `"tsx"` from `installPackages`.
- [ ] 4.2 `packages/server/src/server.ts:802` — remove `"tsx"` from the default install array.
- [ ] 4.3 `packages/electron/src/lib/dependency-installer.ts:260` — remove `"tsx"` from `installStandalone`'s package list.
- [ ] 4.4 `packages/electron/src/lib/power-user-install.ts:42` — remove `"tsx"` (V1 legacy — keep aligned even if currently dead-on-shipped under `LAUNCH_SOURCE_V2=true`).
- [ ] 4.5 `packages/shared/src/bootstrap-install.ts:216` — remove `"tsx"` from the shared bootstrap default.
- [ ] 4.6 Update test fixtures pinning the 3-element install-list shape (search: `git grep -nE '"tsx"' packages/*/src/__tests__/`).

## 5. Doctor cleanup

- [ ] 5.1 `packages/electron/src/lib/doctor.ts` — delete the `where/which tsx` probe (line ~396), the `testTsxBin` variable (line ~407), and the `"No tsx binary"` detail string (line ~427). Doctor's "Server launch test" reduces to checking `node` + pi.
- [ ] 5.2 Update `packages/electron/src/lib/__tests__/doctor*.test.ts` (or shared `doctor-core.ts` tests) to drop tsx-probe expectations.

## 6. Dependency removal

- [ ] 6.1 Remove `"tsx": "..."` from every workspace `package.json` declaring it. Search: `git grep -nE '"tsx":' --` (top level). Likely sites: root `package.json`, `packages/server/package.json`, `packages/electron/package.json`. Drop both `dependencies` and `devDependencies` entries.
- [ ] 6.2 `npm install` to regenerate `package-lock.json`. Commit the lockfile delta.
- [ ] 6.3 Verify no transitive consumer remains: `npm ls tsx` should report nothing under any workspace package, or only under unrelated optional deps that shadow-install it.

## 7. Coordination boundary (with `unify-server-launch-ts-loader`)

- [ ] 7.1 In-body tsx fallback at `packages/server/src/cli.ts:366–377` (cmdStart try-jiti-except-tsx) — **owned by `unify-server-launch-ts-loader §3.2.1`**, NOT this change. If this change lands first and that block still exists, leave it alone (it will be deleted in `unify-server-launch-ts-loader §3.2.1`). Note in CHANGELOG that the in-body block is removed by the sister change.
- [ ] 7.2 Legacy electron V1 tsx-first launch path (`packages/electron/src/lib/server-lifecycle.ts:274–440` `resolveTsxCommand` + tsx-first branch in `launchServer`) — **owned by `unify-server-launch-ts-loader §3.4.1`**, NOT this change.
- [ ] 7.3 Zombie `packages/electron/src/lib/ts-loader-resolver.ts` — **owned by `unify-server-launch-ts-loader §6.4`**.
- [ ] 7.4 Cross-link in both proposals' CHANGELOG drafts so the merge order is unambiguous.

## 8. Verification

- [ ] 8.1 `openspec validate replace-tsx-with-jiti --strict` passes.
- [ ] 8.2 `npm test` green across all workspaces.
- [ ] 8.3 `npm run reload:check` (typecheck + reload) green.
- [ ] 8.4 Manual: install fresh on a clean machine — `~/.pi-dashboard/node_modules/tsx` does NOT appear after bootstrap.
- [ ] 8.5 Manual: `pi-dashboard status` works through the new wrapper with pi on PATH.
- [ ] 8.6 Manual: in a sandbox without pi, `pi-dashboard status` fails fast with the stderr install-hint and exit 1 (no silent tsx fallback).
- [ ] 8.7 Manual: extension auto-launch still works (`npm run reload`, confirm server starts with jiti loader).
- [ ] 8.8 Manual: Electron cold-launch on every `LaunchSource` succeeds; Doctor no longer reports tsx-related rows.
