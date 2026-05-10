## Why

The honcho per-session-card actions today open as **tiny anchored popovers**:

- `[🧠 Interview]` opens a 208 px-wide absolutely-positioned div above the button with one input + Save.
- `[🏷️ Map name]` opens through the `anchored-popover` slot — same idea, anchored to the button.

This worked while the cards were the only honcho surface, but in practice:

- The popovers get clipped by the session-card's `overflow-hidden`, by the parent column's scroll container, and on mobile by the viewport edge.
- The "Interview" input is a single 10 px line — too small to write the kind of preference users actually want to save (multi-line context, paragraph-length notes).
- Map-name input has no room for inline help (current value, derived default, or a "Clear mapping" affordance) without resizing the popover.
- Stacking is fragile: the chat dropdown, the autocomplete tooltip, and the popovers all fight over `z-index` because they share the same anchor parent.

Every other action surface in the dashboard that takes user input (PinDirectory, BranchSwitch, GroupedAttach, PackageInstallConfirm, QrCode, …) uses `DialogPortal` — a portal-rendered, scroll-locked, backdrop-blocking dialog centered on desktop and full-screen on mobile. The honcho card actions are the only outliers.

## What Changes

- Replace both card-action surfaces with a single shared dialog component rendered through `DialogPortal`:
  - `[🧠 Interview]` → opens **HonchoInterviewDialog** (centered on desktop, full-screen on mobile). Multi-line `<textarea>` for the preference, Save / Cancel buttons, busy spinner, success toast on close.
  - `[🏷️ Map name]` → opens **HonchoMapNameDialog** (same chrome). Single text field pre-filled with `hosts.pi.sessions[cwd]` or the derived default; Save / Clear / Cancel buttons.
- Drop the `anchored-popover` slot claim from the plugin manifest. The map-name button no longer needs slot infrastructure — it manages its own dialog locally like every other card-scoped dialog (`BranchSwitchDialog`, `PinDirectoryDialog`).
- Remove the inline absolutely-positioned popover JSX from `HonchoCardActions.tsx`. The component keeps its three icon-buttons; clicking any of the two input-bearing buttons toggles a local `useState` that mounts/unmounts the corresponding `DialogPortal` child.
- Sync (`[🔄 Sync]`) stays a direct fire-and-forget action — no dialog, no input, just the existing `triggerSync()` call with a busy spinner on the icon.
- One dialog open at a time **per card** is no longer a slot-system constraint; it is enforced by local state (mounting one dialog at a time) and by `DialogPortal`'s scroll-lock behaviour (clicking another card's action button while a dialog is open is impossible because the backdrop captures clicks).
- All existing REST endpoints, status broadcasts, and `~/.honcho/config.json` round-tripping are unchanged. Only the client-side rendering changes.

## Capabilities

### Modified Capabilities

- `honcho-memory-plugin`: the "Per-card Map name popover" requirement is rewritten as a "Per-card Map name dialog" requirement; the "Interview submission" scenario is rewritten to specify a dialog with a multi-line textarea instead of a popover with a single-line input; the slot-claims requirement no longer references `anchored-popover`.

### New Capabilities

- _None._ This is a UI rework on top of the existing plugin server and slot infrastructure.

## Impact

- **Manifest churn**: `packages/honcho-plugin/package.json` drops the `anchored-popover` claim. Plugin manifest discoverability test updated.
- **Component churn**: `HonchoCardActions.tsx` (≈110 lines) loses its inline popover JSX (≈30 lines) and gains two `<DialogPortal>` mounts. `HonchoMapPopover.tsx` is deleted (replaced by `HonchoMapNameDialog.tsx`). New `HonchoInterviewDialog.tsx`.
- **No server changes.** All REST routes (`POST /api/plugins/honcho/interview`, `POST /api/plugins/honcho/sessions`, `DELETE /api/plugins/honcho/sessions`) keep the same wire contract.
- **Behavioural change visible to users**: clicking Interview or Map-name now produces a centered modal with a backdrop and Esc-to-close, instead of an anchored popover that disappears on outside click. This matches every other dashboard dialog.
- **Accessibility**: the dialog gets focus-trap, `aria-modal`, Esc-to-close, and a visible close button — improvements over the popovers, which had none of those.
- **Mobile**: the dialog goes full-screen on small viewports, eliminating the viewport-clipping problem that motivated this change.
- **Tests touched**: existing unit tests for `HonchoCardActions` updated to assert the dialog mounts (instead of the inline popover); `manifest-discoverability.test.ts` updated to assert `anchored-popover` is no longer claimed.
