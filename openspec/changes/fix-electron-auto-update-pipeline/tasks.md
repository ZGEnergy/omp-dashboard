> **Validation note (current code state):** scaffolding improved since this proposal was written, but all four root causes (drafts, missing `latest*.yml`, unsigned-in-CI mac, swallowed errors) are still live. Status annotations below reflect the validated reality.

## 1. Runtime fixes (no pipeline change)

- [x] 1.1 Replace `app-updater.ts` `onError = () => {}` with severity-classified logger — DONE. `classifyUpdateError()` (debug/warn/error) + `logUpdate()` write to `app.getPath('logs')/electron-main.log`; error listener logs then forwards.
- [x] 1.2 Fix `update-available` dialog handler in `main.ts` to download (not quit) — DONE. `main.ts` imports + calls `downloadAndInstall()` on consent; button relabelled "Download".
- [x] 1.3 Confirm `update-downloaded` dialog handler still calls `quitAndInstall()` only on Restart Now — DONE (`main.ts:320`).
- [x] 1.4 Add View Update Log menu item — DONE. `handleViewUpdateLog()` reveals `getUpdateLogPath()` via `shell.showItemInFolder`; added to mac app submenu + win/linux top-level.
- [x] 1.5 Unit tests — DONE. `app-updater.test.ts`: severity classifier (3 cases), dev-mode skip, download-vs-quit distinct entry points. 10 tests pass.

## 2. Manual update check — DONE

- [x] 2.1 Export `checkForUpdatesNow()` resolving `up-to-date` | `update-available` | `error` — DONE (`ManualCheckResult` union).
- [x] 2.2 Add "Check for Updates…" menu item, hidden in dev — DONE. `isDevMode()` gates it (covers `ELECTRON_DEV` and missing `resourcesPath`).
- [x] 2.3 Wire menu item to `checkForUpdatesNow()` + dialogs — DONE. Menu shows up-to-date / error dialogs.
- [x] 2.4 Reuse the standard update-available dialog flow (no duplication) — DONE. update-available case is surfaced by the existing `update-available` event listener in `main.ts`; menu does not re-implement it.
- [x] 2.5 Unit-test the three result branches with injected `autoUpdater` — DONE. `__setTestAutoUpdater()` seam; up-to-date / update-available / error(throw) / unavailable branches covered.

## 3. Build pipeline: emit update metadata

- [x] 3.1 Add `electron-builder` `publish` config — DONE. New unified `electron-builder.yml` (mac DMG + linux AppImage) + `publish` block in `electron-builder-nsis.json`, all `provider:github owner:BlackBeltTechnology repo:pi-agent-dashboard`. NOTE: real owner is `BlackBeltTechnology` (git remote), not design's lowercase.
- [x] 3.2 Switch macOS DMG → electron-builder `--mac dmg --prepackaged --publish never` — DONE (⚠️ CI-VALIDATE). `_electron-build.yml` mac leg: forge package (signs) → electron-builder DMG; arch-tagged via `-c.mac.artifactName` (supersedes `fix-darwin-dmg-arch-collision` JS workaround). Unverified locally: universal-binary dir glob, arch tagging, signature survival through DMG wrap.
- [x] 3.3 Switch Linux AppImage → electron-builder `--linux AppImage --prepackaged` — DONE (⚠️ CI-VALIDATE). forge make (.deb) → electron-builder AppImage. Removed `@pengx17` maker + its `patch-apprun` step. Updated `_electron-build.yml` + `docker-make.sh`.
- [x] 3.4 Windows NSIS `latest.yml` — DONE. `publish` block added to existing `electron-builder-nsis.json` (already on electron-builder); emits `latest.yml` + embeds `app-update.yml`, no maker swap.
- [ ] 3.5 Verify each builder run emits `latest*.yml` next to the binary in `out/make/` — ⚠️ CI-VALIDATE. `directories.output: out/make` → caught by the `packages/electron/out/make/**/*` artifact glob. Cannot confirm without a CI run.
- [x] 3.6 Add `__tests__/build-config-parity.test.ts` — DONE. 5 tests pass; asserts same `appId` (`com.blackbelt-technology.pi-dashboard`), `executableName`, `productName`, icon family, and publish stream across forge.config + electron-builder.yml + electron-builder-nsis.json.
- [x] 3.7 Update build scripts to surface `latest*.yml` — DONE. `docker-make.sh` linux build runs electron-builder AppImage (emits `latest-linux.yml` into `out/make`). `bundle-server.mjs` needs NO change: electron-builder writes metadata to `out/make`, already covered by `publish.yml`'s `out/make/**/*` upload glob.

## 4. macOS signing and notarisation — Forge plumbing exists; CI never wires secrets so builds stay UNSIGNED.

> **→ SPLIT OUT to its own change: `macos-notarization`.** Per design D4 (signing = independently-revertable PR), tasks 4.1/4.4/4.5/4.6 + secrets/keychain/verification are owned by `openspec/changes/macos-notarization/`. 4.2/4.3 (Forge `osxSign`/`osxNotarize` block + `entitlements.plist`) already DONE here. Mark this section complete once `macos-notarization` ships.

- [ ] 4.1 Add CI secrets: `APPLE_IDENTITY`/`APPLE_ID`/`APPLE_ID_PASSWORD`/`APPLE_TEAM_ID` — OPEN. No `APPLE_*` reference in `_electron-build.yml`/`publish.yml`; `publish.yml:415` still says notarization "(planned)".
- [x] 4.2 Configure mac signing block: `hardenedRuntime: true`, entitlements, notarize — DONE via **Forge** (`forge.config.ts` `osxSign` + `osxNotarize`, gated on `APPLE_IDENTITY`), NOT electron-builder. Reconcile if D1 moves DMG to electron-builder.
- [x] 4.3 Add entitlements plist — DONE. **Drift:** lives at `packages/electron/entitlements.plist` (not `build/entitlements.mac.plist`); has allow-jit, unsigned-exec-memory, network, disable-library-validation. Don't duplicate.
- [ ] 4.4 In `publish.yml`, add a guard step on production tags (`^v\d+\.\d+\.\d+$`) that fails the workflow if any signing secret is missing — OPEN.
- [ ] 4.5 Verify post-build: `xcrun stapler validate <path>.dmg` exits zero AND `codesign --verify --deep --strict <path>/PI Dashboard.app` exits zero
- [ ] 4.6 Document `notarytool` failure modes (2FA expiry, rate limits) in `docs/release.md`

## 5. Publish workflow: drop draft for production tags

- [x] 5.1 Compute `is_prerelease` from the tag name — DONE. `publish.yml` `resolve` job outputs `is_prerelease` via regex `^[0-9]+\.[0-9]+\.[0-9]+-`.
- [x] 5.2 Replace `draft: true` literal with the prerelease expression — DONE. `publish.yml` `Create GitHub Release` now uses `draft: ${{ needs.resolve.outputs.is_prerelease == 'true' }}`.
- [x] 5.3 Set `prerelease:` so pre-releases stay out of the "latest" query — DONE (`publish.yml:447`).
- [x] 5.4 Upload glob includes `latest*.yml` — DONE. `files: electron-*/**/*` catches them now that §3 emits them; added a `Merge macOS update metadata` step (arm64+x64 → one `latest-mac.yml`, drops duplicates). ⚠️ CI-VALIDATE merge correctness.
- [x] 5.5 Add a workflow assertion step — DONE. `Assert update metadata present for each installer` fails the release if a `*.exe`/`*.dmg`/`*.AppImage` ships without its matching `latest*.yml`, before `Create GitHub Release`.

## 6. Skill + docs updates

- [x] 6.1 Update `.pi/skills/release-cut/SKILL.md` — DONE. Production tags publish automatically (electron-updater needs published releases); pre-release tags stay drafts. Updated description, intro, Step 8 box, guardrail, DMG artifact names.
- [x] 6.2 Update `.pi/skills/release-revoke/SKILL.md` — DONE. Added pitfall: published production releases self-distribute via `latest*.yml`; `gh release delete` stops new clients but cannot recall a pulled update — supersede with a higher `vX.Y.Z+1` tag.
- [x] 6.3 Add "How auto-update works" to `docs/architecture.md` — DONE (delegated, caveman style). New `## Electron Auto-Update` section: schedule, dialog flow, log location, manual trigger, signing requirement, publish contract, draft-vs-published gate.
- [x] 6.4 Add FAQ entry to `docs/faq.md` — DONE (delegated). "Why didn't I get an update?" covers four historical failure modes + diagnostics (`electron-main.log`, Check for Updates…, View Update Log).
- [x] 6.5 Add `docs/file-index-electron.md` rows — DONE (delegated). New rows: `app-updater.ts`, `electron-builder.yml`, `build-config-parity.test.ts`; updated `electron-builder-nsis.json` (appId + publish), `forge.config.ts` (makers removed), `app-menu.ts`, `docker-make.sh`.
- [x] 6.6 AGENTS.md "Key Files" — DONE (no-op). `app-updater.ts` is a focused utility, not backbone; per Documentation Update Protocol (AGENTS.md MUST NOT contain a per-file index) the file-index split suffices.

## 7. Manual end-to-end verification

- [ ] 7.1 Cut a `v0.0.0-test.1` pre-release tag; verify the workflow drafts the release, attaches `latest*.yml`, and the manual-check menu item correctly reports "up to date" against an artificially older `package.json` version
- [ ] 7.2 On macOS: install the previous public release, then push a higher production tag; verify within 60s the user gets the update-available dialog, downloads, and applies
- [ ] 7.3 On Linux (AppImage): repeat the test from 7.2
- [ ] 7.4 On Windows (NSIS): repeat the test from 7.2 (unsigned NSIS — confirm UAC prompt is acceptable)
- [ ] 7.5 Tail `~/.pi/dashboard/electron.log` (or platform equivalent) during the test and confirm the new severity-tiered log entries appear

## 8. Rollback safety

- [ ] 8.1 Verify each PR is independently revertable: runtime PR (sections 1-2), pipeline PR (sections 3, 5, 6), signing PR (section 4)
- [ ] 8.2 Document rollback steps in `docs/release.md`: how to flip a published release back to draft if a bad `latest*.yml` ships
