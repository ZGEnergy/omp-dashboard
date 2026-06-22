## 1. Pre-fix control measurement (settles the open question)

- [ ] 1.1 Read baseline `ps -axo pid,%cpu,command | grep PI-Dashboard` with the window visible and a session card selected; record renderer + gpu-process %.
- [ ] 1.2 Hide the window to the tray, wait 60s, re-read `ps`. Confirm both processes STAY pegged (proves State A — background drain). If they already drop to ~0%, `.hide()` already pauses via Chromium defaults and section 2 is redundant — note this and skip section 2.

## 2. Pause animations when hidden

- [ ] 2.1 In `packages/client/src/index.css`, add `:root.app-hidden *, :root.app-hidden *::before, :root.app-hidden *::after { animation-play-state: paused !important; }`.
- [ ] 2.2 In `packages/client/src/App.tsx` (or `main.tsx`), add a listener on `document` `visibilitychange` plus window `blur`/`focus` that toggles `app-hidden` on `document.documentElement` based on `document.visibilityState`. Clean up the listeners on unmount.
- [ ] 2.3 Test: assert the handler adds `app-hidden` when visibility is `hidden` and removes it when `visible`.

## 3. Cheap neon ring

- [ ] 3.1 In `packages/client/src/index.css`, replace the `@property --neon-angle` animation with a static `conic-gradient` (fixed `from` angle) on `.card-selected-ring::before` and `::after`, and add a `@keyframes` that animates `transform: rotate(0 → 360deg)`; keep `13s linear infinite`.
- [ ] 3.2 Size/scale the rotating layer so its corners never sweep transparency into the visible rim (cover the card diagonal).
- [ ] 3.3 Keep `filter: blur()` on the static `::after` layer (now rasterized once); preserve `prefers-reduced-motion` (`animation: none`) and the `@supports not (conic-gradient)` fallback.
- [ ] 3.4 Visually confirm the rotating rim + glow look equivalent to the current effect.

## 4. Compositor-only card stripes

- [ ] 4.1 In `packages/client/src/index.css`, move the `repeating-linear-gradient` of `.card-working-pulse` and `.card-unread-pulse` onto a pseudo-element overlay (e.g. `::before`) and clip it to the card (`overflow: hidden` / rounded mask).
- [ ] 4.2 Replace `card-working-stripes-scroll` (`background-position`) with a `@keyframes` that animates `transform: translate` by exactly one diagonal tile period (`28.2843px` along 45°); keep `2s linear infinite` and seamless looping.
- [ ] 4.3 Keep `card-working-opacity-pulse` on the card (opacity is compositor-only); keep `card-working-pulse`/`card-unread-pulse` sharing the new keyframes (color is the only difference); preserve `prefers-reduced-motion` (`animation: none`).
- [ ] 4.4 Add `.card-input-stripes` (purple, purple-500 `rgb(168 85 247)`) reusing the same overlay + transform keyframes; remove `.card-input-pulse` and the `card-input-pulse` keyframes.
- [ ] 4.5 In `packages/client/src/components/SessionCard.tsx:58`, return `card-input-stripes` for the ask_user state; update the suppression comments at lines 52 and 465.
- [ ] 4.6 In `packages/client/src/components/__tests__/SessionCard.test.tsx`, update ask_user assertions from `card-input-pulse` to `card-input-stripes`.
- [ ] 4.7 Visually confirm running (yellow), unread (cyan), and ask_user (purple) stripes scroll identically with no tile bleed past the card border.

## 5. Terminal cursor

- [ ] 5.1 In `packages/client/src/components/TerminalView.tsx:55`, set `cursorBlink: false`.

## 6. Verify

- [ ] 6.1 `npm test 2>&1 | tee /tmp/pi-test.log`; confirm no failures (`grep -nE 'FAIL|✗' /tmp/pi-test.log`).
- [ ] 6.2 `npm run build` → `curl -X POST http://localhost:8000/api/restart` (or rebuild Electron app).
- [ ] 6.3 Window visible + card selected (and at least one streaming card): re-read `ps`; renderer + GPU should fall sharply vs. the 1.1 baseline.
- [ ] 6.4 Hide to tray, wait 60s, re-read `ps`; both processes should drop to ~0% (validates section 2).
- [ ] 6.5 Update the relevant rows in `docs/file-index-client.md` (and any electron split if touched) per the Documentation Update Protocol; note `app-hidden` pause class, `transform`-based neon ring, `transform`-based card stripes, `cursorBlink: false`; `See change: throttle-idle-ui-animations`.

## 7. Validate proposal

- [ ] 7.1 `openspec validate throttle-idle-ui-animations --strict`.
