## Why

The dashboard server already uses jiti as its primary TypeScript loader at every runtime spawn site (extension `server-launcher.ts`, server `cli.ts cmdStart` daemon spawn, electron `launch-source.ts spawnFromSource`). What remains is to **fully extrude tsx from runtime and bootstrap** so the codebase has one TS loader, not two:

1. **`pi-dashboard` bin shebang.** `packages/server/src/cli.ts:1` still reads `#!/usr/bin/env node --import tsx`. A shebang cannot resolve a dynamic jiti path, so the bin entry hard-requires tsx at parse time. Replaced by a small `bin/pi-dashboard.mjs` wrapper that resolves jiti at runtime.

2. **Five install lists ship tsx alongside pi.** Verified on `develop`:
   - `packages/server/src/cli.ts:255` — `installPackages = ["@earendil-works/pi-coding-agent", "@fission-ai/openspec", "tsx"]`
   - `packages/server/src/server.ts:802` — same default duplicated
   - `packages/electron/src/lib/dependency-installer.ts:260` — `installStandalone()` writes tsx to `~/.pi-dashboard/`
   - `packages/electron/src/lib/power-user-install.ts:42` — V1 legacy installer
   - `packages/shared/src/bootstrap-install.ts:216` — shared bootstrap helper
   
   Every list pairs tsx with `@earendil-works/pi-coding-agent`, which itself ships `jiti` (`JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]` per `resolve-jiti.ts`). tsx is therefore dead weight in every list — the "tsx fallback for non-pi environments" rationale is hollow because tsx is never installed without pi being installed.

3. **Doctor probes for tsx as if it were required.** `packages/electron/src/lib/doctor.ts:396,407,427` runs `where/which tsx` and reports "No tsx binary" when missing. After tsx is gone, this turns into noise.

4. **`tsx` devDependency.** Carried in workspace package.json files. With every runtime call site removed, it is a build-time-only dep with no consumer.

The earlier stance ("retain tsx as fallback for environments without pi on PATH") is incorrect: every install path that creates `~/.pi-dashboard/` installs pi alongside tsx. There is no realised "no-pi" path that benefits from the fallback. Removing tsx end-to-end removes ~120 KB of dependency, two install-list inconsistencies, and the doctor-noise.

## What Changes

### Bin wrapper (no tsx fallback)
- ~~Replace `--import tsx` with jiti in spawn sites~~ *(Already done)*
- ~~Add a shared helper to resolve pi's jiti register path~~ *(Already done — `packages/shared/src/resolve-jiti.ts`)*
- Replace the `#!/usr/bin/env node --import tsx` shebang at `packages/server/src/cli.ts:1` with `#!/usr/bin/env node`.
- Add `packages/server/bin/pi-dashboard.mjs` — a tiny ESM wrapper that calls `resolveJitiImport()` (or `ToolResolver.resolveJiti()` once `unify-server-launch-ts-loader` lands) and re-execs `node --import <jiti> cli.ts <args>`. **No tsx fallback** — if jiti cannot be resolved, exit with a clear error pointing the user at `npm install -g @earendil-works/pi-coding-agent` (or whichever pi-pkg is the current default). This is the right error for a real "no pi" state; today it's masked by tsx silently picking up the slack while behaving differently from jiti.
- Repoint `bin.pi-dashboard` in `packages/server/package.json` to the new wrapper.

### Install-list cleanup (5 sites)
- Remove `"tsx"` from each of:
  - `packages/server/src/cli.ts:255` `installPackages`
  - `packages/server/src/server.ts:802` default
  - `packages/electron/src/lib/dependency-installer.ts:260` `installStandalone` package list
  - `packages/electron/src/lib/power-user-install.ts:42` (V1 legacy — keep aligned even if legacy)
  - `packages/shared/src/bootstrap-install.ts:216` shared bootstrap
- Update any test fixtures that pin the 3-element array shape.

### Doctor cleanup
- Remove the `where/which tsx` probe and the "No tsx binary" detail string from `packages/electron/src/lib/doctor.ts`. Doctor already probes for `node` and pi; jiti rides with pi.

### Dependency removal
- Remove `"tsx": "..."` from every workspace `package.json` that declares it (root + any package depending on it). Run `npm install` to regenerate lockfile.

### Coordination with `unify-server-launch-ts-loader`
That sister change owns the **in-body tsx fallback removal in two places**:
- `packages/server/src/cli.ts:366–377` `cmdStart` try-jiti-except-tsx block — deleted in `unify-server-launch-ts-loader §3.2.1` when `cmdStart` is migrated to `launchDashboardServer`.
- `packages/electron/src/lib/server-lifecycle.ts:274–440` legacy V1 `launchServer` tsx-first path + `resolveTsxCommand()` — deleted (or migrated tsx-free) in `unify-server-launch-ts-loader §3.4.1`.

Either order works. If `unify-server-launch-ts-loader` lands first: this change just deletes the install lists, Doctor probe, devDep, and shebang. If this change lands first: `unify-server-launch-ts-loader §3.2.1` and `§3.4.1` collapse to one-line deletions of code that was already isolated.

## Capabilities

### Modified Capabilities
- `dashboard-server`: CLI bin entry switches from a tsx shebang to a jiti-only JS bootstrap. tsx removed from the runtime resolution chain.
- `jiti-loader`: documented as the **only** TS loader. Fallback semantics removed.
- `packaging`: `bin.pi-dashboard` repointed; `tsx` dependency removed; `tsx` removed from every bootstrap install list.

## Impact

- **Files (new)**: `packages/server/bin/pi-dashboard.mjs`.
- **Files (modified)**:
  - `packages/server/src/cli.ts` — shebang + remove tsx from `installPackages`.
  - `packages/server/src/server.ts` — remove tsx from default install list.
  - `packages/server/package.json` — `bin.pi-dashboard` repoint, `files` array, drop `tsx` dep.
  - `packages/electron/src/lib/dependency-installer.ts` — remove tsx from `installStandalone`.
  - `packages/electron/src/lib/power-user-install.ts` — remove tsx from list.
  - `packages/electron/src/lib/doctor.ts` — drop tsx probe + detail string.
  - `packages/shared/src/bootstrap-install.ts` — remove tsx from default packages.
  - Workspace `package.json` files declaring `tsx` — drop the dep.
  - `package-lock.json` — regenerated.
  - Test fixtures pinning the install-list shape.
- **Dependencies**: `tsx` removed everywhere.
- **Runtime**: no behaviour change for users with pi installed (the only realised path); no-pi error path now fails loudly with a clear install hint instead of silently switching loaders.
- **Risk**: Low-medium. The "tsx fallback was actually catching real failures" hypothesis would surface as cold-launch failures on machines where pi-coding-agent install succeeded but jiti specifically did not — extremely unlikely, since jiti is a direct pi-coding-agent dep. Mitigated by the loud error message in the new wrapper and by smoke-testing each install path post-change.
