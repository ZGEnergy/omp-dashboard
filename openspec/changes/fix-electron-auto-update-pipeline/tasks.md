## 1. Runtime fixes (no pipeline change)

- [ ] 1.1 Replace `app-updater.ts` `onError = () => {}` with severity-classified logger that writes to `app.getPath('logs')/electron-main.log` (debug for `update-not-available`, warn for network errors, error for signature/parse errors)
- [ ] 1.2 Fix `update-available` dialog handler in `main.ts`: call `autoUpdater.downloadUpdate()` (not `quitAndInstall()`) when user clicks Download
- [ ] 1.3 Confirm `update-downloaded` dialog handler still calls `quitAndInstall()` only on Restart Now
- [ ] 1.4 Add `Help → View update log` menu item in `app-menu.ts` that opens the log file in the OS file manager via `shell.showItemInFolder`
- [ ] 1.5 Add unit tests in `packages/electron/src/__tests__/app-updater.test.ts` for: severity classifier, dev-mode skip, dialog ordering (download before quitAndInstall)

## 2. Manual update check

- [ ] 2.1 Export a `checkForUpdatesNow()` function from `app-updater.ts` that calls `autoUpdater.checkForUpdates()` and resolves with one of three result types (`up-to-date`, `update-available`, `error`)
- [ ] 2.2 Add "Check for updates…" menu item in `app-menu.ts` (hidden when `process.env.ELECTRON_DEV` is set)
- [ ] 2.3 Wire the menu item to call `checkForUpdatesNow()` and display one of three native dialogs based on the result
- [ ] 2.4 Reuse the standard update-available dialog flow (do not duplicate code)
- [ ] 2.5 Unit-test the three result branches with mocked `autoUpdater`

## 3. Build pipeline: emit update metadata

- [ ] 3.1 Add `electron-builder` config (inline in `forge.config.ts` `getAppBuilderConfig` or a separate `electron-builder.yml`) declaring `publish: { provider: 'github', owner: 'blackbelt-technology', repo: 'pi-agent-dashboard' }`
- [ ] 3.2 Switch macOS DMG generation from `@electron-forge/maker-dmg` to `electron-builder --mac dmg --publish never`; verify identical output filename + arch tagging
- [ ] 3.3 Switch Linux AppImage generation from `@pengx17/electron-forge-maker-appimage` to `electron-builder --linux AppImage --publish never`
- [ ] 3.4 Switch Windows NSIS generation from `@felixrieseberg/electron-forge-maker-nsis` to `electron-builder --win nsis --publish never`
- [ ] 3.5 Verify each builder run emits `latest*.yml` next to the binary in `out/make/` (or electron-builder's default `dist/`)
- [ ] 3.6 Add `__tests__/build-config-parity.test.ts` asserting Forge and electron-builder configs declare the same `appId`, `productName`, executable name, and icon paths
- [ ] 3.7 Update `packages/electron/scripts/bundle-server.mjs` and `docker-make.sh` to copy `latest*.yml` into the artifact upload directory consumed by `publish.yml`

## 4. macOS signing and notarisation

- [ ] 4.1 Add CI secrets: `CSC_LINK` (base64 .p12), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (document procedure in `docs/release.md`)
- [ ] 4.2 Configure electron-builder mac block: `hardenedRuntime: true`, `gatekeeperAssess: false`, `entitlements`/`entitlementsInherit` paths, `notarize: true`
- [ ] 4.3 Add entitlements plist files at `packages/electron/build/entitlements.mac.plist` (allow JIT, dyld env vars as needed by Electron)
- [ ] 4.4 In `publish.yml`, add a guard step on production tags (`^v\d+\.\d+\.\d+$`) that fails the workflow if any signing secret is missing
- [ ] 4.5 Verify post-build: `xcrun stapler validate <path>.dmg` exits zero AND `codesign --verify --deep --strict <path>/PI Dashboard.app` exits zero
- [ ] 4.6 Document `notarytool` failure modes (2FA expiry, rate limits) in `docs/release.md`

## 5. Publish workflow: drop draft for production tags

- [ ] 5.1 Add a workflow expression at the top of `publish.yml` computing `is_prerelease` from the tag name (true for tags containing `-`, false otherwise)
- [ ] 5.2 Replace `softprops/action-gh-release` step's `draft: true` literal with `draft: ${{ env.is_prerelease == 'true' }}`
- [ ] 5.3 Set `prerelease: ${{ env.is_prerelease == 'true' }}` so pre-releases are still excluded from `electron-updater`'s default "latest" query
- [ ] 5.4 Update the upload glob to include `latest*.yml` files alongside the installers
- [ ] 5.5 Add a workflow assertion step: if any `latest*.yml` is missing for an OS that produced an installer, fail the workflow before creating the GitHub Release

## 6. Skill + docs updates

- [ ] 6.1 Update `.pi/skills/release-cut/SKILL.md`: production cuts no longer leave a draft — the workflow publishes directly. Document the pre-release flow separately (still drafts).
- [ ] 6.2 Update `.pi/skills/release-revoke/SKILL.md` instructions to handle published-not-drafted production releases (gh release delete is unchanged but the recovery story differs)
- [ ] 6.3 Add a section "How auto-update works" to `docs/architecture.md` near the Electron section, covering: check schedule, dialog flow, log location, manual trigger, signing requirement, draft-vs-published gate
- [ ] 6.4 Add an entry to `docs/faq.md`: "Why didn't I get an update?" — covers the four historical failure modes (drafts, missing metadata, unsigned mac, swallowed errors) and the diagnostic log file
- [ ] 6.5 Add a row to `docs/file-index-electron.md` for `app-updater.ts` (caveman style, ≤ 200 chars per row) — delegate to a general-purpose subagent per AGENTS.md Documentation Update Protocol
- [ ] 6.6 Update `AGENTS.md` "Key Files" section if `app-updater.ts` is missing — but only if it warrants backbone status (otherwise file-index split is sufficient)

## 7. Manual end-to-end verification

- [ ] 7.1 Cut a `v0.0.0-test.1` pre-release tag; verify the workflow drafts the release, attaches `latest*.yml`, and the manual-check menu item correctly reports "up to date" against an artificially older `package.json` version
- [ ] 7.2 On macOS: install the previous public release, then push a higher production tag; verify within 60s the user gets the update-available dialog, downloads, and applies
- [ ] 7.3 On Linux (AppImage): repeat the test from 7.2
- [ ] 7.4 On Windows (NSIS): repeat the test from 7.2 (unsigned NSIS — confirm UAC prompt is acceptable)
- [ ] 7.5 Tail `~/.pi/dashboard/electron.log` (or platform equivalent) during the test and confirm the new severity-tiered log entries appear

## 8. Rollback safety

- [ ] 8.1 Verify each PR is independently revertable: runtime PR (sections 1-2), pipeline PR (sections 3, 5, 6), signing PR (section 4)
- [ ] 8.2 Document rollback steps in `docs/release.md`: how to flip a published release back to draft if a bad `latest*.yml` ships
