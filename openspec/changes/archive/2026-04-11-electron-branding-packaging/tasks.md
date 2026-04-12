## 1. Icon Assets

- [x] 1.1 Recenter the π glyph in the master icon (1024×1024 PNG) and save to `packages/electron/resources/icon.png`
- [x] 1.2 Create macOS tray template icons: `trayTemplate.png` (16×16) and `trayTemplate@2x.png` (32×32) — white π silhouette on transparent background
- [x] 1.3 Add `electron-icon-builder` as devDependency and create an `icons` npm script to generate `.icns` and `.ico` from the master PNG
- [x] 1.4 Run the icon generation script to produce `icon.icns` and `icon.ico` in `packages/electron/resources/`
- [x] 1.5 Update `public/icon-512.png` and `public/icon-192.png` with the recentered design

## 2. Branding Wiring

- [x] 2.1 Add `icon: "./resources/icon"` to `packagerConfig` in `forge.config.ts`
- [x] 2.2 Fix `tray.ts` to load `trayTemplate.png` on macOS and `icon.ico`/`icon.png` on Windows/Linux instead of `nativeImage.createEmpty()`
- [x] 2.3 Create `src/lib/app-menu.ts` with macOS app menu (About dialog, Edit, View, Window menus)
- [x] 2.4 Call `setupAppMenu()` from `main.ts` on app ready

## 3. Windows NSIS Installer

- [x] 3.1 Replace `@electron-forge/maker-squirrel` with `electron-forge-maker-nsis` in `package.json` devDependencies
- [x] 3.2 Update `forge.config.ts` makers array: replace Squirrel config with NSIS config (app icon, one-click, per-user install)

## 4. Linux AppImage

- [x] 4.1 Add `electron-forge-maker-appimage` to `package.json` devDependencies
- [x] 4.2 Add AppImage maker to `forge.config.ts` makers array with app icon configuration

## 5. CI Workflow

- [x] 5.1 Update `.github/workflows/electron-build.yml` to install NSIS dependencies on Windows runner (if needed)
- [x] 5.2 Update CI workflow artifact upload paths for new maker output locations (NSIS `.exe`, AppImage)
- [x] 5.3 Test CI build matrix produces DMG (macOS), NSIS exe (Windows), DEB + AppImage (Linux)
