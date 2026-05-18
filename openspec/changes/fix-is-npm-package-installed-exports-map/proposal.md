# fix-is-npm-package-installed-exports-map

## Why

`packages/server/src/bootstrap-install-from-list.ts::isNpmPackageInstalled`
uses `createRequire(...).resolve(pkgName + "/package.json")` to detect
whether a managed-install package is present:

```ts
export function isNpmPackageInstalled(pkgName: string, managedDir: string): boolean {
  try {
    const req = createRequire(path.join(managedDir, "package.json"));
    req.resolve(pkgName + "/package.json");
    return true;
  } catch {
    return false;
  }
}
```

Modern Node enforces the package `exports` map. Any package whose
`exports` map does NOT include `"./package.json"` causes
`require.resolve("X/package.json")` to throw `ERR_PACKAGE_PATH_NOT_EXPORTED`
— even when the file is sitting right there on disk.

Two of the three Electron-owned installable packages have restrictive
exports maps:

```json
// @earendil-works/pi-coding-agent
"exports": {
  ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
  "./hooks": { "types": "./dist/core/hooks/index.d.ts", "import": "./dist/core/hooks/index.js" }
}
```

(No `./package.json` entry. Same shape in `@fission-ai/openspec`.)

Reproduced live on 2026-05-18 with the bundled Node v24.15.0 in the
shipped Electron app:

```
@earendil-works/pi-coding-agent  FALSE  code=ERR_PACKAGE_PATH_NOT_EXPORTED
@fission-ai/openspec             FALSE  code=ERR_PACKAGE_PATH_NOT_EXPORTED
tsx                              TRUE  (no exports map, falls through to ENOENT-free resolve)
```

**Consequence:** `bootstrapInstallFromList` sees `isNpmPackageInstalled`
return false → emits `status=running` → calls `npm install <pkg>@<ver>`
→ npm reconciles the managed dir's `node_modules/` against the
synthetic `package.json` which only declares those 3 deps → **prunes
every package outside the 3-dep transitive closure**, including
`readable-stream`, `fastify`, `pino`, `@fastify/*`, `@pinojs/*` etc.
that the dashboard server requires at runtime.

The pruned packages don't break server startup (Node's `require.cache`
keeps the already-loaded ones in memory). But any lazy-loaded module —
e.g. the response-serialisation path in `/api/config`,
`/api/packages/installed`, `/api/provider-auth/status` — triggers a
fresh `require(...)`, hits `MODULE_NOT_FOUND`, Fastify converts that to
HTTP 500. Live response body from the running server today:

```
{"statusCode":500,"code":"MODULE_NOT_FOUND",
 "error":"Internal Server Error",
 "message":"Cannot find module 'file:///Users/robson/.pi-dashboard/node_modules/readable-stream/lib/internal/streams/duplex.js'"}
```

The Settings panel calls `Promise.all([/api/config, /api/providers])`
in `useEffect`. `/api/config` rejects → `.catch` arm → "Failed to load
settings" toast → user cannot configure the dashboard. Every other
panel that fans out to a pruned-dep code path is similarly broken,
producing a cascade of 500s across the dashboard's REST surface.

The first launch after a fresh DMG install ALSO triggers this pruning
via the Electron wizard's `installStandalone()`. Every subsequent
launch reproduces it: every time the server starts,
`isNpmPackageInstalled` returns false for pi+openspec, `npm install`
runs, the tree is pruned, the dashboard breaks.

## What Changes

1. **Replace `require.resolve(pkg + "/package.json")` with a direct
   filesystem check.** The package's installed location is fully
   deterministic: `<managedDir>/node_modules/<scope?>/<short>/package.json`.
   `fs.existsSync(...)` bypasses the exports map and reports the actual
   on-disk state.

2. **Verify the version too.** When `pkg.version` is pinned in
   `installable.json`, read the installed `package.json` and compare
   `version`. Match → satisfied. Mismatch → install (legitimate upgrade
   path). This both fixes the "always reinstall" bug AND adds the
   version-skew detection the design intended.

3. **Update `decideStartupAction`'s peer check
   (`isManagedDirPopulated`) in `power-user-install.ts` for the same
   reason.** It uses the same vulnerable pattern. Fold the same fix in
   the same change since the failure mode is identical (wizard would
   re-fire on every launch even when packages are present).

4. **Lint test** asserting `require.resolve(<pkg>/package.json)` is
   never used as a presence check elsewhere in the codebase. Pin the
   contract: "use fs.existsSync on the literal node_modules path."

5. **Regression unit test** for `isNpmPackageInstalled` that uses a
   fixture with an `exports`-restricted `package.json` and asserts the
   helper returns `true` (currently it would return false against the
   bundled Node behaviour).

Out of scope:
- Switching the npm install strategy to one that doesn't prune (e.g.
  `--no-save` or comprehensive package.json). The minimal fix here is
  to make the fast-path actually fire so npm install simply doesn't run
  when not needed. Pruning still happens on legitimate version-bump
  installs, but that's a separate failure mode handled by the
  `streamline-electron-bootstrap-and-recovery`'s post-install
  re-materialise step (which restores `@blackbelt-technology/*`) — and
  out of scope for THIS narrowly-focused gate fix.
- Fixing the wizard's `installStandalone` to use a more conservative
  install command. Same reasoning — the wizard's install should
  rarely re-run once first-install completes; the bug is that it
  was re-running.

## Capabilities

### Modified Capabilities

- `bootstrap-install`: the gate that decides whether to invoke `npm install`
  for an installable package SHALL use a filesystem check, not module
  resolution, so the check is robust against `exports`-map enforcement.
  Delta in
  `openspec/changes/fix-is-npm-package-installed-exports-map/specs/bootstrap-install/spec.md`.

## Impact

- **Code:**
  - `packages/server/src/bootstrap-install-from-list.ts`
    (`isNpmPackageInstalled` body, plus version-comparison logic added)
  - `packages/electron/src/lib/power-user-install.ts`
    (`isManagedDirPopulated` body — same pattern, same fix)
- **Tests:**
  - New unit test for `isNpmPackageInstalled` with exports-restricted fixture
  - New unit test for `isManagedDirPopulated` with same fixture
  - Lint test (`no-require-resolve-pkg-package-json`) repo-wide
- **Docs:** `docs/file-index-server.md` row for
  `bootstrap-install-from-list.ts` notes the fs-check contract.
- **Runtime behaviour:**
  - On every launch where pi/openspec/tsx are already installed,
    bootstrap emits `status=satisfied` for all three (instead of
    `status=done` → npm install → prune).
  - Wizard does not re-open on every launch when managed dir is
    already populated.
  - Cascade of 500s on `/api/config`, `/api/packages/installed`,
    `/api/provider-auth/status` etc. disappears because the deps the
    server needs at request-time are no longer pruned out from under it.
  - Bootstrap completion time drops from ~5–10s (waiting for npm
    install) to ~50ms on subsequent launches.
- **Compat:** strict UX improvement. Behaviour ONLY changes when the
  fast path was previously misfiring; the install path itself is
  unchanged.
- **Cross-refs:**
  - Discovered live during smoke-testing of
    `fix-resolve-client-dir-prefers-durable-managed-path` and
    `fix-sw-strands-stale-assets`. The Settings panel was the surface
    that exposed the 500-cascade after the SW + resolver bugs were
    fixed (the SW was previously masking server 500s as 500 (from
    service worker)).
  - Complements `streamline-electron-bootstrap-and-recovery`'s
    post-install re-materialise step (which restores
    `@blackbelt-technology/*` scope dir but cannot restore arbitrary
    other transitive deps).
