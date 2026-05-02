## 1. Build the Dialog primitive

- [ ] 1.1 Add `useFocusTrap(ref, open)` hook in `packages/client/src/hooks/useFocusTrap.ts`: stores previous `document.activeElement`, focuses first focusable child on open, traps `Tab`/`Shift+Tab`, restores focus on close.
- [ ] 1.2 Write unit tests for `useFocusTrap` (initial focus, Tab wrap, Shift+Tab wrap, focus restore).
- [ ] 1.3 Add `Dialog.tsx` in `packages/client/src/components/Dialog.tsx` with props `{ open, onClose, title?, icon?, size?, testId?, children, ariaLabel? }` and subcomponents `Dialog.Footer`, `Dialog.Cancel`, `Dialog.Action` (intent: primary | danger | neutral).
- [ ] 1.4 Implement chrome inside `Dialog`: `DialogPortal` wrapper; sibling overlay `<div onClick=onClose data-testid="<id>-overlay" class="fixed inset-0 bg-black/60">`; container with `role="dialog" aria-modal="true" aria-labelledby?` at `z-[60]`, `bg-[var(--bg-primary)]`, `border-[var(--border-primary)]`, size→max-w map (sm/md/lg), `max-h-[80vh] overflow-y-auto`.
- [ ] 1.5 Implement header (only rendered when `title` or `icon` set): icon in accent-tinted square + title `<h3 id={titleId}>`; wire `aria-labelledby` only when title is present.
- [ ] 1.6 Implement Esc key listener (window keydown, removed on unmount/close).
- [ ] 1.7 Implement intent → button class map for `Dialog.Action`: primary=`bg-[var(--accent-primary)]`, danger=`bg-red-600 hover:bg-red-500`, neutral=bordered transparent (matches Cancel).
- [ ] 1.8 Write unit tests for `Dialog`: open/close, Esc, overlay click, container click does not dismiss, ARIA attrs, size classes, header renders/omits, intent classes, testId propagation incl. derived `-overlay`/`-cancel`/`-action`.

## 2. Build the Confirm preset

- [ ] 2.1 Add `Confirm.tsx` in `packages/client/src/components/Confirm.tsx` with props `{ open, onClose, title, message, body?, intent?, confirmLabel?, cancelLabel?, onConfirm, testId? }`.
- [ ] 2.2 Implement `Confirm` as a composition over `Dialog` (size="sm"); render message paragraph, optional `body` node, footer with `Dialog.Cancel` + `Dialog.Action`.
- [ ] 2.3 Wire callbacks: action → `onConfirm` only (no auto-close); cancel/Esc/overlay → `onClose`.
- [ ] 2.4 Defaults: `intent="primary"`, `confirmLabel="Confirm"`, `cancelLabel="Cancel"`.
- [ ] 2.5 Write unit tests for `Confirm`: title/message render, body slot, intent maps to action button class, button wiring per spec, default labels, testId derived ids.

## 3. Migrate Era-1 confirm dialogs

- [ ] 3.1 Replace `ConfirmDialog` usage in `packages/client/src/App.tsx` with `Confirm` (preserve message + destructive intent where applicable).
- [ ] 3.2 Replace `ConfirmDialog` usage in `packages/client/src/components/SessionOpenSpecActions.tsx` (3 sites) — drop the `<DialogPortal>` wrappers (now owned by `Confirm`).
- [ ] 3.3 Replace `ConfirmDialog` usage in `packages/client/src/components/extension-ui/GenericExtensionDialog.tsx`.
- [ ] 3.4 Replace `ConfirmDialog` import + usage in `packages/flows-plugin/src/client/SessionFlowActions.tsx`.
- [ ] 3.5 Migrate `packages/jj-plugin/src/client/JjActionBar.tsx` to use `Confirm` with `body={<ul>…unfolded…</ul>}` and `intent="danger"`. Delete `JjForgetConfirmDialog.tsx` and update `packages/jj-plugin/src/client/index.tsx` exports.
- [ ] 3.6 Migrate `JjFoldBackDialog` callers to `Confirm` (or `Dialog` if richer body needed). Delete `JjFoldBackDialog.tsx` and its `__tests__`/exports.
- [ ] 3.7 Migrate confirm step inside `packages/flows-plugin/src/client/FlowLaunchDialog.tsx` to `Confirm`.
- [ ] 3.8 Update `packages/client/src/components/__tests__/Dialogs.test.tsx` to test `Confirm` instead of `ConfirmDialog`.
- [ ] 3.9 Update `packages/client/src/__tests__/extension-ui-modal.test.tsx` references from `ConfirmDialog` → `Confirm`.
- [ ] 3.10 Update `packages/jj-plugin/src/__tests__/JjFoldBackDialog.test.tsx` (rename if appropriate) to drive `Confirm`-based flow.
- [ ] 3.11 Delete `packages/client/src/components/ConfirmDialog.tsx`. Verify `rg "ConfirmDialog\\b"` returns no source hits outside historical changelog/specs.
- [ ] 3.12 Run `npm test` and `npm run reload:check`; fix fallout.

## 4. Migrate Era-3 dialogs to the Dialog shell

- [ ] 4.1 `PackageInstallConfirmDialog` → re-implement on top of `Dialog` (size sm) with header icon, body table, scope picker, and `Dialog.Footer`. Preserve existing `data-testid="package-install-confirm-dialog"` on the dialog container.
- [ ] 4.2 `PackageReadmeDialog` → use `Dialog` (size lg) with title from package name; body keeps current README markdown rendering.
- [ ] 4.3 `QrCodeDialog` → use `Dialog` (size sm), QR + URL in body.
- [ ] 4.4 Update existing `__tests__/UnifiedPackagesSection.test.tsx`, `Dialogs.test.tsx`, `MobileActionMenu.test.tsx` and any QR test to assert the new chrome (overlay, role, aria-modal) where they currently assert it.

## 5. Migrate Era-2 stepper dialogs

- [ ] 5.1 `BranchSwitchDialog` → wrap each step's content + footer inside one `Dialog` (size sm). Step state machine unchanged. Confirm buttons adopt accent (primary) intent; "Stash & Switch" stays primary.
- [ ] 5.2 `NewChangeDialog` → `Dialog` shell, primary action.
- [ ] 5.3 `PinDirectoryDialog` → `Dialog` shell.
- [ ] 5.4 `SearchableSelectDialog` → `Dialog` shell, preserve search input + list rendering.
- [ ] 5.5 `ExploreDialog` → `Dialog` shell.
- [ ] 5.6 Update each dialog's existing tests in `packages/client/src/components/__tests__/` (`BranchSwitchDialog.test.tsx`, `PinDirectoryDialog.test.tsx`, etc.) to keep passing; assert new ARIA + Esc.

## 6. Cleanup, validation, docs

- [ ] 6.1 Search for any remaining `bg-[var(--bg-overlay)]`, `bg-black/50`, ad-hoc `z-[60]` / `z-50` dialog roots in `packages/client/src/components` and `packages/*/src/client` — verify only the new `Dialog` is responsible for these classes.
- [ ] 6.2 Manual visual sweep: open every migrated dialog in dev mode (light + dark theme, mobile viewport + desktop). Note any layout regressions.
- [ ] 6.3 Run full test suite: `npm test 2>&1 | tee /tmp/pi-test.log` and grep for failures.
- [ ] 6.4 Run `npm run reload:check` to type-check and reload bridges.
- [ ] 6.5 Update `docs/architecture.md` and the AGENTS.md "Client core" file map to list `Dialog.tsx` and `Confirm.tsx` (replacing `ConfirmDialog.tsx`).
- [ ] 6.6 Update `README.md` if it mentions `ConfirmDialog` (unlikely but check).
- [ ] 6.7 Run `openspec validate unify-dialog-system --strict` and confirm clean.
