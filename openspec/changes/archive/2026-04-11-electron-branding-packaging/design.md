## Context

The Electron app at `packages/electron/` uses Electron Forge for building and packaging. It currently has:
- No icon files — tray uses `nativeImage.createEmpty()`, no icon in `packagerConfig`
- No macOS app menu or About dialog
- Squirrel for Windows (minimal install experience)
- DEB only for Linux (no universal option)
- A PWA icon at `public/icon-512.png` with an off-center π glyph that can serve as the base

Key files: `forge.config.ts`, `src/lib/tray.ts`, `src/main.ts`, `.github/workflows/electron-build.yml`

## Goals / Non-Goals

**Goals:**
- Proper app icon on all platforms (macOS .icns, Windows .ico, Linux .png, tray icons)
- macOS app menu with About dialog showing version and copyright
- Professional Windows installer via NSIS
- AppImage for distribution-independent Linux packaging
- Updated CI to produce all new artifact types

**Non-Goals:**
- Icon redesign — only recenter the existing π design
- Windows code signing
- Flatpak/Snap packaging
- Auto-update changes (already working)

## Decisions

### D1: Icon generation approach — `electron-icon-builder` npm package

Generate all platform icon variants from a single 1024×1024 master PNG using `electron-icon-builder` as a dev script.

**Rationale**: Single source of truth, reproducible, no manual conversion. Alternatives like `png2icons` or manual Photoshop export are less automatable.

**Icon file layout:**
```
packages/electron/resources/
  icon.icns          — macOS app icon (generated)
  icon.ico           — Windows app icon (generated)
  icon.png           — Linux app icon (1024×1024 master)
  trayTemplate.png   — macOS tray 16×16 (manual: white silhouette)
  trayTemplate@2x.png — macOS tray 32×32 (manual: white silhouette)
```

The master icon also updates `public/icon-512.png` and `public/icon-192.png` (PWA).

Note: macOS tray icons must be "template images" — white/black silhouettes with transparency. These are created separately from the full-color app icon.

### D2: Windows installer — `@felixrieseberg/electron-forge-maker-nsis`

Use `@felixrieseberg/electron-forge-maker-nsis` (proper Forge MakerBase class).

**Rationale**: Mature, well-tested, produces a standard "Next → Install" wizard. Supports custom icon, per-user install, and is compatible with `electron-updater` for auto-updates. Implements Forge's MakerBase API correctly.

**Alternatives considered:**
- `electron-forge-maker-nsis` (electron-builder wrapper) — rejected, exports a plain function instead of MakerBase class, causing `paths[0]` resolution errors with Forge 7.x
- Keep Squirrel — rejected, minimal UX

### D3: Linux universal — `@pengx17/electron-forge-maker-appimage`

Use `@pengx17/electron-forge-maker-appimage` (proper Forge MakerBase class).

**Rationale**: AppImage runs on any Linux distro without installation. Combined with existing DEB maker, this covers essentially all Linux users. Implements Forge's MakerBase API correctly.

**Alternatives considered:**
- `electron-forge-maker-appimage` (electron-builder wrapper) — rejected, exports a plain function instead of MakerBase class, causing `paths[0]` resolution errors with Forge 7.x
- RPM maker — narrower reach than AppImage, adds complexity
- Flatpak/Snap — more complex, requires store accounts

### D4: App menu — new `app-menu.ts` module

Create a dedicated module that sets up the native application menu with:
- **macOS**: App name menu (About, Separator, Quit), Edit (Undo, Cut, Copy, Paste, Select All), View (Reload, Toggle DevTools), Window (Minimize, Close)
- **Windows/Linux**: minimal menu or none (these platforms don't have the same app menu convention)

About dialog uses `dialog.showMessageBox` with app version from `app.getVersion()`.

**Rationale**: Keep it simple. Native `dialog.showMessageBox` is sufficient — no need for a custom About window.

### D5: Icon centering — regenerate with nano-banana or manual edit

The π glyph in the current icon sits slightly high. Recenter it by regenerating the master PNG. This is a one-time manual fix before generating platform variants.

## Risks / Trade-offs

- **Community makers**: Both `electron-forge-maker-nsis` and `electron-forge-maker-appimage` wrap electron-builder targets. They're widely used but not official Forge packages. → Mitigation: pin versions, test in CI before release.
- **Tray template icons**: macOS requires monochrome template images for the menu bar. The full-color π icon won't work — need a separate white-on-transparent version. → Mitigation: create manually as a simple 16×16 white π.
- **AppImage size**: AppImage bundles everything, producing larger files (~150MB+). → Acceptable trade-off for universal compatibility.
- **NSIS on CI**: NSIS requires Windows runner. Already have `windows-latest` in the matrix. No additional risk.
