## Why

The Settings panel is unusable on mobile-width viewports. The page content does not render — the form area collapses to `width: 0` and is pushed off-screen.

Root cause (`packages/client/src/components/SettingsPanel.tsx` line ~571): the nav-rail + content wrapper is hard-coded `flex` (flex-row) with no responsive axis switch:

```
<div className="flex-1 flex min-h-0">          ← always flex-row
  <nav className="shrink-0 w-full md:w-56 …">  ← mobile: w-full + shrink-0
  <div data-testid="settings-content" flex-1 …>
```

On a 390 px viewport the `shrink-0 w-full` nav consumes the entire row width; the `flex-1` content panel is squeezed to 0 px and positioned off the right edge. Measured ground truth at 390 px: wrapper `flex-direction: row`, nav width `390`, content `left: 390, width: 0`.

The nav itself is already mobile-aware — `flex md:flex-col`, `overflow-x-auto`, `border-b md:border-b-0 md:border-r` — i.e. the design intends a horizontal scrolling tab-strip on top for mobile and a vertical rail for desktop. Only the parent container's flex direction was never switched, so the intent never takes effect.

## What Changes

- **MODIFIED**: The settings nav-rail + content wrapper SHALL stack vertically on mobile and sit side-by-side on desktop. Concretely, the line ~571 container class changes from `flex-1 flex min-h-0` to `flex-1 flex flex-col md:flex-row min-h-0`. This aligns the parent axis with the already-responsive nav (`flex md:flex-col`, `overflow-x-auto`, `border-b md:border-b-0 md:border-r`) so the nav becomes a full-width horizontal tab strip on top and the content fills the area below; desktop layout (≥ `md`) is unchanged (w-56 rail left, content right).

No new markup, no new dependencies — a single Tailwind class addition that activates the existing responsive intent.

## Capabilities

### Modified Capabilities

- `settings-panel`: adds an explicit responsive-layout requirement to the existing "Settings panel view" capability.

## Impact

- `packages/client/src/components/SettingsPanel.tsx` — one className edit on the nav/content wrapper (~line 571).
- Client-only change. Production rollout: `npm run build` + `POST /api/restart`. Dev mode hot-reloads.

Migration / compatibility / rollback:

- No data, config, or protocol changes — pure CSS/layout.
- Desktop (`md` and up) rendering is byte-identical; only the < `md` breakpoint behaviour changes.
- Rollback = revert the single className; no migration needed.
