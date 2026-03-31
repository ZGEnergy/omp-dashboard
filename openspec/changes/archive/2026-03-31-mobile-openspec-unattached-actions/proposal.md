## Why

On mobile, when no OpenSpec proposal is attached to a session, the kebab menu (MobileActionMenu) has no way to create a new change or enter explore mode. These actions are only available on desktop via `SessionOpenSpecActions` in the sidebar card. This leaves mobile users unable to start OpenSpec workflows from the content view.

## What Changes

- Add "Explore" and "+ New Change" menu rows to `MobileActionMenu` when no proposal is attached and the session is alive
- Reuse existing `ExploreDialog` and `NewChangeDialog` components (rendered via `DialogPortal`)
- Guard both entries behind `!isEnded` and `onSendPrompt` availability, matching desktop behavior

## Capabilities

### New Capabilities

_(none — this extends existing mobile UI components)_

### Modified Capabilities

- `openspec-dialogs`: Mobile kebab menu gains unattached Explore and New Change entries that open the same dialogs used on desktop

## Impact

- `src/client/components/MobileActionMenu.tsx` — primary change: add unattached OpenSpec section, dialog state, and DialogPortal rendering
- No new components, dependencies, or API changes
- Existing `ExploreDialog`, `NewChangeDialog`, and `DialogPortal` reused as-is
