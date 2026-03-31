## 1. Hook

- [x] 1.1 Create `useInstallPrompt` hook with `beforeinstallprompt` capture, `canInstall`, `prompt()`, standalone detection (`isInstalled`), and iOS detection (`isIOS`)
- [x] 1.2 Write tests for `useInstallPrompt` covering all scenarios (prompt capture, standalone, iOS, prompt trigger)

## 2. Sidebar Install Button

- [x] 2.1 Create `InstallButton` component that renders an icon button when `canInstall` is true, hidden when installed or unavailable
- [x] 2.2 Add `InstallButton` to the sidebar icon row in `SessionList.tsx` next to TunnelButton
- [x] 2.3 Write tests for `InstallButton` (renders when available, hidden when not, calls prompt on click)

## 3. Mobile Install Banner

- [x] 3.1 Create `InstallBanner` component with install button (Chromium) and iOS guidance text
- [x] 3.2 Add localStorage dismissal logic with key `pwa-install-dismissed`
- [x] 3.3 Integrate `InstallBanner` into the mobile layout in `App.tsx`
- [x] 3.4 Write tests for `InstallBanner` (renders for canInstall, renders iOS guidance, dismissal persists, hidden when installed)

## 4. Apple Touch Icon

- [x] 4.1 Add `<link rel="apple-touch-icon" href="/icon-192.png">` to `src/client/index.html`
