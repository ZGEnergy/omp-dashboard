## Context

`MobileActionMenu` is the kebab (⋮) menu rendered in the mobile session header. It currently shows OpenSpec actions only when `session.attachedProposal` is set. On desktop, `SessionOpenSpecActions` provides "Explore" and "+ Change" buttons even when unattached — these are missing on mobile.

## Goals / Non-Goals

**Goals:**
- Add "Explore" and "+ New Change" to the mobile kebab menu when no proposal is attached
- Reuse existing `ExploreDialog` and `NewChangeDialog` without modification
- Match the same guards as desktop: only show when session is alive and `onSendPrompt` is available

**Non-Goals:**
- Redesigning the mobile action menu layout
- Adding the attach combo box to the kebab menu (already handled by `MobileAttachButton`)
- Changing dialog behavior or appearance

## Decisions

**Render dialogs via DialogPortal outside the menu**
The menu closes on outside click/touch. Dialogs must render via `DialogPortal` at document.body so they aren't dismissed when the menu closes. The menu's `act()` helper closes the menu first, then the dialog state opens — this sequence already works for other flows.

**Place unattached section before the attached section**
The new entries appear in an "OpenSpec" labeled section (matching the existing attached section style) between editors and the exit button. When a proposal IS attached, the existing attached section renders instead — the two are mutually exclusive.

**Reuse `act()` pattern for opening dialogs**
Call `act(() => setExploreOpen(true))` which closes the menu, then opens the dialog. This matches how other menu actions work.

## Risks / Trade-offs

- [Risk] Dialog opens after menu closes — brief visual gap → Acceptable; same pattern used throughout the app
- [Risk] Adding state (`exploreOpen`, `newChangeOpen`) to MobileActionMenu → Minimal; two boolean states, component is already stateful
