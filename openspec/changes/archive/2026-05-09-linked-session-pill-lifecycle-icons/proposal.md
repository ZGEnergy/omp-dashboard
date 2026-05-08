## Why

In the sidebar's `FolderOpenSpecSection`, every active proposal lists its attached sessions as compact blue pills under the change row (e.g. `honcho-dashboard-plugin-impl2` under `honcho-dashboard-plugin`). Today the entire pill is a single click target whose only action is "navigate to session" (`onNavigateToSession(s.id)`).

To perform any lifecycle action on an attached session — hide, unhide, resume after the session ended, fork — the user must first navigate into the session card and act on it there. For agents that finished work and went idle, this is two clicks just to resume; for hidden agents, it's a separate trip through the hidden-sessions UI.

Every needed handler (`handleHide`, `handleUnhide`, `onResume`) already exists at the `SessionList` call site of `FolderOpenSpecSection`. Surfacing them as inline icons on the pill is pure UX plumbing — no new state, no new endpoints, no protocol changes.

## What Changes

- **MODIFIED**: `packages/client/src/components/FolderOpenSpecSection.tsx` — the linked-session pill (currently a single `<button>` covering the full row) becomes a flex row with the session name on the left (still click-to-jump, preserving current muscle memory) and a trailing icon group on the right.
  - **Hide ↔ Unhide** (always shown, toggles on `session.isHidden`/visibility flag): `mdiEyeOffOutline` when visible, `mdiEyeOutline` when hidden.
  - **Resume** (conditional, mirrors SessionCard logic — shown when `(!isAlive || isHidden) && session.sessionFile`): `mdiPlayCircleOutline`. Calls `onResumeSession(id, "continue")`.
  - **Fork** (shown whenever `session.sessionFile` exists, mirrors SessionCard): `mdiSourceFork`. Calls `onResumeSession(id, "fork")`.
  - Each icon button calls `e.stopPropagation()` so clicking an icon does not also fire the row's jump handler.
- **MODIFIED**: `FolderOpenSpecSection`'s `Props` interface gains three optional callbacks: `onHideSession?: (id: string) => void`, `onUnhideSession?: (id: string) => void`, `onResumeSession?: (id: string, mode: "continue" | "fork") => void`. All optional — when a host doesn't pass them, the corresponding icons render disabled or are omitted (TBD in tasks; default to omission for cleanliness).
- **MODIFIED**: `packages/client/src/components/SessionList.tsx` (~L495) — the existing `<FolderOpenSpecSection ... onNavigateToSession={onSelect} />` invocation forwards the three new callbacks: `onHideSession={handleHide}`, `onUnhideSession={handleUnhide}`, `onResumeSession={onResume}`. All three already exist in scope.
- **NOT INTRODUCED**: a "shutdown" / close-session icon in the pill. Destructive actions stay behind the SessionCard's existing confirm flow — users must jump first.
- **NOT INTRODUCED**: a separate explicit "jump" icon. The row body retains its click-to-jump role (Variant A from explore conversation), keeping muscle memory intact.
- **NOT INTRODUCED**: any change to the linked-sessions filter. Hidden attached sessions continue to appear in this list (they do today — `linkedSessions = sessions?.filter(s => s.attachedProposal === c.name)` has no `isHidden` filter); the unhide icon is what makes their continued presence useful.
- **NOT INTRODUCED**: any change to the WebSocket protocol, REST endpoints, or persistence. Pure UI surfacing of existing actions.

## Capabilities

### New Capabilities

None. This is a UX surfacing of existing capabilities.

### Modified Capabilities

None at the spec level. The behaviour change is local to one client component and does not alter any documented capability contract.

## Impact

- **MODIFIED files**:
  - `packages/client/src/components/FolderOpenSpecSection.tsx` (linked-session pill render + props interface)
  - `packages/client/src/components/SessionList.tsx` (forward three handlers to `FolderOpenSpecSection`)
  - `packages/client/src/components/__tests__/FolderOpenSpecSection.test.tsx` (new test cases for icon visibility conditions and stopPropagation)

- **NEW files**: none.

- **Risk**: Low. No state machine changes, no protocol changes. Worst-case visual regression is icon overflow on very narrow sidebars — mitigated by `truncate` on the name span and `flex-shrink-0` on the icon group.
