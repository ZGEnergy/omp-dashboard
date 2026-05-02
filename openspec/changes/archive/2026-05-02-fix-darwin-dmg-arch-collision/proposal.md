## Why

The published Electron release contains **only one** `PI Dashboard.dmg` even though
the build matrix runs both `darwin/arm64` (on `macos-14`) and `darwin/x64` (on
`macos-15-intel`). Both legs succeed and produce DMGs, but both DMGs are written
with the **same basename** — `PI Dashboard.dmg` — because
`packages/electron/forge.config.ts`'s `@electron-forge/maker-dmg` config sets a
static `name: "PI Dashboard"` with no arch token. When `softprops/action-gh-release@v2`
uploads `electron-*/**/*` to the GitHub Release, it uses the file's **basename**
as the asset name, so the second leg's DMG silently overwrites the first leg's.
Whichever macOS job finishes last wins; users on the other arch end up with a DMG
that fails to launch (Mach-O slice mismatch).

This contradicts spec `electron-build-pipeline > Scenario: CI produces macOS x64
DMG` and the release-cut skill's documented contract of **two arch-tagged DMGs
per release** (`PI-Dashboard-darwin-arm64-<ver>.dmg` and
`PI-Dashboard-darwin-x64-<ver>.dmg`).

Symptom captured in draft release `v0.0.0-test-darwin-x64.3`: a single 199 MB
unsuffixed `PI Dashboard.dmg` alongside the two `_amd64.deb` / `_arm64.deb`
Linux entries and the four arch-tagged Windows entries (`-arm64-portable.exe`,
`-x64-portable.exe`, `Setup.exe`, `win32-{arch}.zip`).

## What Changes

- Configure `@electron-forge/maker-dmg` in `packages/electron/forge.config.ts`
  to emit an arch-tagged filename of the form
  `PI-Dashboard-darwin-${arch}-${version}.dmg`. The DMG maker reads `name`
  as both the volume label and the artifact basename; setting it to the
  arch-suffixed string disambiguates the two matrix legs.
- Tighten the `electron-build-pipeline` spec so the existing
  "CI produces macOS arm64/x64 DMG" scenarios additionally REQUIRE that each
  produced DMG's filename SHALL contain the matching architecture token, AND
  that the GitHub Release SHALL contain two distinct DMG assets after a
  release run.
- Add a unit test in `packages/electron/src/__tests__/` that imports
  `forge.config.ts` and asserts the DMG maker's resolved `name` (when
  resolved with `process.arch === "arm64"` and `process.arch === "x64"`)
  contains the corresponding arch token, so a future refactor that flips
  back to a static name fails CI before reaching a release tag.

Not in scope: changing the release-asset upload strategy (we keep
`softprops/action-gh-release@v2`'s basename behaviour); changing the
`packagerConfig.arch: "universal"` hint (irrelevant — Forge CLI's
`--arch=${{ matrix.arch }}` already overrides it correctly per matrix leg);
changing Linux/Windows artifact names (already arch-tagged correctly).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `electron-build-pipeline`: tighten the macOS DMG scenarios so each per-arch
  DMG MUST carry an arch token in its basename, and add a release-asset
  scenario asserting two distinct DMG assets land in the GitHub Release.

## Impact

### Code
- `packages/electron/forge.config.ts` — DMG maker `name` becomes a function
  of `process.arch` and the package version (read from `package.json` like the
  NSIS maker's `${version}` placeholder, or composed at config-eval time).
- `packages/electron/src/__tests__/forge-config-dmg-naming.test.ts` (new) —
  regression lock.
- `.github/workflows/publish.yml` — **no change required**. The existing
  `softprops/action-gh-release@v2` step already globs both DMGs from
  separate `electron-darwin-arm64/` and `electron-darwin-x64/` artifact
  directories; once the basenames differ, both upload cleanly under their
  distinct names.

### Specs / docs
- `openspec/specs/electron-build-pipeline/spec.md` — two scenarios tightened,
  one new scenario added (delta spec lives at
  `openspec/changes/fix-darwin-dmg-arch-collision/specs/electron-build-pipeline/spec.md`).
- `AGENTS.md` — update the `packages/electron/forge.config.ts` row in the
  file index to note the arch-tagged DMG name, and reference this change.
- `README.md:52` — reword the migration note to be version-agnostic
  ("a future release will rename the macOS DMGs…") since the version
  that ships this fix is not pinned by this proposal — the next release
  may bundle additional unrelated features and the version label is
  determined at release-cut time. Pre-edited as part of this change so
  the README never claims a version that doesn't exist.
- `CHANGELOG.md` — add a `Fixed` entry under `## [Unreleased]` describing
  the dual-DMG output and the (one-time) release-asset URL change. **No
  package.json version bump is part of this change** — the repo stays at
  whatever version is current on `develop` until the next release-cut
  invocation.

### No code change required (already prepared)
- `site/src/lib/github-release.ts` — classifier already maps `arm64` →
  `"DMG (Apple Silicon)"` and `x64`/`intel` → `"DMG (Intel)"`, and builds
  `primaryByArch` whenever both arches are present. The `"DMG (universal)"`
  branch becomes unreachable post-fix; it is **kept** as a graceful-degradation
  safety net for future single-DMG corner cases (no source change).
- `site/src/components/DownloadSection.astro` — already renders two macOS
  buttons (`Apple Silicon · DMG`, `Intel · DMG`) when `primaryByArch` is
  populated, falls back to single button otherwise.
- `site/src/components/InstallTabs.tsx` — install hint already says
  `.dmg (arm64 / x64)`.
- `site/src/data/latest-release.json` — stale, auto-regenerated by
  `.github/workflows/sync-release-version.yml` on every release; will pick
  up the two arch-tagged DMGs on the first release after the fix.
- `site/dist/` — stale, auto-rebuilt by `deploy-site.yml` on
  `release: { types: [published] }`.

### User-visible
- Release-asset URL change: anyone scripting downloads against the
  unsuffixed legacy URL
  (`https://github.com/.../releases/download/<tag>/PI%20Dashboard.dmg`) will
  see a 404 starting from the release that includes this fix. The README
  migration note already calls this out; we own no such consumer in this
  repo. Recommended pattern is to link to the Releases page or to
  `PI-Dashboard-darwin-${arch}-${version}.dmg`.
