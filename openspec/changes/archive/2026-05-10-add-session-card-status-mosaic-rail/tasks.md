# Tasks

## 1. Asset

- [x] 1.1 Initially created `public/session-rail-mosaic.svg`; **removed** after user feedback chose a solid (non-mosaic), more transparent rail. Asset is no longer needed.

## 2. Helper

- [x] 2.1 Extend `packages/client/src/lib/session-status-visuals.ts` with `deriveRailBgColor(session, flags, isSelected): string`. Class strings written as literals so Tailwind JIT picks them up.
- [x] 2.2 Mirror precedence rules of `deriveDotColorWithFlags` so dot + icon + rail always agree (resuming > hasError > isRetrying > status).
- [x] 2.3 Unit tests in `packages/client/src/lib/__tests__/session-status-visuals.test.ts` cover each status × `isSelected` × flag combination + precedence.

## 3. SessionCard wiring

- [x] 3.1 In `packages/client/src/components/SessionCard.tsx`, derive `railBgClass = deriveRailBgColor(...)` and render an absolutely-positioned `<span aria-hidden>` background layer with the SVG `mask-image`, leaving the source icon unmasked above it. (Mask had to move off the container to a separate layer or the icon would also be carved by the mosaic.)
- [x] 3.2 Wrapped the source `<Icon>` in a `bg-[var(--bg-surface)]/80 rounded-sm relative z-10` chip so it stays legible over the colored rail.
- [x] 3.3 Drag handle behavior preserved: `dragHandleProps` still spreads on the gutter div; `data-testid="drag-handle-session"` still set; covered by existing tests in the suite that read `[data-testid='drag-handle-session']`.

## 4. Tests

- [x] 4.1 Added a `SessionCard left-gutter mosaic rail` describe block to `__tests__/SessionCard.test.tsx` covering green/amber/muted/red palettes, `-400` selected shade swap, `mask-image` style, and the icon chip wrapper.
- [x] 4.2 `npm test` green: 521 files / 5313 tests.

## 5. Visual verification

- [x] 5.1 `npm run build` succeeded; dashboard server running in dev mode picked up changes via HMR.
- [x] 5.2 Visually verified in browser. Iteration history:
  1. v1 — mosaic rail filling full gutter width; user rejected (too chunky, mosaic shape unwanted).
  2. v2 — solid full-gutter rail at `/30` alpha with opaque icon chip; user said "not solid uninterrupted" + chunky.
  3. v3 (final) — slim 2 px line on the left edge of the gutter, low alpha (`/25` unselected, `/50` selected), icon offset right via `pl-[3px]` so the rail line never sits behind the icon, no chip needed. Solid no mosaic, no gradient, no animation.
