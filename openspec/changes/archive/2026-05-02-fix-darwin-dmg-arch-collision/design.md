## Context

The published Electron release ships only one `PI Dashboard.dmg`. Both
macOS matrix legs (`darwin/arm64` on `macos-14`, `darwin/x64` on
`macos-15-intel`) succeed and produce DMGs, but both DMGs land in the
release asset list under the same basename — `softprops/action-gh-release@v2`
de-duplicates by basename, so the second uploader silently overwrites the
first. The root cause is a single static config field in
`packages/electron/forge.config.ts`:

```ts
{
  name: "@electron-forge/maker-dmg",
  config: {
    name: "PI Dashboard",   // ← static, no arch token
    title: "PI Dashboard",
    icon: ...,
    format: "ULFO",
  },
},
```

Linux makers (deb) and Windows makers (NSIS, ZIP, portable) all already
emit arch-tagged filenames; macOS DMG is the only outlier. The site
(`site/src/lib/github-release.ts` + `DownloadSection.astro`) was already
written to render two macOS buttons (`Apple Silicon · DMG`, `Intel · DMG`)
when both arches are present, falling back to a single button otherwise.
The README was already updated to advertise `PI-Dashboard-darwin-arm64-<ver>.dmg`.
The build is the only thing that's been silently wrong.

A second pending change, `add-darwin-x64-build`, already modifies
`Requirement: CI build matrix` in the `electron-build-pipeline` spec.
This proposal is intentionally scoped to **`Requirement: DMG configuration`**
to avoid colliding with that delta and to keep the spec edit single-requirement.

## Goals / Non-Goals

**Goals:**
- Each per-arch macOS matrix leg SHALL produce a DMG whose basename
  uniquely identifies its architecture.
- The produced GitHub Release SHALL carry two distinct DMG assets per
  release (`darwin-arm64` + `darwin-x64`) without changing the upload step.
- A regression test SHALL fail CI before tag if a future refactor
  flips the DMG name back to a static value.
- Documentation that already promised this behaviour
  (`README.md:52`, `AGENTS.md` electron file-index row) is reconciled
  with the version that actually ships the fix.

**Non-Goals:**
- Changing `softprops/action-gh-release@v2` for the release upload step
  (basename-collision is the only thing forcing this and we're fixing it
  at the source).
- Touching `packagerConfig.arch: "universal"` (already a no-op — Forge
  CLI's `--arch=${{ matrix.arch }}` overrides it correctly per matrix leg).
- Linux / Windows artifact naming (already correct).
- Combining the two arch DMGs into a universal binary (would require
  per-build-job arch-merge plumbing; not worth it while two native runners
  still exist).
- Removing the `"DMG (universal)"` priority-0 fallback branch in
  `site/src/lib/github-release.ts:69` (kept as graceful-degradation safety
  net for future single-DMG corner cases).

## Decisions

### D1 — DMG maker `name` is composed at config-evaluation time, not via a placeholder

**Decision:** Set `name` on `@electron-forge/maker-dmg` to a string composed
in `forge.config.ts` itself, of the form
`PI-Dashboard-darwin-${process.arch}-${pkg.version}` where `pkg.version`
is read from `packages/electron/package.json` via `JSON.parse(fs.readFileSync(...))`.

**Why not the NSIS-style `${version}` placeholder?**
`@felixrieseberg/electron-forge-maker-nsis` accepts an
`artifactName: "pi-dashboard-Setup-${version}.exe"` template because it's
delegating to electron-builder, which has its own variable substitution.
`@electron-forge/maker-dmg` accepts only literal strings for `name` (it's
written through to `appdmg`). So we compose the string in JS.

**Why include `${pkg.version}`?**
- It mirrors Linux/Windows conventions (`pi-dashboard_<ver>_amd64.deb`,
  `pi-dashboard-Setup-<ver>.exe`).
- It makes side-by-side downloaded DMGs distinguishable in `~/Downloads`.
- README's migration note already documents this exact format
  (`PI-Dashboard-darwin-arm64-<ver>.dmg`).

**Alternatives considered:**
- *Static name with arch only* (`PI-Dashboard-darwin-${arch}.dmg`) — rejected:
  no version disambiguation when users keep multiple DMGs locally.
- *Use Forge's substitution if any* — rejected: the DMG maker has no
  documented variable substitution; relying on undocumented behaviour is
  fragile.

### D2 — Spec edit lives on `Requirement: DMG configuration`, not `CI build matrix`

**Decision:** The MODIFIED requirement in
`specs/electron-build-pipeline/spec.md` targets only
`### Requirement: DMG configuration` (currently a 2-line requirement with
one `DMG branding` scenario about the static "PI Dashboard" name). Replace
the static-name scenario with two new scenarios: arch token MUST appear
in basename + the GitHub Release MUST contain two distinct DMG assets.

**Why not also tighten `CI build matrix`?**
The pending `add-darwin-x64-build` change already provides a MODIFIED delta
for `CI build matrix`. Two simultaneous MODIFIED deltas on the same requirement
collide at archive time. By scoping our delta to `DMG configuration` we keep
the change orthogonal and let the two changes archive in either order.

**Trade-off:** The "two distinct DMG assets" scenario logically belongs to
both requirements. Living on `DMG configuration` is a sound home because it's
the closest single-source-of-truth requirement for DMG-as-artifact semantics.

### D3 — No version bump in this change; README reworded to be version-agnostic

**Decision:** This change does NOT bump any `package.json` version. The
next release that ships will bundle this fix together with whatever other
features land on `develop` before release-cut, and the version label
(patch / minor) is determined by the `release-cut` skill at cut time —
not by this proposal. `README.md:52`'s migration note is reworded to
speak about "a future release" instead of pinning a specific version.

**Why version-agnostic?**
- The previous draft of this design pinned `0.4.7`, which assumed the
  next release was imminent and self-contained. The user has signalled
  that more features will accumulate before cut; pinning a version here
  would leave a stale claim in README the moment another feature lands.
- The release-asset URL break is intrinsic to whichever release ships
  the new DMG basenames; it does not become more or less of a break
  based on the version label.
- Keeping the version label out of this change means the proposal can
  archive the moment the implementation lands, without waiting on a
  release-cut step.

**Alternatives considered:**
- *Pin a patch version (`0.4.7`)* — rejected: brittle to the realistic
  case of multiple features landing in one release.
- *Pin a minor version (`0.5.0`)* — rejected: same brittleness, plus
  forces a minor bump on what is intrinsically a build-output bug fix.
- *Leave README's existing "v0.5.x" wording in place* — rejected: the
  repo is currently at `0.0.0-test-darwin-x64.3` (post test-tag), and
  whether the next release lands as `0.4.7`, `0.5.0`, or something else
  is undecided; a version-agnostic phrasing avoids the README claiming
  any specific version that may never exist.

### D4 — Keep the legacy `"DMG (universal)"` classifier branch in `site/src/lib/github-release.ts`

**Decision:** Leave line 69 (`return { platform: "macos", kind: "DMG (universal)", priority: 0 }`)
in place even though it becomes unreachable post-fix.

**Why?**
- It's a graceful-degradation path. If a future emergency reverts to
  single-DMG output for any reason (universal-binary experiment, runner
  outage on one Intel leg, etc.) the site keeps rendering correctly
  instead of showing zero macOS download buttons.
- Cost is one classifier line.
- The unreachable code is documented inline with intent.

## Risks / Trade-offs

- **[Risk] DMG `name` change breaks the in-DMG volume label.**
  `appdmg` uses the maker's `name` as both the artifact basename **and**
  the mounted DMG volume label (the title shown in Finder when the DMG is
  mounted). Users will now see "PI-Dashboard-darwin-arm64-0.4.7" in
  Finder's sidebar instead of "PI Dashboard". → **Mitigation:** keep
  `title: "PI Dashboard"` (which appdmg uses for the window title bar
  and Spotlight metadata). The volume-label change is acceptable —
  Linux deb and Windows NSIS installers already show similarly verbose
  bundle names during install. Users open the DMG, drag the app to
  Applications, and eject; the verbose volume label is visible for ~10 s.

- **[Risk] Conflict with `add-darwin-x64-build` if both archive in the
  same window.** Both changes touch
  `openspec/specs/electron-build-pipeline/spec.md`. → **Mitigation:** the
  two deltas modify *different* requirements (`CI build matrix` vs
  `DMG configuration`). `openspec apply` merges by requirement-name, so
  both archive cleanly. Verified by reading
  `openspec/changes/add-darwin-x64-build/specs/electron-build-pipeline/spec.md`
  during design.

- **[Risk] `process.arch` at config-eval time may not match the
  `--arch=${{ matrix.arch }}` flag in cross-arch builds.**
  Forge invokes `forge.config.ts` in the host Node process; `process.arch`
  is the **host** arch, not the target. On a `macos-14` runner producing
  arm64 they match; on `macos-15-intel` producing x64 they match. But
  on the local `--mac-both` workflow (Apple Silicon host wrapping the
  x64 build in `arch -x86_64`), the wrapped sub-process *would* see
  `process.arch === "x64"`. → **Mitigation:** spot-check that
  `build-installer.sh --mac-both` runs the x64 leg under `arch -x86_64`
  (it does — see existing AGENTS.md row), so `process.arch` is correct
  inside that sub-process. Add an inline comment to `forge.config.ts`
  documenting this contract so a future refactor doesn't break it.

- **[Trade-off] Verbose DMG basename.**
  `PI-Dashboard-darwin-arm64-0.4.7.dmg` is 36 characters. Some users may
  prefer `PI Dashboard.dmg`. We accept the verbosity in exchange for
  unambiguous arch identification, parity with deb/NSIS conventions,
  and the correct release-asset behaviour.

## Migration Plan

1. Land the forge.config.ts fix + regression test + version-agnostic
   README rewording on `develop`.
2. Archive this OpenSpec change once `develop` builds green.
3. At the next `release-cut` invocation (whenever that happens, with
   whatever other features are bundled), the `release-cut` skill bumps
   versions and tags. The published release will automatically carry
   two arch-tagged DMG assets.
4. After that release publishes, manually verify:
   - GitHub Release page shows **two** DMG assets (`darwin-arm64`, `darwin-x64`).
   - Site rebuild auto-fires from `release: published`; download page
     shows two macOS buttons.
   - `~/.pi-dashboard` upgrade flow on a fresh Intel mac picks the x64
     DMG (manual smoke test).

**Rollback:** If two DMGs break consumers we don't know about, revert
the single forge.config.ts hunk; the next release re-emits a single
`PI Dashboard.dmg`. The site's classifier already handles that case
(graceful-degradation safety net per D4).

## Open Questions

None.
