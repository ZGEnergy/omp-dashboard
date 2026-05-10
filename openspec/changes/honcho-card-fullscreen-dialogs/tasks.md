## 1. Shared DialogPortal availability

- [ ] 1.1 Confirm whether `DialogPortal` is already re-exported from `@blackbelt-technology/pi-dashboard-shared`. If not, add a `export { DialogPortal } from "..."` line to the shared package's client barrel.
- [ ] 1.2 Add a unit test in `packages/honcho-plugin/src/__tests__/` asserting the import from the shared package resolves at typecheck time (TypeScript reference test — `import type { ComponentType } from "react"; import { DialogPortal } from "@blackbelt-technology/pi-dashboard-shared/client"` — verifies the symbol exists).

## 2. New dialog components

- [ ] 2.1 Create `packages/honcho-plugin/src/client/HonchoInterviewDialog.tsx`:
  - Props: `{ open: boolean; onClose: () => void }`
  - Renders inside `<DialogPortal open={open} onClose={onClose}>` when open
  - Header: "Save a memory preference"
  - Body: `<textarea rows={6}>` with placeholder "Save a preference, fact, or context for Honcho to remember…", min-height 120 px, vertical resize, max-height 50 vh
  - Footer: `Cancel` | `Save` (Save disabled when input is empty/whitespace-only or busy)
  - On Save: `POST /api/plugins/honcho/interview { content }`, show busy spinner on button, on success clear textarea and call `onClose()`, on failure surface inline error below the textarea
  - Esc / backdrop / Cancel close without writing
- [ ] 2.2 Create `packages/honcho-plugin/src/client/HonchoMapNameDialog.tsx`:
  - Props: `{ open: boolean; onClose: () => void; cwd: string }`
  - On mount, fetch `GET /api/plugins/honcho/config` and resolve `hosts.pi.sessions[cwd]` (existing mapping) and the derived default (per `sessionStrategy`) — use the existing `api.ts` helper if present, else add one
  - Header: "Map Honcho session name"
  - Body: `<input type="text">` pre-filled with the existing mapping (or the derived default if none); helper text below shows whichever value was *not* used to pre-fill (e.g. "Default would be: my-project")
  - Footer: `Cancel` | `Clear mapping` (visible only when an existing mapping exists) | `Save` (disabled when input matches existing mapping or is empty)
  - On Save: `POST /api/plugins/honcho/sessions { cwd, name }`, busy spinner on button, on success call `onClose()`
  - On Clear: `DELETE /api/plugins/honcho/sessions { cwd }`, busy spinner on button, on success call `onClose()`
  - Esc / backdrop / Cancel close without writing

## 3. Wire dialogs into `HonchoCardActions`

- [ ] 3.1 Remove the inline absolutely-positioned popover `<div>` from `HonchoCardActions.tsx` (the block under `{interviewOpen && (...)}`)
- [ ] 3.2 Replace the local `interviewText` / `interviewBusy` / `handleInterview` state and handlers with a single `interviewOpen` boolean
- [ ] 3.3 Replace the existing `[🧠 Interview]` `onClick` (which toggled the inline popover) with `() => setInterviewOpen(true)`
- [ ] 3.4 Replace the existing `[🏷️ Map name]` `onClick` (which currently calls `onOpenPopover(`honcho-map-${sessionId}`)`) with `() => setMapOpen(true)` and remove the `onOpenPopover` prop and the `sessionId`-based anchor scheme entirely
- [ ] 3.5 Mount `<HonchoInterviewDialog open={interviewOpen} onClose={() => setInterviewOpen(false)} />` and `<HonchoMapNameDialog open={mapOpen} onClose={() => setMapOpen(false)} cwd={cwd!} />` at the bottom of the component's return
- [ ] 3.6 Verify Sync's button + handler are unchanged (no dialog for Sync)
- [ ] 3.7 Update `HonchoCardActions`'s prop signature: drop `onOpenPopover` and `sessionId`; keep `cwd`

## 4. Manifest cleanup

- [ ] 4.1 Edit `packages/honcho-plugin/package.json` `pi-dashboard-plugin.claims[]`: remove the entry whose `slot === "anchored-popover"` and whose component points at `HonchoMapPopover`
- [ ] 4.2 Verify the remaining claims are exactly: `settings-section` (one entry, tab=general), `session-card-memory` (two entries — `HonchoBadge` and `HonchoCardActions`)
- [ ] 4.3 Delete `packages/honcho-plugin/src/client/HonchoMapPopover.tsx`
- [ ] 4.4 Remove the `HonchoMapPopover` re-export from `packages/honcho-plugin/src/client/index.tsx`
- [ ] 4.5 Update the slot-routing comment at the top of `index.tsx` to reflect the new claim list (no `anchored-popover` line)

## 5. Tests

- [ ] 5.1 Update `packages/honcho-plugin/src/__tests__/manifest-discoverability.test.ts`:
  - Add an assertion that the manifest's `claims[]` does NOT contain a `slot === "anchored-popover"` entry
  - Add an assertion that exactly three claims exist (settings-section + two session-card-memory)
- [ ] 5.2 Add `packages/honcho-plugin/src/client/__tests__/HonchoInterviewDialog.test.tsx`:
  - Mount with `open=true`, assert dialog is rendered in a portal under `document.body`
  - Type into textarea, click Save, assert `POST /api/plugins/honcho/interview` was called with the expected body
  - Click Cancel, assert `onClose` was called and no POST was issued
  - Press Esc, assert `onClose` was called
- [ ] 5.3 Add `packages/honcho-plugin/src/client/__tests__/HonchoMapNameDialog.test.tsx`:
  - Mount with an existing mapping, assert the input is pre-filled with the mapping value
  - Mount without a mapping, assert the input is pre-filled with the derived default and the "Clear mapping" button is hidden
  - Type a new name, click Save, assert `POST /api/plugins/honcho/sessions` was called with `{ cwd, name }`
  - With an existing mapping, click Clear, assert `DELETE /api/plugins/honcho/sessions` was called with `{ cwd }`
- [ ] 5.4 Update `HonchoCardActions` test (if one exists; else add one): assert clicking `[🧠 Interview]` mounts a dialog in a portal (not an inline popover) and that the dialog's textarea is rendered
- [ ] 5.5 Confirm no test still references `HonchoMapPopover` or the `anchored-popover` slot id; remove any leftover assertions

## 6. Documentation

- [ ] 6.1 Update the README in `packages/honcho-plugin/` to describe the dialogs (replace any "popover" wording)
- [ ] 6.2 Add a note in `CHANGELOG.md` under the next release: "v0.4.0 — Card actions render as portal dialogs; `anchored-popover` slot claim removed"
- [ ] 6.3 Update the row in `docs/file-index-plugins.md` for `packages/honcho-plugin/src/client/` if it enumerates the popover/dialog components (delegate the docs write to a general-purpose subagent per the `AGENTS.md` documentation-update protocol; pass the caveman-style rule verbatim)

## 7. Release

- [ ] 7.1 Bump `packages/honcho-plugin/package.json` version to `0.4.0`
- [ ] 7.2 Run the full repo test suite (`npm test`) and verify zero new failures
- [ ] 7.3 Run `npm run build` to confirm production client bundle still compiles
- [ ] 7.4 Tag and publish `pi-memory-honcho-dashboard@0.4.0` (handled by the workspace publish flow)
