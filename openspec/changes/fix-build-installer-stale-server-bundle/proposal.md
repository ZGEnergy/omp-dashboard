# fix-build-installer-stale-server-bundle

## Why

`packages/electron/scripts/build-installer.sh` line ~295 currently short-circuits
the `bundle-server.mjs` invocation purely on directory existence:

```bash
if [ ! -d "$ELECTRON_DIR/resources/server/node_modules" ]; then
  node "$ELECTRON_DIR/scripts/bundle-server.mjs"
else
  echo "✓ Bundled server already present"
fi
```

The bundler is the only step that copies workspace source from
`packages/{server,shared,client,extension,dashboard-plugin-runtime}/` into
`resources/server/packages/<short>/` and then re-materializes the
`node_modules/@blackbelt-technology/*` scope dir from those copies. If the
cached `resources/server/` exists from a previous build, the bundler is
**skipped silently**, no matter how much source changed in the working tree.
Forge then packages the stale `resources/server/` into the `.app`. The
shipped artifact contains pre-edit server code.

This bit us in real life on 2026-05-17: after landing every Group-16 fix
of `streamline-electron-bootstrap-and-recovery` (Failure 1 re-materialization,
Failure 2 managed-dir-root resolver, Failures 3/4/5), we built a fresh DMG,
installed it, and observed the dashboard returning `404 Not Found` on
`GET /` — exactly the Failure 2 symptom the fix was supposed to eliminate.
~40 minutes of forensics revealed the binary contained zero occurrences of
`resolveClientDir` / `resolveManagedDirRoot` / `dashboard-paths.ts` /
`managed-workspace-materialize.ts`. The fix was in the working tree; the
DMG was 18 hours stale.

The existing escape hatch (`npm run clean:resources`) works but requires
the developer to know about it. The FAQ mentions it once. There is no
warning when the short-circuit fires and the cached bundle is stale.

Two failure modes the dir-existence gate cannot detect:

1. **Source mutation since last bundle.** Any edit under
   `packages/{server,shared,client,extension,dashboard-plugin-runtime}/`
   makes the cache stale.
2. **Bundler script mutation.** Editing `bundle-server.mjs` itself
   (e.g. to add a new copy step or fix a bug) without forcing a re-bundle
   produces the same silent staleness.

This is exactly the same class of bug as commits `40a1319` and `e11f5eb`
referenced in `server.ts:1089` — sibling-path arithmetic / cache gating
that works in the dev cycle but silently produces wrong artifacts in the
installed layout.

## What Changes

1. **Replace the dir-existence gate with a content-staleness check.**
   `build-installer.sh` writes a `resources/server/.bundle-stamp` JSON
   sentinel containing `{builtAt, srcDigest, bundlerDigest}` after every
   successful `bundle-server.mjs` run. Before short-circuiting, the script
   computes the current `srcDigest` (cheap `find ... -newer` walk over the
   workspace source roots) and `bundlerDigest` (mtime of `bundle-server.mjs`
   itself) and compares against the stamp.

2. **Loud log when re-bundling fires.** Replace the silent
   `✓ Bundled server already present` line with one of:
   - `✓ Bundled server cache hit (stamp matches, age=Nm)`
   - `↻ Bundled server cache stale (reason: <source-newer | bundler-newer | stamp-missing>) — re-bundling`

3. **Promote `clean:resources` in the FAQ + AGENTS.md** so the manual
   override is one grep away.

4. **Regression test.** A bash-level test under
   `packages/electron/scripts/__tests__/` (or vitest if simpler) that
   plants a stale `resources/server/` + bumps a source file's mtime and
   asserts the next `build-installer.sh` invocation re-runs the bundler.

Out of scope:
- Adding incremental copy inside `bundle-server.mjs` itself (the bundler
  is fast enough at ~5 seconds; the gate is the problem, not the bundler).
- Touching the parallel `BUNDLE_OFFLINE_PACKAGES` / `BUNDLE_RECOMMENDED_EXTENSIONS`
  cache invalidation paths — they already use mtime comparisons
  (lines ~310–317 + the recommended-extensions bundle in the same script).

## Capabilities

### Modified Capabilities

- `build-local`: the `bundle-server` cache gate inside the local-build
  flow learns content-staleness detection in addition to directory
  existence. Delta in `openspec/changes/fix-build-installer-stale-server-bundle/specs/build-local/spec.md`.

## Impact

- **Code:** `packages/electron/scripts/build-installer.sh` (gate logic +
  stamp writer + log lines); possibly a tiny helper in
  `packages/electron/scripts/_bundle-stamp.mjs` if the digest math
  outgrows pure bash.
- **Build perf:** unchanged in the cache-hit path (a `find -newer`
  walk over 5 source trees is sub-50 ms); re-runs the existing
  ~5-second bundler when the stamp is stale.
- **Docs:** `docs/faq.md` entry updated; `docs/file-index-electron.md`
  row for `build-installer.sh` notes the new stamp file; possibly
  a new row for `resources/server/.bundle-stamp` (gitignored).
- **Tests:** one new regression test pinning the staleness contract.
- **Compat:** no runtime behaviour change. The shipped artifact is
  *more* correct (matches source); the dev-side workflow gains one
  cache-invalidation case it was previously missing.
- **Cross-refs:** complements the `streamline-electron-bootstrap-and-recovery`
  fixes by ensuring they actually land in shipped DMGs. Without this,
  every future Group-16-style fix risks the same 18-hour-stale-artifact
  trap.
