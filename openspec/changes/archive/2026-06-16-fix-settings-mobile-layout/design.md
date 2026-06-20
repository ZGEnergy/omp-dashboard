# Design: fix-settings-mobile-layout

## Context

The Settings panel renders fine on desktop but is unusable below the Tailwind `md` breakpoint (768 px). The form area is present in the DOM but invisible — collapsed to zero width and pushed off the right edge of the viewport.

Ground-truth measurement at a 390 px viewport (`/settings/general`):

| element | flex-direction | width | left | right |
|---|---|---|---|---|
| nav/content wrapper | `row` | — | — | — |
| `<nav>` rail | — | 390 | 0 | 390 |
| `[data-testid=settings-content]` | — | **0** | **390** | — |

The content panel sits at `x = 390` with `width = 0`: entirely off-screen.

## Root Cause

`packages/client/src/components/SettingsPanel.tsx` (~line 571) renders:

```tsx
<div className="flex-1 flex min-h-0">                              {/* wrapper */}
  <nav className="shrink-0 w-full md:w-56 flex md:flex-col
                  overflow-x-auto border-b md:border-b-0 md:border-r …">
    …nav buttons…
  </nav>
  <div data-testid="settings-content" className="flex-1 overflow-y-auto min-w-0">
    …form…
  </div>
</div>
```

The `<nav>` is already mobile-aware:
- `w-full md:w-56` — full width on mobile, fixed 56-rem-units rail on desktop.
- `flex md:flex-col` — horizontal strip on mobile, vertical list on desktop.
- `overflow-x-auto` — horizontal scroll for the mobile strip.
- `border-b md:border-b-0 md:border-r` — bottom divider on mobile, right divider on desktop.

These classes only make sense if the nav sits **above** the content on mobile. But the **wrapper** is hard-coded `flex` (= `flex-row`) with no responsive modifier. So on mobile the `shrink-0 w-full` nav takes the entire row width and the `flex-1` content is squeezed to `0`. The nav's mobile intent was authored; the parent axis switch to enable it was never added.

## Decision

Add a single responsive axis switch to the wrapper:

```diff
- <div className="flex-1 flex min-h-0">
+ <div className="flex-1 flex flex-col md:flex-row min-h-0">
```

- **Mobile (`< md`)** → `flex-col`: nav (full-width horizontal strip, `border-b`, `overflow-x-auto`) stacks on top; content fills the remaining height below with full width.
- **Desktop (`≥ md`)** → `md:flex-row`: identical to today — `w-56` rail left, content right.

## Alternatives Considered

1. **Restructure the nav into a separate mobile component / dropdown.** Rejected — adds markup and a second code path for no benefit; the existing responsive classes already encode the correct mobile design. The bug is purely the missing parent axis switch.
2. **Make the nav `shrink` on mobile instead of `w-full`.** Rejected — would keep nav and content side-by-side on a 390 px screen, cramming both into a too-narrow row. Stacking is the intended and correct mobile UX (matches the `border-b` / `overflow-x-auto` already present).
3. **Hide the nav behind a hamburger on mobile.** Rejected — larger scope, new state, new interaction. Out of proportion to a layout-direction bug; can be a future enhancement if the horizontal strip proves cramped.

## Risks & Rollback

- **Risk**: none to desktop — `md:flex-row` reproduces the current `flex` (row) behaviour exactly at ≥ `md`. The only behavioural delta is below `md`, which is currently broken.
- **Compatibility**: no data, config, protocol, or API changes. Pure CSS class.
- **Rollback**: revert the single className. No migration, no state to unwind.

## Verification

- Browser at 390 px: wrapper `flex-direction: column`, content `width > 0` and within viewport, nav is a scrollable top strip.
- Browser at ≥ 768 px: nav is the `w-56` left rail, content fills the right — unchanged from today.
- Content-heavy page (Developer/Providers) scrolls within the content area; fixed header stays put.
