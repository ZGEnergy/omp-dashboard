# Proposal: unify-dialog-system

## Why

The dashboard accumulated three generations of dialog code, each layered on the
next without retiring the previous one. The result is visually inconsistent
(three different overlay tints, two confirm-button colors, two container
backgrounds) and behaviourally inconsistent (only some dialogs lock body
scroll, only some respond to `Esc`, click-outside is implemented two
different ways, none trap focus). Three near-identical confirmation dialogs
(`ConfirmDialog`, `JjForgetConfirmDialog`, `JjFoldBackDialog`,
`FlowLaunchDialog`) exist as copy-paste descendants because the shared
primitive is too narrow to extend.

We want a single dialog primitive that owns the cross-cutting concerns
(portal, overlay, scroll-lock, `Esc`, click-outside, focus management,
ARIA) and a thin `Confirm` preset built on top of it, so call sites stop
reimplementing chrome and the look-and-feel converges.

## What Changes

- **Add `Dialog` primitive** in a shared client UI location, exposing
  `<Dialog open onClose title icon size testId>` plus `Dialog.Footer`,
  `Dialog.Cancel`, `Dialog.Action` (with `intent="primary" | "danger" |
  "neutral"`). The primitive owns: portal, overlay, body scroll lock, `Esc`
  to dismiss, click-outside, focus trap + restore, `role="dialog"` /
  `aria-modal` / `aria-labelledby`, and a single z-index policy.
- **Add `Confirm` preset** (`<Confirm open onClose title message
  confirmLabel intent onConfirm />`) implemented on top of `Dialog`, replacing
  the current `ConfirmDialog`.
- **Migrate Era-1 confirmations** to `Confirm`: existing `ConfirmDialog` call
  sites, `JjForgetConfirmDialog`, `JjFoldBackDialog`, `FlowLaunchDialog`'s
  confirm step. Delete the per-dialog copy-paste files.
- **Migrate Era-3 dialogs** (`PackageInstallConfirmDialog`,
  `PackageReadmeDialog`, `QrCodeDialog`) to use the `Dialog` shell —
  they already have most of the right behaviour but reimplement it ad hoc.
- **Migrate Era-2 stepper dialogs** (`BranchSwitchDialog`, `NewChangeDialog`,
  `PinDirectoryDialog`, `SearchableSelectDialog`, `ExploreDialog`,
  `SettingsPanel` modal usages) to the `Dialog` shell, preserving each
  dialog's internal step state.
- **BREAKING (visual):** unify overlay, container background, button
  intents. Era-1 dialogs gain a header and lose the always-red confirm
  button (red is reserved for `intent="danger"`). Era-2 dialogs switch
  from `blue-600` confirm to `accent-primary`.
- **Retire** the standalone `ConfirmDialog.tsx`, `JjForgetConfirmDialog.tsx`,
  `JjFoldBackDialog.tsx` after migration.
- **Keep** `DialogPortal` as the internal building block of the new shell;
  its existing spec (`dialog-portal`) is unchanged.

## Capabilities

### New Capabilities
- `dialog-system`: the unified `Dialog` primitive — portal, overlay,
  scroll-lock, `Esc`, click-outside, focus management, ARIA, z-index policy,
  size variants, header / footer slots, `intent`-based action buttons.
- `confirm-dialog`: the `Confirm` preset built on `dialog-system` —
  title + message + confirm/cancel with `intent`, replacing the current
  `ConfirmDialog`.

### Modified Capabilities
- `dialog-portal`: no requirement changes (already covers portal + scroll
  lock); the new `Dialog` consumes it. Listed here only as a note — no
  delta spec required unless review surfaces one.

## Impact

- **Affected code:**
  - `packages/client/src/components/ConfirmDialog.tsx` (deleted)
  - `packages/client/src/components/Dialog.tsx` (new)
  - `packages/client/src/components/Confirm.tsx` (new)
  - Era-3 dialogs migrated: `PackageInstallConfirmDialog`,
    `PackageReadmeDialog`, `QrCodeDialog`
  - Era-2 dialogs migrated: `BranchSwitchDialog`, `NewChangeDialog`,
    `PinDirectoryDialog`, `SearchableSelectDialog`, `ExploreDialog`
  - Plugin dialogs migrated: `JjForgetConfirmDialog`, `JjFoldBackDialog`,
    `FlowLaunchDialog`
  - Call sites: `SessionList`, `SessionCard`, `SessionHeader`,
    `JjActionBar`, `SessionFlowActions`, `SettingsPanel`,
    `SessionOpenSpecActions`, and any other `ConfirmDialog` user.
- **Cross-package boundary:** plugins (`packages/jj-plugin`,
  `packages/flows-plugin`) currently import dialog markup from their own
  package. The new `Dialog` must live somewhere both `packages/client` and
  the plugins can import from — design.md decides whether that is
  `packages/client/src/components` (plugins import client internals, as
  today) or a new shared UI location.
- **Visual regression:** unifying overlay/container/button styles will
  cause small visual deltas on every existing dialog. No layout changes.
- **A11y improvement:** focus trap + restore + `role="dialog"` /
  `aria-modal` become consistent across all dialogs.
- **No protocol or server changes.** Pure client refactor.

## Open Questions

These are deliberately deferred to `design.md`:

1. **Location of the new primitive.** `packages/client/src/components` (keep
   plugins importing client internals, as today) vs. a new
   `packages/shared/ui` or `packages/client-ui` package.
2. **Visual direction when Era-1 and Era-3 disagree.** Confirm-button color
   (red-by-default vs. accent-by-default), container background
   (`--bg-primary` vs. `--bg-secondary`), overlay tint (`--bg-overlay`
   vs. `bg-black/60`).
3. **A11y scope for v1.** Ship focus-trap + ARIA in the first cut, or land
   the look-and-feel unification first and add focus-trap as a follow-up?
4. **Stacked dialogs.** Does any flow open a dialog from inside a dialog?
   If yes, the z-index policy must be a stack (counter or context); if
   no, a single fixed layer is fine.
5. **Imperative `confirm()` API.** Out of scope for this change, but worth
   noting whether the `Dialog` shape leaves room for a future
   `useDialogs()` hook without rework.
