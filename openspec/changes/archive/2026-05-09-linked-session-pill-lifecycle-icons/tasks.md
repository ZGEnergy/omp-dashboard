## 1. Component props + render

- [x] 1.1 Add three optional callbacks to `FolderOpenSpecSection`'s `Props` interface in `packages/client/src/components/FolderOpenSpecSection.tsx`:
  - `onHideSession?: (id: string) => void`
  - `onUnhideSession?: (id: string) => void`
  - `onResumeSession?: (id: string, mode: "continue" | "fork") => void`
- [x] 1.2 Destructure the three new props in the component signature alongside the existing `onNavigateToSession`.
- [x] 1.3 Refactor the linked-session pill (currently a single `<button>` at ~L249–262) into a `<div className="flex items-center gap-1 ...">` containing:
  - A name `<button>` with `flex-1 min-w-0 truncate text-left` that calls `onNavigateToSession?.(s.id)` (same behaviour as today).
  - A trailing icon group `<div className="flex gap-0.5 flex-shrink-0">` rendering icon buttons per §1.4.
- [x] 1.4 Render icon buttons matching SessionCard's visibility logic (import icons already used by SessionCard so the bundle does not grow):
  - **Hide/unhide** (always rendered when corresponding callback is provided): `mdiEyeOffOutline` when not hidden → calls `onHideSession?.(s.id)`; `mdiEyeOutline` when `s.isHidden` → calls `onUnhideSession?.(s.id)`. `title="Hide session"` / `"Show session"`.
  - **Resume** (rendered when `onResumeSession` is provided AND `(!isAlive(s) || s.isHidden) && s.sessionFile`): `mdiPlayCircleOutline`. Calls `onResumeSession(s.id, "continue")`. `title="Resume session"`.
  - **Fork** (rendered when `onResumeSession` is provided AND `s.sessionFile`): `mdiSourceFork`. Calls `onResumeSession(s.id, "fork")`. `title="Fork session"`.
  - Reuse SessionCard's `isAlive` predicate (export it if not already exported, otherwise inline the same condition).
- [x] 1.5 Every icon button: `Icon size={0.4}`, `p-0.5`, `flex-shrink-0`, `text-[var(--text-tertiary)] hover:text-...` matching SessionCard's hover colour conventions (muted for hide, green for unhide/resume, blue for fork).
- [x] 1.6 Every icon button's onClick: `(e) => { e.stopPropagation(); <handler>; }` to prevent the row-body jump from firing.

## 2. Wire-up at the call site

- [x] 2.1 In `packages/client/src/components/SessionList.tsx` (~L495), pass the three new props to `<FolderOpenSpecSection ... />`:
  - `onHideSession={handleHide}` (already declared at ~L285)
  - `onUnhideSession={handleUnhide}` (already declared at ~L302)
  - `onResumeSession={onResume}` (already in `Props`)
- [x] 2.2 No changes to `SessionList`'s own `Props` — all three handlers already arrive from upstream.

## 3. Tests

- [x] 3.1 Extend `packages/client/src/components/__tests__/FolderOpenSpecSection.test.tsx`:
  - Render a change with one linked session that is alive and not hidden → assert hide icon visible, unhide icon absent, resume icon absent (alive), fork icon visible.
  - Render with one linked session that is `isHidden: true` → assert unhide icon visible, hide icon absent, resume icon visible (hidden ⇒ resumable).
  - Render with one linked session where `isAlive` is false (and `sessionFile` present) → assert resume icon visible.
  - Render with a session lacking `sessionFile` → assert resume and fork icons absent.
  - Click each icon → assert the matching callback fires with the right args (`onHideSession(id)`, `onUnhideSession(id)`, `onResumeSession(id, "continue")`, `onResumeSession(id, "fork")`).
  - Click each icon → assert `onNavigateToSession` is NOT called (verifies `e.stopPropagation()`).
  - Click the name region → assert `onNavigateToSession(id)` is called (verifies the row body remains the jump target).

## 4. Visual sanity

- [x] 4.1 Manual: open the sidebar in a workspace with at least one attached proposal that has 1+ live and 1+ hidden sessions. Verify icon spacing on a narrow viewport (~280px sidebar) — name should `truncate`, icons should never wrap to a new line. If overflow occurs, reduce `gap-1` between name and icon group to `gap-0.5`, or shrink icon `size` from `0.4` to `0.35`.
- [x] 4.2 Verify dark theme contrast on hover colours; adjust hover Tailwind classes only if visibly broken.

## 5. No backend / protocol changes

- [x] 5.1 Confirm by inspection: no edits required under `packages/server/`, `packages/extension/`, or `packages/shared/`. All three actions (hide, unhide, resume) already round-trip via existing browser-protocol messages used by SessionCard.
