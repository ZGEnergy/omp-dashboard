# Electron Branding & Packaging

## Problem

The Electron app ships without proper branding or cross-platform installers:

- **No app icon** — macOS shows generic Electron icon, Windows shows blank, tray is invisible (`nativeImage.createEmpty()`)
- **No About dialog or app menu** — macOS has no "About PI Dashboard" menu item, no standard Edit/View/Window menus
- **Windows installer is bare** — Squirrel produces a minimal, unattractive install experience
- **Linux has no universal package** — only DEB is available, leaving Fedora/Arch/etc. users without an option
- **Existing PWA icon has off-center π glyph** — needs recentering before deriving platform variants

## Solution

### 1. Fix & Generate Icons

- Recenter the π glyph in the master 512×512 (and 1024×1024) PNG
- Generate platform variants from the master:
  - `.icns` for macOS (multi-resolution)
  - `.ico` for Windows (multi-resolution)
  - `trayTemplate.png` + `trayTemplate@2x.png` for macOS menu bar
  - Update `public/icon-192.png` and `public/icon-512.png` (PWA)
- Place all Electron icons under `packages/electron/resources/`

### 2. Wire Branding Into Electron

- Set `icon` in `forge.config.ts` `packagerConfig`
- Fix `tray.ts` to load the real tray icon instead of `createEmpty()`
- Add `app-menu.ts` with macOS app menu: About dialog (version, copyright), Edit (copy/paste), View (reload, devtools), Window (minimize, close)
- Set proper `BrowserWindow` title

### 3. Switch Windows Installer to NSIS

- Replace `@electron-forge/maker-squirrel` with `@electron-forge/maker-nsis` (or `maker-nsis-web`)
- Configure installer name, icon, license, install directory
- Update CI workflow

### 4. Add AppImage for Linux

- Add `@electron-forge/maker-appimage` (or `electron-builder`'s AppImage target)
- Keep DEB maker for Debian/Ubuntu users
- Drop RPM — AppImage covers all non-DEB distros
- Update CI workflow to produce AppImage artifacts

### 5. Update CI Workflow

- Update `.github/workflows/electron-build.yml` for new makers
- Ensure artifacts are uploaded with correct names for `electron-updater` GitHub Releases flow

## Out of Scope

- Auto-update mechanism changes (already working via `electron-updater` + GitHub Releases)
- Code signing for Windows (can be added later)
- Flatpak/Snap packaging
- Icon redesign — only recentering the existing π design

## Risks

- **NSIS maker maturity**: `@electron-forge/maker-nsis` is community-maintained; may need fallback to `electron-builder` for Windows
- **AppImage maker**: `@electron-forge/maker-appimage` is also community; evaluate stability
- **Icon generation tooling**: Need `png2icons`, `electron-icon-builder`, or similar in dev workflow
