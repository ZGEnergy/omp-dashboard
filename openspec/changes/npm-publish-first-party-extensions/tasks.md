# Tasks: npm-publish-first-party-extensions

All tasks completed retrospectively — see commits `e66ba7c9` (code) and
`5ccb4d04` (docs) on the `develop` branch of `pi-agent-dashboard`, plus
commits in the upstream `pi-anthropic-messages` and `pi-flows` repos.

## 1. Prepare upstream packages for npm

- [x] 1.1 Rename `@pi/anthropic-messages` → `@blackbelt-technology/pi-anthropic-messages`
  in `package.json` (the `@pi` scope is not ours).
- [x] 1.2 Bump version: `0.3.1 → 0.3.2`. Add `publishConfig.access: public`
  and `repository` field.
- [x] 1.3 Update package-name references in `extensions/index.ts` banner
  comment and `README.md` (title + import example).
- [x] 1.4 Rename `pi-flows` → `@blackbelt-technology/pi-flows`. Bump
  `0.2.0 → 0.2.1`. Add `publishConfig.access: public` and `repository`.
- [x] 1.5 Add `files: [extensions/, agents/, README.md, CHANGELOG.md, LICENSE]`
  to `pi-flows/package.json` (the repo carries `docs/`, `research/`,
  `openspec/`, `__tests__/` that should not ship to npm).
- [x] 1.6 Verify both have `LICENSE` files and `package.json#license: "MIT"`.
- [x] 1.7 `npm publish --dry-run` clean for both (`@blackbelt-technology/pi-anthropic-messages@0.3.2`
  → 17.5 KB / 7 files; `@blackbelt-technology/pi-flows@0.2.1` → 133.7 KB / 63 files).
- [x] 1.8 Commit + `npm publish` for both. Confirm `npm view <pkg> version`
  returns the new version.

## 2. Manifest changes in dashboard

- [x] 2.1 Add optional `bundleSource?: string` field to
  `RecommendedExtension` type in
  `packages/shared/src/recommended-extensions.ts` with JSDoc explaining
  its bundle-pipeline-only role.
- [x] 2.2 Change `pi-anthropic-messages` `source` →
  `npm:@blackbelt-technology/pi-anthropic-messages`; add
  `bundleSource: "https://github.com/BlackBeltTechnology/pi-anthropic-messages.git"`.
- [x] 2.3 Change `pi-flows` `source` →
  `npm:@blackbelt-technology/pi-flows`; add
  `bundleSource: "https://github.com/BlackBeltTechnology/pi-flows.git"`.
- [x] 2.4 Re-add `"pi-flows"` to `BUNDLED_EXTENSION_IDS` (now that
  upstream declares MIT). Drop the stale "license blockers" comment.

## 3. Bundle script changes

- [x] 3.1 Update `packages/electron/scripts/bundle-recommended-extensions.mjs`
  to compute `entry.bundleSource ?? entry.source` for each target.
- [x] 3.2 Update the "non-git source rejected" guard to operate on the
  effective source and to direct the maintainer toward adding a
  `bundleSource` field.

## 4. First-launch activation changes

- [x] 4.1 In `packages/electron/src/lib/dependency-installer.ts`
  `installBundledExtensions`, compute `effectiveSource = entry.bundleSource
  ?? entry.source`.
- [x] 4.2 Use `effectiveSource` for `parseBundledGitSource` (cache path
  computation).
- [x] 4.3 Use `effectiveSource` for `manager.addSourceToSettings(...)`.
- [x] 4.4 Skip-if-present now checks BOTH `entry.source` and
  `effectiveSource` against `manager.getInstalledPath`, so a user who
  installed via either route is detected.

## 5. Recommended-routes changes

- [x] 5.1 In `packages/server/src/routes/recommended-routes.ts`
  `enrichEntry`, define a `matchesEntry(s)` helper that returns true if
  `sourcesMatch(s, entry.source)` OR `sourcesMatch(s, entry.bundleSource)`.
- [x] 5.2 Use `matchesEntry` for `inGlobal`, `inLocal`, `activeInPi`, and
  the `updateAvailable` installed-path lookup.
- [x] 5.3 Metadata fetch: npm-first; fall back to GitHub via
  `bundleSource` parse when npm returns null AND `bundleSource` is a
  github.com URL.

## 6. Tests

- [x] 6.1 Update `packages/shared/src/__tests__/recommended-extensions.test.ts`
  - assertion "pi-anthropic-messages is required, npm-sourced, with git
    bundleSource"
  - assertion "pi-flows is npm-sourced with git bundleSource"
  - assertion "every entry is now npm-sourced"
  - assertion "bundleSource (when present) is an HTTPS .git URL" matching
    `["pi-anthropic-messages", "pi-flows"]`
  - assertion `BUNDLED_EXTENSION_IDS` contains both ids
  - assertion every bundled id resolves to a git-based effective source
- [x] 6.2 Verify `packages/server/src/__tests__/recommended-routes.test.ts`
  passes — the existing "matches git SSH source against git HTTPS active
  source" and "matches git manifest source against a local-path active
  source (basename heuristic)" tests rely on the new `bundleSource`
  matching path.
- [x] 6.3 Run full test suites in
  `packages/shared/`, `packages/server/`, `packages/electron/` for
  affected files — 54 + 39 tests pass, no new failures attributable to
  this change.

## 7. Documentation

- [x] 7.1 `docs/file-index-shared.md` — replace `BUNDLED_EXTENSION_IDS`
  row; drop license-blocker narrative; cite this change.
- [x] 7.2 `docs/file-index-electron.md` — fix `.sh` → `.mjs` extension on
  bundler row; both rows note `bundleSource ?? source` usage.
- [x] 7.3 `docs/architecture.md` — "Bundled first-party extensions"
  subsection updated for `@blackbelt-technology` scope, `bundleSource`
  decoupling, pi-flows re-inclusion.
- [x] 7.4 `README.md` — "Recommended extensions" table sources flipped
  to npm; troubleshooting paragraph updated.
- [x] 7.5 Confirm no stale references remain:
  `grep -rn "license blocker\|License blockers\|missing SPDX\|currently NOT bundled" docs/ README.md`
  → no output.

## 8. Follow-up

- [x] 8.1 Downgrade the documented git requirement from "required" to
  "recommended" in `docs/architecture.md`. The boot-time gate described
  there (`git-gate.ts`, `git-required.html`, `system-toolchain-installer.ts`,
  `openGitRequiredWindow`, `evaluateGitGate`) was never implemented in
  code; the section was aspirational. Section rewritten to match reality
  (21 lines, down from 106). Verified clean: no remaining references to
  any of the phantom module names in `docs/` or `README.md`. Commit
  `74df4030` on `develop`.
- [ ] 8.2 Slim `pi-flows` npm tarball further if 133 KB is undesirable
  (currently includes `agents/`).
- [ ] 8.3 Set up automated republish of `pi-anthropic-messages` and
  `pi-flows` on tag push in their own repos (mirror the dashboard's
  `publish.yml` workflow), so future bumps don't require manual
  `npm publish`.
