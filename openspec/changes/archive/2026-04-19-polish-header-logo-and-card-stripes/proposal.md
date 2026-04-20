## Why

A batch of related visual-polish gaps in the dashboard chrome:

1. **Header logo is a plain text `π` character** in both `SessionList.tsx` (the desktop sidebar header actually rendered) and `SessionSidebar.tsx` (the mobile/alternate sidebar). Rendered by the system font, it looks nothing like the app icon (a bold geometric Π used in the PWA manifest, Electron tray, favicons, and marketing site). The brand mark in the dashboard chrome should *be* the brand mark, and it must work cleanly in both light and dark themes (no opaque dark square background bleeding through a light-mode header).
2. **Streaming/resuming session cards use a slow background-color blink** (`card-working-pulse` in `index.css`). It's gentle but reads as "alive," not as "working." A drifting 45° barber-pole stripe pattern is the established UI idiom for ongoing background work and would make activity unambiguous at a glance — *without* losing the breathing pulse, which signals liveness.
3. **Pin-folder button is icon-only and cryptic** (`📌+` in the sidebar filter row). Users don't recognize it as the entry point for adding a folder to the sidebar. A short text label removes ambiguity.
4. **Vite `publicDir` was misconfigured** (`packages/client/vite.config.ts: "../../public"` resolves to non-existent `packages/public/`). Static assets (icons, manifest, service worker) were silently never copied into the served `dist/`. Discovered while wiring up the new logo — the fix incidentally restores PWA installability.

All changes are contained to the client; no protocol or server changes.

## What Changes

- **Header logo → inline SVG `PiLogo` component** (revised from PNG `<img>` after light-theme review):
  - New `packages/client/src/components/PiLogo.tsx` renders a bold geometric Π as inline SVG with `fill="currentColor"`, fully transparent background.
  - Replaces the literal `π` text in **both** `SessionList.tsx` (desktop header) and `SessionSidebar.tsx` (alternate sidebar). The wrapping `<button>` keeps `title="Home"`, click-to-home navigation, and `text-blue-500 hover:text-blue-400 transition-colors` so the mark inherits the theme color.
  - Earlier intermediate iteration used `<img src="/icon-192.png">`; abandoned because the PNG ships with an opaque dark navy background that clashed with the light theme.
- **Vite `publicDir` fix**: `packages/client/vite.config.ts` updated from `"../../public"` to `"../../../public"` so the project-root `public/` directory (icon-192.png, icon-512.png, manifest.json, sw.js) is actually copied into `packages/client/dist/`. Restores PWA installability as a side-effect.
- **Card "working" animation — layered stripes + breathing pulse**: In `packages/client/src/index.css`, extend `.card-working-pulse` with two background layers and two independent animations:
  - **Layer 1 (top)**: `repeating-linear-gradient(45deg, transparent 0 10px, rgba(234,179,8,0.10) 10px 20px)` with `background-size: 28.2843px 28.2843px` (= one full diagonal period of `20√2 px`) so the gradient tiles seamlessly.
  - **Layer 2 (bottom)**: a flat amber tint that breathes via opacity (`0.6 → 1 → 0.6`, ease-in-out, 3s).
  - **Stripe scroll**: `background-position` animates from `0px 0` to `113.1371px 0` (= 4 full periods) over 3s linear. **Critical detail**: motion is purely horizontal (`Δx, 0`), not diagonal `(Δx, Δx)` — because translation along `(+1, +1)` IS along the stripe direction (CSS `linear-gradient(45deg, …)` stripes run on the (1,1) diagonal), which is pattern-invariant and produces zero perceived motion. Horizontal scroll cuts *across* the stripes for visible drift.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce) { .card-working-pulse { animation: none; } }` disables both animations but **keeps the static striped tint** so the streaming state is still visually distinguishable without movement.
- **`ask_user` purple pulse stays as-is**: The existing `card-input-pulse` keeps pure breathing (no stripes), giving a meaningful visual contrast — *stripes = machine working; pulse-only = waiting on you*.
- **Pin-folder button label**: In `SessionList.tsx`, the icon-only pin button (next to Active-only / Show hidden filters) becomes `📌 Add folder` with tooltip `"Pin a folder to the sidebar"`. `mdiPlus` icon dropped (label conveys the action), button now `inline-flex` with a 4px gap.

## Capabilities

### New Capabilities

- `pi-logo-component`: Reusable inline-SVG brand-mark React component (`PiLogo`) used wherever the dashboard chrome needs the brand mark. Themeable via `currentColor`, no raster/background-color baggage.

### Modified Capabilities

- `session-sidebar`: Header brand element renders the inline `PiLogo` SVG instead of a text glyph or raster `<img>`; transparent in any theme; inherits text color.
- `session-card-status`: Streaming/resuming cards show **horizontally drifting** 45° amber stripes layered with the existing breathing pulse; reduced-motion fallback shows a static striped tint.
- `session-list-filters`: Pin-folder action gains an explicit `"Add folder"` text label next to the pin icon.
- `client-build-config`: Vite `publicDir` resolves correctly so PWA / favicon / service-worker assets land in `dist/`.

## Impact

- **New files**: `packages/client/src/components/PiLogo.tsx` (inline-SVG brand-mark component, ~30 lines).
- **Client components**: `SessionList.tsx` and `SessionSidebar.tsx` (header `<button>` content + `PiLogo` import); `SessionList.tsx` pin-folder button (label + flex layout).
- **Client styles**: `packages/client/src/index.css` (`.card-working-pulse` class + new `card-working-stripes-scroll` / `card-working-opacity-pulse` keyframes + `prefers-reduced-motion` block).
- **Build config**: `packages/client/vite.config.ts` (`publicDir` path fix).
- **Tests**: `SessionSidebar.test.tsx` and `routing.test.tsx` updated to assert the inline SVG (`svg[aria-label='Pi Dashboard']`) instead of `<img>`. Existing `SessionCard.test.tsx` class-name assertions still pass unchanged.
- **No protocol changes, no server changes, no extension changes.**
- **Assets**: No new files; the existing `public/icon-192.png` / `icon-512.png` / `manifest.json` / `sw.js` are now correctly bundled into `dist/` thanks to the Vite fix (they were silently 404'ing in production before).
