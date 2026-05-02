## Context

The dashboard's React client has accumulated three generations of dialog code
(see `proposal.md`):

- **Era 1** — `ConfirmDialog`: minimal, no portal, no scroll-lock, no `Esc`,
  always-red confirm button. Cloned by `JjForgetConfirmDialog`,
  `JjFoldBackDialog`, and `FlowLaunchDialog`'s confirm step.
- **Era 2** — Bespoke stepper dialogs (`BranchSwitchDialog`,
  `NewChangeDialog`, `PinDirectoryDialog`, `SearchableSelectDialog`,
  `ExploreDialog`): use `DialogPortal`, but `bg-black/50` overlay, blue
  confirm button, no `Esc`, internal multi-step state.
- **Era 3** — "Modern" dialogs (`PackageInstallConfirmDialog`,
  `PackageReadmeDialog`, `QrCodeDialog`): use `DialogPortal`, `bg-black/60`
  overlay, `Esc` handler, accent-coloured confirm.

`DialogPortal` (existing, spec: `dialog-portal`) already owns the portal +
body scroll lock. None of the eras own focus management or ARIA. Plugins
(`packages/jj-plugin`, `packages/flows-plugin`) currently import
`ConfirmDialog` from `packages/client` directly via relative path —
that import boundary already exists and is not being introduced by this
change.

## Goals / Non-Goals

**Goals:**

- Single `Dialog` primitive that owns: portal (via `DialogPortal`),
  overlay, `Esc`, click-outside, focus trap + restore, `role="dialog" /
  aria-modal / aria-labelledby`, size variants, header (title + optional
  icon), footer slot, and a single z-index policy.
- Single `Confirm` preset built on `Dialog` for the common
  title-message-confirm-cancel shape, with `intent="primary" | "danger" |
  "neutral"` controlling the action button colour.
- Migrate every existing dialog to `Dialog` (or `Confirm` where
  applicable). Delete the copy-paste `ConfirmDialog`,
  `JjForgetConfirmDialog`, `JjFoldBackDialog`.
- Consistent visual: one overlay tint, one container background, one
  default action colour, one set of `intent`-driven action colours.
- Consistent a11y in v1: focus trap, focus restore, ARIA roles.

**Non-Goals:**

- Imperative API (`useDialogs()` / `confirm()` returning a Promise). The
  declarative `Dialog` API leaves room for a future wrapper, but the
  wrapper itself is out of scope.
- Changing `DialogPortal`'s spec or behaviour. The new shell *uses* it.
- Server, protocol, or extension changes. Pure client refactor.
- Adopting Radix / shadcn. We build the primitive ourselves to avoid a
  new dependency and keep visual control.
- Dialog animations / transitions. The current code has none; we don't
  add any.
- Toasts, popovers, sheets, drawers, command palettes. Only modal
  dialogs.

## Decisions

### D1. Location: `packages/client/src/components/Dialog.tsx`

The primitive lives next to `DialogPortal` in `packages/client`. Plugins
(`packages/jj-plugin`, `packages/flows-plugin`) import via the relative
path they already use today.

**Alternatives considered:**

- *New `packages/client-ui` shared package.* Cleaner boundary, but pulls in
  build/test/publish overhead for one or two components and forces every
  plugin's package.json to gain a new workspace dependency. Not worth it
  for v1.
- *`packages/shared/ui`.* `packages/shared` is currently
  framework-agnostic (protocol, types, platform helpers); adding React
  components muddles its purpose.

We can lift to a shared package later if a third UI consumer appears.

### D2. Visual baseline: Era-3 wins

Container background: `--bg-primary`. Overlay: `bg-black/60`. Default
confirm button: `accent-primary`. Header has an optional `icon` slot
(mdi path) rendered in an accent-tinted square.

**Intent → action button colour:**

| `intent`   | Background                           | Use case               |
|------------|--------------------------------------|------------------------|
| `primary`  | `var(--accent-primary)` (default)    | Install, Save, Switch  |
| `danger`   | `red-600` (hover `red-500`)          | Delete, Forget, Reset  |
| `neutral`  | transparent + border (same as Cancel) | Secondary action       |

**Migration consequence:** Era-1 confirms that were always-red become
`intent="danger"` only when truly destructive. Some Era-1 confirms (e.g.
"Archive change?") will move to `intent="primary"` and lose their red
button — this is intentional and matches their semantics.

**Alternatives considered:**

- *Era-1 wins (always red).* Loud, semantically wrong for non-destructive
  actions, and disagrees with Era-3 dialogs that the team has been
  building lately.
- *Era-2 wins (blue-600).* Doesn't use the theme accent variable; would
  diverge from the rest of the app.

### D3. z-index: single fixed layer at `z-[60]`, no stacking counter

`DialogPortal` renders at body level, so dialogs always layer above
in-page content. We pick `z-[60]` (matches the existing `ConfirmDialog`
and is above the `MobileOverlay` at `z-50`, as already required by the
`dialog-portal` spec).

No active flow opens a dialog from inside a dialog (verified by reading
all current dialog components — none mount another dialog inside their
JSX). If that need arises later we can introduce a stacking counter via
context; the API does not have to change to support it.

**Alternatives considered:**

- *Stacking counter from day one.* Premature; pays complexity cost for a
  feature nothing currently needs.

### D4. A11y in v1: focus trap + ARIA, no animations

The new `Dialog`:

- Sets `role="dialog"` and `aria-modal="true"`.
- Sets `aria-labelledby` to a generated id pointing to the title element
  (when `title` is given).
- On open: stores `document.activeElement`, focuses the first focusable
  element inside the dialog (or the dialog container itself if none).
- Traps `Tab` / `Shift+Tab` within the dialog.
- On close: restores focus to the previously-active element.
- `Esc` calls `onClose`.

This is implemented with a small `useFocusTrap(ref, open)` hook — no new
dependency. Tested with Testing Library + jsdom.

**Alternatives considered:**

- *Defer a11y to a follow-up.* Cheap to do now; deferring leaves the
  primitive incomplete and means callers might design around the gap.
- *`focus-trap-react`.* External dep, ~6 KB, more configurable than we
  need.

### D5. Click-outside: single mechanism

The overlay is a sibling element with its own `onClick={onClose}` handler
(Era-1 pattern). The dialog container stops propagation. This avoids the
`target === currentTarget` pattern (Era-2/3) which is fragile when
content shifts and breaks if children call `stopPropagation`.

### D6. Size variants

`size="sm" | "md" | "lg"` maps to `max-w-sm | max-w-md | max-w-lg` plus
`max-h-[80vh]` overflow. Default `md`. `Confirm` defaults to `sm`.

### D7. `Confirm` preset shape

```tsx
<Confirm
  open
  onClose={close}
  intent="danger"            // primary (default) | danger | neutral
  title="Forget workspace?"
  message="This will lose 3 commits."
  confirmLabel="Forget"      // defaults to intent verb: "Confirm"/"Delete"/"OK"
  onConfirm={force}
  testId="jj-forget"
  body={null}                // optional ReactNode for richer content (e.g. file list)
/>
```

`body` lets callers render a list / extra paragraph above the buttons
without needing to drop down to raw `Dialog`. Used by
`JjForgetConfirmDialog` (the unfolded-commits list) and
`PackageInstallConfirmDialog` (the metadata table + scope picker).

### D8. Migration order

Era 1 → Era 3 → Era 2.

1. **Era 1 first** because it is the highest-leverage retirement — three
   dialogs and many call sites collapse into `Confirm`.
2. **Era 3 next** because they are nearly the new design already; the
   migration is mostly chrome replacement.
3. **Era 2 last** because each has internal step state and needs more
   careful per-step layout work; we do these once the primitive has
   shaken out.

Each migration is a small, independently-testable PR. The old
`ConfirmDialog` stays in place until all its callers are migrated, then
is deleted in a single cleanup commit.

### D9. Existing `dialog-portal` spec is unchanged

The new `Dialog` consumes `DialogPortal` as-is. Body scroll lock and
"escape stacking contexts" requirements continue to live in the
`dialog-portal` capability. `dialog-system` covers everything *above*
the portal.

## Risks / Trade-offs

- **[Visual regression on every dialog]** → All current dialog tests
  assert on text/behaviour, not pixel layout, so they should keep
  passing. We add a small migration-acceptance test per migrated dialog
  asserting the new chrome (overlay class, confirm button colour class,
  ARIA role) is present. Manual visual sweep noted in tasks.

- **[Plugin import boundary]** → Plugins keep importing client internals
  via relative path, as today. No new boundary is introduced; if a
  future change extracts a shared UI package, plugins migrate then. Not
  blocking.

- **[Focus-trap edge cases in jsdom]** → `useFocusTrap` is the most
  likely source of test flakiness (jsdom focus is quirky). Mitigation:
  the hook is feature-detected at call time and a passing `data-focus-trap`
  attribute is added so tests can assert structure rather than live
  focus. Live-focus assertions are limited to one happy-path test.

- **[Era-2 stepper dialogs are deeper migrations]** → `BranchSwitchDialog`
  has six internal steps, each with its own footer. We migrate by
  wrapping the whole step machine in a single `Dialog` and rendering
  per-step content + footer inline; no API change to the dialog itself.
  If a step needs to be its own sub-dialog we use `body` with custom
  footer rather than nesting `Dialog`s.

- **[Test scope explosion]** → Migrating ~10 dialogs could balloon the
  task list. Mitigation: tests-per-dialog stay focused on (1) the
  content the dialog renders and (2) `onConfirm` / `onCancel` wiring.
  Cross-cutting behaviour (Esc, focus trap, scroll lock, ARIA) is tested
  once on `Dialog` itself and not retested per consumer.

- **[Behavioural regression: Era-1 callers gain `Esc`-to-cancel]** →
  Today Era-1 dialogs do not respond to `Esc`. Adding `Esc` is a
  behaviour change. Reviewed: every current Era-1 caller treats cancel
  as safe (it just closes). No caller relies on `Esc` doing nothing.

## Migration Plan

This is a client-only refactor. No deploy / rollback machinery beyond
the usual `npm run build` + `/api/restart`.

1. Add `Dialog` + `Confirm` (D1, D2, D4-D7) with full unit tests. Old
   dialogs untouched.
2. Migrate Era-1 callers + delete `ConfirmDialog`,
   `JjForgetConfirmDialog`, `JjFoldBackDialog`,
   `FlowLaunchDialog`'s confirm step.
3. Migrate Era-3 (`PackageInstallConfirmDialog`, `PackageReadmeDialog`,
   `QrCodeDialog`) to use `Dialog` shell.
4. Migrate Era-2 (`BranchSwitchDialog`, `NewChangeDialog`,
   `PinDirectoryDialog`, `SearchableSelectDialog`, `ExploreDialog`).
5. Manual visual sweep across every migrated dialog (mobile + desktop,
   light + dark theme).
6. Update docs/architecture.md "client core" section with the new
   primitive.

Rollback: each step is a self-contained commit; revert the offending
commit and restart. The old `ConfirmDialog` only disappears at the end
of step 2, so steps 1-2 can ship independently.

## Open Questions

None blocking implementation. All questions raised in `proposal.md` are
resolved above:

- D1 resolves "where does the primitive live?"
- D2 resolves "Era-1 vs Era-3 visual direction".
- D4 resolves "a11y scope for v1".
- D3 resolves "stacked dialogs".
- Non-Goals resolve "imperative API".
