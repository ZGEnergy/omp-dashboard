## Context

PWA manifest, service worker, and icons are already in place (`public/manifest.json`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`). The service worker is registered in `src/client/main.tsx`. However, there is no UI to prompt users to install the app. Browsers require apps to handle the `beforeinstallprompt` event and present their own install UI. iOS Safari doesn't fire this event at all, requiring manual guidance.

The sidebar icon row in `SessionList.tsx` already has TunnelButton, QR code, and Settings icons — the install button fits naturally there.

## Goals / Non-Goals

**Goals:**
- Provide a clear install path on all platforms (Chrome, Firefox, Safari, iOS, Android)
- Sidebar install button for desktop users
- Dismissible mobile banner with iOS-specific guidance
- Use existing pi branding icons for the installed app
- Add apple-touch-icon for proper iOS home screen icon

**Non-Goals:**
- Offline caching or advanced service worker features
- Push notifications
- Custom install analytics or tracking

## Decisions

### 1. Single `useInstallPrompt` hook for all install state

All install-related state (deferred prompt, standalone detection, iOS detection) lives in one hook. Components consume it without duplicating logic.

**Alternative**: Separate hooks per concern — rejected as over-engineered for three boolean flags and one event handler.

### 2. Sidebar button placement in existing icon row

The install button goes in the `SessionList.tsx` icon row alongside Tunnel and Settings. Same size (`0.6`), same styling pattern. Hidden when not applicable (already installed, or browser doesn't support install).

**Alternative**: Dedicated sidebar section — rejected, too prominent for a one-time action.

### 3. Mobile banner as a top-of-content dismissible strip

A thin banner appears above the main content area on mobile viewports. Dismissal is saved to `localStorage` so it doesn't reappear. On iOS, it shows "Tap Share → Add to Home Screen" text instead of an install button.

**Alternative**: Modal dialog — rejected, too intrusive for a voluntary action.

### 4. localStorage key for banner dismissal

Key: `pwa-install-dismissed`. Simple boolean string. No expiry — once dismissed, stays dismissed.

## Risks / Trade-offs

- [Risk] `beforeinstallprompt` is not supported in Firefox or Safari → Mitigation: Button simply won't appear on those browsers; iOS gets manual guidance banner instead.
- [Risk] Banner may be annoying on repeated visits → Mitigation: localStorage dismissal ensures it shows only once.
- [Trade-off] No install prompt on Firefox desktop — acceptable since Firefox doesn't support PWA install on desktop at all.
