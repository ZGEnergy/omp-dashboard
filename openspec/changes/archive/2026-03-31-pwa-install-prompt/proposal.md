## Why

PWA manifest, service worker, and icons are all in place, but users are never prompted to install the app. Browsers require apps to handle the `beforeinstallprompt` event and present their own install UI — without it, the install opportunity is silently lost. On iOS, there is no prompt event at all, so users need manual guidance.

## What Changes

- Add a `useInstallPrompt` React hook that captures the `beforeinstallprompt` event, detects standalone mode (already installed), and detects iOS for manual guidance.
- Add an `InstallButton` in the sidebar icon row (next to Tunnel/Settings) that triggers the native install prompt. Hidden when already installed or when the browser doesn't support installation.
- Add a dismissible `InstallBanner` on mobile that either triggers the install prompt directly or shows iOS-specific "Add to Home Screen" instructions. Dismissal is persisted in `localStorage`.
- Add `<link rel="apple-touch-icon">` to `index.html` pointing to the existing `icon-192.png` so iOS uses the pi icon on the home screen.

## Capabilities

### New Capabilities
- `pwa-install-prompt`: Hook, sidebar button, and mobile banner for prompting PWA installation across browsers including iOS guidance.

### Modified Capabilities
- `pwa-manifest`: Add apple-touch-icon link requirement to index.html.

## Impact

- **Client code**: New hook (`useInstallPrompt`), new components (`InstallButton`, `InstallBanner`), minor changes to `SessionList` (sidebar icon row) and `App`/mobile layout (banner).
- **HTML**: One `<link>` tag added to `index.html`.
- **No server changes**.
- **No new dependencies** — uses browser APIs and existing MDI icons.
