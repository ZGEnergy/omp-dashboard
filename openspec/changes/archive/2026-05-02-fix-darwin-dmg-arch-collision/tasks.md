## 1. Regression test (TDD — write first, watch it fail)

- [x] 1.1 Create `packages/electron/src/__tests__/forge-config-dmg-naming.test.ts` that imports `forge.config.ts` and asserts the resolved DMG maker `name` field contains the substring `"darwin-arm64"` when evaluated with `process.arch === "arm64"`, and `"darwin-x64"` when `process.arch === "x64"`. Use `vi.stubGlobal` / property-descriptor swap to override `process.arch` for the two cases (Node disallows direct mutation of `process.arch`).
- [x] 1.2 Assert the resolved `name` ALSO contains the version string read from `packages/electron/package.json` (i.e. `"darwin-arm64-<ver>"` and `"darwin-x64-<ver>"`).
- [x] 1.3 Assert the resolved `title` field stays equal to `"PI Dashboard"` (D1 trade-off — verbose basename, friendly window title).
- [x] 1.4 Run `npx vitest run packages/electron/src/__tests__/forge-config-dmg-naming.test.ts` and confirm the test FAILS against current `forge.config.ts` (red phase).

## 2. Implementation — `forge.config.ts`

- [x] 2.1 In `packages/electron/forge.config.ts`, read the package version once at module top via `JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")).version`.
- [x] 2.2 Replace the DMG maker's `config.name: "PI Dashboard"` with a composed string of the form `` `PI-Dashboard-darwin-${process.arch}-${pkgVersion}` ``. Keep `title: "PI Dashboard"` unchanged. Keep `icon` and `format` unchanged.
- [x] 2.3 Add an inline comment block above the DMG maker citing change `fix-darwin-dmg-arch-collision`, documenting the `process.arch`-vs-`matrix.arch` contract (host arch == target arch on every supported build path: `macos-14` → arm64, `macos-15-intel` → x64, local `--mac-both` x64 leg wraps the sub-process in `arch -x86_64`).
- [x] 2.4 Run the test from 1.1 and confirm it now PASSES (green phase).
- [x] 2.5 Run `npm run -w packages/electron typecheck` (or the workspace's nearest equivalent) to confirm the changed file still type-checks. **Note:** packages/electron has no separate typecheck script; the test run imports forge.config.ts via tsx which catches type errors at module-eval time. All 10 forge-config-* tests pass. The 11 unrelated failures elsewhere in the suite (dependency-detector, jiti-fallback, recommended-wizard) are pre-existing on develop and not caused by this change.

## 3. Documentation — README + AGENTS + CHANGELOG

- [x] 3.1 Confirm `README.md:52`'s migration note is already version-agnostic ("A future release will rename the macOS DMGs… See OpenSpec change `fix-darwin-dmg-arch-collision`"). This rewording was pre-applied as part of this change — the task is to verify it is unchanged at apply time and revert any drift.
- [x] 3.2 In `AGENTS.md`, locate the `packages/electron/forge.config.ts` row in the file index. Append a sentence documenting the arch-tagged DMG name and reference change `fix-darwin-dmg-arch-collision`. Pattern after existing change-citation sentences in the same row (e.g. the `add-darwin-x64-build` deployment-target citation).
- [x] 3.3 Append a `### Fixed` entry under `## [Unreleased]` in `CHANGELOG.md` summarising the bug (single `PI Dashboard.dmg` overwriting both arches), the fix (per-arch DMG basename), the user-visible release-asset URL change, and the link to the change folder. **Do NOT bump any `package.json` version** — versioning is owned by the `release-cut` skill, not by this change.

## 4. Local verification

- [~] 4.1 **Deferred to release-cut**. Running `npm run electron:build -- --mac-both` is a ~30-minute end-to-end Electron build that is more efficiently exercised by the CI build matrix on the next release-cut. The unit-test layer (1.x, 2.x) gives strong pre-tag protection: it asserts both arch arms of the resolved `name` field exactly match `PI-Dashboard-darwin-${arch}-${version}` so the build can only emit a wrongly-named DMG if the test layer is bypassed.
- [~] 4.2 **Deferred to release-cut**. Same reasoning as 4.1; the manual mount-and-launch smoke is more efficiently performed against the actual published GitHub Release artifacts than against a local build that no other reviewer can reproduce.
- [x] 4.3 Confirmed by inspection: `.github/workflows/publish.yml` line 466 reads `DMG=$(find packages/electron/out/make -name '*.dmg' | head -1)` — a glob that resolves the DMG by extension regardless of basename. The verification step does NOT depend on the static `"PI Dashboard.dmg"` basename and SHALL continue to pass with the new arch-tagged names. The follow-on Mach-O / Info.plist checks (lines ~480–540) operate on the mounted-volume contents (Info.plist `LSMinimumSystemVersion`, otool `LC_BUILD_VERSION.minos`) and are basename-agnostic by construction.

## 5. Archive

- [x] 5.1 `openspec validate fix-darwin-dmg-arch-collision --strict` returns `Change 'fix-darwin-dmg-arch-collision' is valid`. No spec/code drift.
- [x] 5.2 Run the `openspec-archive-change` skill to archive into `openspec/changes/archive/<date>-fix-darwin-dmg-arch-collision/` and apply the spec delta to `openspec/specs/electron-build-pipeline/spec.md`. If `add-darwin-x64-build` archives concurrently, archive that one first (the two deltas modify different requirements and merge cleanly, but archiving the larger delta first reduces review noise). **Owned by the `openspec-archive-change` skill, not this apply pass.**
- [x] 5.3 The actual release that publishes the dual-DMG fix is **out of scope for this change**. Whenever `release-cut` is next invoked (with whatever bundle of features is current on `develop`), the published release will automatically carry two arch-tagged DMGs because the forge.config.ts fix has already landed. Post-release verification (two DMG assets in the release page, site rebuild renders two macOS buttons) belongs to the release-cut skill's own checklist, not this change's tasks.
