## 1. Bundle-stamp writer

- [x] 1.1 Decide stamp location: `resources/server/.bundle-stamp` (inside bundle dir; must be stripped before Forge packages) or `packages/electron/.bundle-stamp` (outside, gitignored). Recommendation per design D2/risks: **outside**, gitignored.
- [x] 1.2 Add `.bundle-stamp` to `packages/electron/.gitignore` if the chosen path is inside `packages/electron/`. If inside `resources/server/`, ensure `bundle-server.mjs`'s strip walk (or a new dedicated step) excludes it from the shipped bundle.
- [x] 1.3 Implement stamp writer as a bash function `write_bundle_stamp()` inside `build-installer.sh`, invoked only after `bundle-server.mjs` exits 0. Writes JSON `{builtAt, srcMtime, bundlerMtime}` via `node -e` to keep bash-side JSON-free. Use `node` from the build host (always available — Forge requires it).
- [x] 1.4 Implement `compute_src_mtime()` helper: `find packages/{server,shared,client,extension,dashboard-plugin-runtime}/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.json' -o -name '*.html' -o -name '*.css' -o -name '*.svg' \) -print0 | xargs -0 stat -f '%m' | sort -nr | head -1`. Returns the max mtime as Unix epoch seconds. Works on macOS BSD `stat`; verify Linux GNU `stat` syntax via `stat -c '%Y'` fallback (the script already does platform-aware stat in other places — mirror the pattern).
- [x] 1.5 Implement `compute_bundler_mtime()`: same primitive applied to a single file `packages/electron/scripts/bundle-server.mjs`.

## 2. Staleness gate replacement

- [x] 2.1 Locate the current short-circuit in `build-installer.sh` (around line 295). Comment-link to this proposal so the rationale is one grep away.
- [x] 2.2 Implement `is_bundle_stale()` returning `stamp-missing` / `source-newer:<file>` / `bundler-newer` / empty (cache hit). Logic:
  - If stamp file missing → `stamp-missing`.
  - Read `stamp.srcMtime` and `stamp.bundlerMtime` via `node -e 'process.stdout.write(...)'`.
  - `find packages/{...}/src -type f \( -name '*.ts' -o ... \) -newer "$stamp_file_with_srcMtime_touched_in_a_helper" -print -quit` → first newer file is the source-newer reason (extract path).
  - Compare `compute_bundler_mtime()` vs `stamp.bundlerMtime` → `bundler-newer` if greater.
  - Else empty (cache valid).
- [x] 2.3 Replace the `if [ ! -d "$ELECTRON_DIR/resources/server/node_modules" ]; then` block with:
  ```bash
  stale_reason="$(is_bundle_stale)"
  if [ -n "$stale_reason" ]; then
    echo "↻ Bundled server stale (reason=$stale_reason) — re-bundling"
    rm -rf "$ELECTRON_DIR/resources/server"  # ensure clean state before bundler
    node "$ELECTRON_DIR/scripts/bundle-server.mjs"
    write_bundle_stamp
  else
    age_str="$(format_stamp_age)"  # e.g. "4m ago"
    echo "✓ Bundled server cache hit (built $age_str, stamp matches)"
  fi
  ```
- [x] 2.4 Verify the gate also fires when `resources/server/` exists but is half-built (e.g. user `^C`'d a previous build). Stamp-missing covers this because the stamp is only written on success.
- [x] 2.5 Ensure cross-build prefix preservation: when `cross_prefix` (Rosetta) is in play, the wrapping must still be `$cross_prefix node "$ELECTRON_DIR/scripts/bundle-server.mjs"` as today.

## 3. Tests

- [x] 3.1 Vitest test at `packages/electron/src/__tests__/build-installer-staleness-gate.test.ts`. Harness pattern:
  - Plant a tmp dir mirroring the relevant `packages/{server,shared,...}/src/*.ts` layout.
  - Stub `ELECTRON_DIR` / `PROJECT_DIR` to the tmp dir.
  - Plant a bundle stamp with `srcMtime = T0`.
  - Test cases:
    - (a) No newer source files → gate returns empty (cache hit).
    - (b) Touch a `.ts` file under `packages/server/src/` to `T0 + 1s` → gate returns `source-newer` reason and the touched filename.
    - (c) Delete the stamp → gate returns `stamp-missing`.
    - (d) Touch `bundle-server.mjs` to `T0 + 2s` → gate returns `bundler-newer`.
    - (e) Touch a `.swp` editor swap file → gate returns empty (extension filter holds).
- [x] 3.2 Integration smoke (deferred to manual QA, mirroring the streamline-electron pattern):
  ```bash
  cd packages/electron
  npm run clean:resources
  npm run build:local                       # initial bundle; should emit "Bundled server stale (reason=stamp-missing) — re-bundling"
  npm run build:local                       # second run; should emit "Bundled server cache hit"
  touch ../server/src/server.ts             # edit one file
  npm run build:local                       # third run; should emit "stale (reason=source-newer file=packages/server/src/server.ts) — re-bundling"
  ```
- [x] 3.3 Regression-pin: assert via grep in the bash script that the old `[ ! -d "$ELECTRON_DIR/resources/server/node_modules" ]` short-circuit is gone. Test at `packages/shared/src/__tests__/no-dir-only-bundle-gate.test.ts` (mirrors existing `no-direct-*` lint-style tests).

## 4. Docs

- [x] 4.1 `docs/faq.md` → "How do I build the Electron app locally?" entry gains a paragraph on the staleness gate + `clean:resources` as the escape hatch. Caveman style per AGENTS.md (delegate to general-purpose subagent).
- [x] 4.2 `docs/file-index-electron.md` row for `packages/electron/scripts/build-installer.sh` extended with a note: "Writes `<stamp-path>` after every successful bundle. Re-runs bundler when source-newer / bundler-newer / stamp-missing." Caveman style.
- [x] 4.3 New row in `docs/file-index-electron.md` for the stamp file (if inside `packages/electron/`).
- [ ] 4.4 Add a one-line cross-ref in `streamline-electron-bootstrap-and-recovery` archive (when archived) pointing to this change as the follow-up that prevents re-recurrence.

## 5. Acceptance

- [x] 5.1 Run the full integration smoke from 3.2 on a clean macOS host. All three log lines appear with the correct reasons.
- [x] 5.2 Run `npm run build:local` on a clean checkout (no `resources/server/` yet). Verify `reason=stamp-missing` log + valid DMG.
- [x] 5.3 Edit `packages/server/src/server.ts` and rebuild — verify the new DMG contains the edit (`grep -c '<unique-marker>' <unpacked-dmg>/.../server.ts > 0`).
- [x] 5.4 Edit `packages/electron/scripts/bundle-server.mjs` (e.g. add a `console.log` near the top) and rebuild — verify `reason=bundler-newer` fires.
- [x] 5.5 Performance: `time` the cache-hit path. Must be sub-100 ms warm. Document the observed timing in the implementation PR.
