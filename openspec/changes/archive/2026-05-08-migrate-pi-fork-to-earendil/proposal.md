## Why

The dashboard's runtime resolution chain assumed pi was published as `@mariozechner/pi-coding-agent` (with `@oh-my-pi/pi-coding-agent` as a sibling fork) and that pi's TypeScript loader was published as a namespaced fork (`@mariozechner/jiti` or `@oh-my-pi/jiti`).

As of pi 0.74, the actively-maintained build targeted by this dashboard is published under the `@earendil-works` scope:

- `@earendil-works/pi-coding-agent` (replacing `@mariozechner/pi-coding-agent`)
- `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `@earendil-works/pi-agent-core` (sibling pi packages)
- depends on plain `jiti` (not the namespaced fork)

Symptom: when a user installs pi globally as `@earendil-works/pi-coding-agent` and then launches the dashboard server (either via the Electron app or via the bridge extension loaded inside pi), `resolveJitiImport()` fails with:

> Cannot find pi's TypeScript loader (jiti). Is @mariozechner/pi-coding-agent or @oh-my-pi/pi-coding-agent installed?

…because the lookup arrays in `resolve-jiti.ts`, `pi-core-checker.ts`, `ts-loader-resolver.ts`, and the tool registry only knew the legacy namespaced names.

The `@oh-my-pi/*` line is dead — it was a transient fork that is no longer published. Carrying its name forward dilutes the alias chains and bloats peer-dependency lists.

This change:

1. Promotes `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui` to the **primary** lookup target across the dashboard.
2. Keeps `@mariozechner/pi-coding-agent` as a **legacy fallback** in resolution arrays and as an optional peer dep, so existing installs of the older fork still work.
3. **Removes** every `@oh-my-pi/*` reference from the codebase.
4. Adds plain `jiti` (used by the earendil build) to the jiti loader lookup as the primary target, with `@mariozechner/jiti` retained as legacy fallback.
5. Fixes a latent regression where the Electron-extracted launch path spawned the pi-dashboard CLI with `cwd: process.cwd()`, breaking the CLI's `#!/usr/bin/env node --import tsx` shebang when launched from a directory that has no `node_modules/tsx` (the typical GUI launch case).

## What Changes

### Phase A — Resolution chain promotion (earendil first, mariozechner fallback)

- **MODIFY**: `packages/shared/src/resolve-jiti.ts`
  - `JITI_PACKAGES = ["jiti", "@mariozechner/jiti"]` (was `["@mariozechner/jiti", "@oh-my-pi/jiti"]`).
  - Error message lists `@earendil-works/pi-coding-agent` first, `@mariozechner/pi-coding-agent` as fallback.

- **MODIFY**: `packages/shared/src/tool-registry/definitions.ts`
  - `piPkgAliases = ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"]` (was `["@mariozechner/pi-coding-agent", "@oh-my-pi/pi-coding-agent"]`).
  - The `pi-coding-agent` module registration uses the same ordering.
  - Comment updated: "Sibling probe for an aliased package name (pi: `@earendil-works/*` + `@mariozechner/*` legacy)".

- **MODIFY**: `packages/server/src/pi-core-checker.ts`
  - `CORE_PACKAGE_NAMES` lists `@earendil-works/pi-coding-agent` first, `@mariozechner/pi-coding-agent` second; `@oh-my-pi/pi-coding-agent` removed.
  - `DISPLAY_NAMES`: `@earendil-works/pi-coding-agent` → `"pi (core agent)"`; `@mariozechner/pi-coding-agent` → `"pi (core agent — legacy fork)"`.

- **MODIFY**: `packages/electron/src/lib/ts-loader-resolver.ts`
  - Anchor candidate list tries `@earendil-works/pi-coding-agent` first (global + managed), then `@mariozechner/pi-coding-agent`.
  - Inner jiti probe list: `["jiti", "@mariozechner/jiti"]`.

### Phase B — Type imports + dynamic imports

- **MODIFY**: every `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"` → `from "@earendil-works/pi-coding-agent"`.
- **MODIFY**: every `await import("@mariozechner/pi-coding-agent")` → `await import("@earendil-works/pi-coding-agent")`.
- **MODIFY**: `packages/extension/src/pi-env.d.ts`
  - Declares `@earendil-works/pi-coding-agent` module as primary type provider.
  - Declares `@mariozechner/pi-coding-agent` re-exporting the same `ExtensionAPI` so legacy installs still type-check.
  - Drops the `@oh-my-pi/pi-coding-agent` declaration entirely.

### Phase C — Install lists + peer deps

- **MODIFY**: install commands and lists in `bootstrap-install.ts`, `cli.ts`, `server.ts`, `dependency-installer.ts`, `power-user-install.ts`, `update-checker.ts` — default install package becomes `@earendil-works/pi-coding-agent`.
- **MODIFY**: root `package.json` peerDependencies / peerDependenciesMeta — add `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui` (all optional). Keep `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui` (optional). Drop the three `@oh-my-pi/*` entries.
- **MODIFY**: `packages/extension/package.json` peerDeps — same pattern (`@earendil-works/*` + `@mariozechner/*` optional, `@oh-my-pi/*` dropped).

### Phase D — Test fixtures + assertions

- **MODIFY**: `packages/electron/src/__tests__/jiti-fallback.test.ts` — replaces "tries `@oh-my-pi/jiti` as fallback" with "tries `@mariozechner/jiti` as fallback when bare `jiti` is not available". Probe order asserted as `["jiti", "@mariozechner/jiti"]`.
- **MODIFY**: `packages/shared/src/__tests__/tool-registry-definitions.test.ts` — renames "probes both `@mariozechner` and `@oh-my-pi` alias names" to "probes both `@earendil-works` (preferred) and `@mariozechner` (legacy fallback) alias names". Probe-count assertions unchanged (alias array still length 2).
- **MODIFY**: server `__tests__/*` — every `vi.mock("@mariozechner/pi-coding-agent")` flipped to `vi.mock("@earendil-works/pi-coding-agent")` because tool-registry's primary alias changed.
- **MODIFY**: `packages/server/src/__tests__/pi-core-checker.test.ts` — primary CORE_PACKAGE_NAMES entry expectations updated; display-name assertions updated.
- **MODIFY**: `packages/server/src/__tests__/package-manager-wrapper-resolve.test.ts` — managed-install fixture relocated under `@earendil-works/` so the new probe order finds it on first alias.
- **DELETE**: `packages/shared/src/__tests__/bootstrap/{,/families}/__snapshots__/*.snap` (9 files) — bootstrap probe order + alias names changed; snapshots regenerate on next `vitest run`.

### Phase E — Version pin consistency (pi-coding-agent + sibling packages)

The pre-migration code pinned `@mariozechner/pi-coding-agent@0.70.0` in `piCompatibility` and the offline cache. The dashboard's actual runtime target is now `@earendil-works/pi-coding-agent@0.74.0`. This phase makes every version reference consistent.

- **MODIFY**: `packages/server/package.json` — `piCompatibility.minimum` and `piCompatibility.recommended` bumped from `"0.70.0"` to `"0.74.0"`. The fork-name change is implicit (the version-skew code already probes both fork names — see `pi-version-skew.ts::readCurrentPiVersion`).
- **NOT ADDING**: separate `piCompatibility` entries for `pi-ai` / `pi-tui` / `pi-agent-core`. Rationale: those siblings publish in lockstep with `pi-coding-agent` (the earendil 0.74 build pins them as `"^0.74.0"` exact-minor in its own `package.json`). Pinning pi-coding-agent's version transitively pins the siblings via npm dep resolution. Adding sibling entries would require schema and consumer changes (`pi-version-skew.ts`, `BootstrapCompatibility`, the version-skew UI banner) without buying any additional safety. If a sibling ever desyncs from pi-coding-agent's release train, that's the moment to extend the schema — until then it's dead code.
- **MODIFY**: `packages/electron/offline-packages.json` — pin flips from `@mariozechner/pi-coding-agent@0.70.0` to `@earendil-works/pi-coding-agent@0.74.0`. This is Phase H.1 from the original proposal, brought into scope.
- **REGENERATE**: `packages/electron/resources/offline-packages/{manifest.json,npm-cache.tar.gz}` via `node packages/electron/scripts/bundle-offline-packages.mjs`. Produces a fresh cacache for the new pin.
- **MODIFY**: `packages/shared/src/__tests__/node-spawn-jiti-contract.test.ts` — the `0.70.x` assertion flips to accept `@earendil-works/pi-coding-agent@0.74.x`. The Windows file:/// URL contract that originally motivated this test was a jiti 2.x quirk; the earendil 0.74 build ships `jiti@^2.7.0` which post-dates the broken 2.6.5 and is expected to honour the file:/// behaviour. Re-verification on Windows is recommended but out-of-scope for this change (tracked in tasks H.1 follow-up — "Re-verify Windows file:/// jiti behaviour against jiti 2.7+").
- **MODIFY**: `packages/server/src/__tests__/pi-version-skew.test.ts` — fixture at line ~200 flips from `@mariozechner/pi-coding-agent@0.70.0` to `@earendil-works/pi-coding-agent@0.74.0` to match the bumped piCompatibility floor.
- **MODIFY**: stale comments in `packages/shared/src/platform/node-spawn.ts` (JITI VERSION CONTRACT block) and `packages/electron/src/lib/power-user-install.ts` (header block) — replace `0.70.x` / `0.71.x` references with the current `0.74.x` baseline. Keep the historical 2.6.5 / 0.71.x failure marker because it documents what NOT to ship.

### Phase F — Electron launch-path bug fix (cwd for managed CLI shebang)

- **MODIFY**: `packages/electron/src/lib/server-lifecycle.ts::launchViaCli`
  - `cwd: process.cwd()` → `cwd: MANAGED_DIR` (= `~/.pi-dashboard/`).
  - Rationale: the spawned `pi-dashboard` symlink resolves to a CLI script whose shebang is `#!/usr/bin/env node --import tsx`. Node's bare-specifier resolution for `--import tsx` walks up from cwd. When the GUI app is launched (cwd = `/` or `~`), there is no `node_modules/tsx` in that chain and the spawn dies with `ERR_MODULE_NOT_FOUND`. Setting cwd to the managed dir, where `node_modules/tsx` lives, makes the import resolve.
  - This bug existed before this change but was masked by the jiti-resolution failure firing first; it surfaced once Phase A let the launcher get past jiti lookup.

## Impact

- **Affected specs**: `bootstrap-install`, `dependency-installer`, `first-run-wizard`, `pi-core-version-check`, `package-management`, `bridge-extension` (doc-only path comment), `bundled-recommended-extensions` (offline-cache pin).
- **Affected code**: ~55 source/test/config files (49 from Phases A–D, F + ~6 added in Phase E for version pins). Plus 9 deleted snapshots and a regenerated `npm-cache.tar.gz`.
- **Behaviour**:
  - Users on `@earendil-works/pi-coding-agent` (the new default global pi) get a working dashboard.
  - Users on legacy `@mariozechner/pi-coding-agent` continue to work via the fallback alias.
  - Users on `@oh-my-pi/pi-coding-agent` (transient fork, never widely deployed) are no longer supported. They must migrate to one of the two supported names.
- **Deploy**: Electron app rebuilt + reinstalled to `/Applications/PI-Dashboard.app`. New asar verified to contain 0 `@oh-my-pi` strings and 9 `@earendil-works` strings.

## Non-goals

- **Not** changing `@mariozechner/clipboard` (separate package, unrelated to the pi fork).
- ~~**Not** updating `packages/electron/offline-packages.json`~~ — moved into scope as Phase E. The manifest now pins `@earendil-works/pi-coding-agent@0.74.0` and the contract test is flipped to match.
- **Not** updating `packages/client/**` or `packages/electron/scripts/**` (test fixtures and shell installer scripts still contain `@mariozechner/pi-coding-agent` literals — separate pass when the npm-published name flips for new installs).
- **Not** removing the `@mariozechner/pi-coding-agent` legacy alias. Carrying it forward is the cost of a graceful migration; removal is a follow-up change once telemetry shows ≤epsilon use of that alias.
