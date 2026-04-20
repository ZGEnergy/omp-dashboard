## 1. Header Brand Mark — Inline SVG `PiLogo`

- [x] 1.1 Create `packages/client/src/components/PiLogo.tsx`: a small React component rendering the bold geometric Π as inline SVG (`viewBox="0 0 24 24"`, `fill="currentColor"`, `role="img"`, `aria-label` from optional `title` prop, default size 24).
- [x] 1.2 In `packages/client/src/components/SessionList.tsx` (~line 469), replace the literal `π` text inside the home `<button>` with `<PiLogo size={24} />`. Add the import. Keep `title="Home"`, click-to-home navigation, and styling (`text-blue-500 hover:text-blue-400 transition-colors`).
- [x] 1.3 Repeat 1.2 in `packages/client/src/components/SessionSidebar.tsx` (~line 59).
- [x] 1.4 Update `packages/client/src/components/__tests__/SessionSidebar.test.tsx` and `__tests__/routing.test.tsx` so brand-button assertions look for `<svg aria-label="Pi Dashboard">` instead of `<img>` or `π` text.
- [x] 1.5 Run `npx vitest run SessionSidebar` and confirm 4/4 pass.

## 2. Vite `publicDir` Fix

- [x] 2.1 In `packages/client/vite.config.ts`, change `publicDir: "../../public"` to `publicDir: "../../../public"` so the project-root `public/` directory resolves correctly (three `../` from `root: "src"`).
- [x] 2.2 Run `npm run build` and confirm `packages/client/dist/` now contains `icon-192.png`, `icon-512.png`, `manifest.json`, `sw.js` (in addition to `assets/` and `index.html`).
- [x] 2.3 Confirm `curl -I http://localhost:8000/icon-192.png` returns `Content-Type: image/png` (not `text/html` from the SPA fallback).

## 3. Card Working Animation — Stripes + Pulse

- [x] 3.1 In `packages/client/src/index.css`, replace the existing `.card-working-pulse` block with a layered implementation:
  - `@keyframes card-working-stripes-scroll` animates `background-position` along the X axis only, from `0 0` to `113.1371px 0` (= 4 × 20√2 px = 4 full diagonal periods) over 3s linear infinite.
  - `@keyframes card-working-opacity-pulse` animates element opacity `0.6 → 1 → 0.6` over 3s ease-in-out infinite.
  - `.card-working-pulse` sets two `background-image` layers (45° repeating gradient + flat tint), `background-size: 28.2843px 28.2843px, auto`, `background-repeat: repeat, no-repeat`, and runs both animations in parallel.
- [x] 3.2 Critical: animation translates *across* stripes, not along them. Diagonal `(Δx, Δx)` translation is pattern-invariant for 45° stripes and produces zero perceived motion — must scroll horizontally `(Δx, 0)`.
- [x] 3.3 `background-size` MUST be a positive multiple of the natural diagonal period (`20√2 ≈ 28.2843 px`) to avoid visible seams; using exactly one period is the minimum.
- [x] 3.4 Add a `@media (prefers-reduced-motion: reduce) { .card-working-pulse { animation: none; } }` block so the static striped tint remains as a state cue without motion.
- [x] 3.5 Leave `.card-input-pulse` (ask_user purple) untouched.
- [x] 3.6 Run `npx vitest run SessionCard` and confirm existing class-name assertions still pass.

## 4. Pin-Folder Button Label

- [x] 4.1 In `packages/client/src/components/SessionList.tsx`, the pin-folder button (`data-testid="pin-dir-dialog-btn"`) renders `<Icon path={mdiPin} />` followed by a `<span>Add folder</span>`; remove the secondary `mdiPlus` icon. Add `inline-flex items-center gap-1` to the button className. Update `title` to `"Pin a folder to the sidebar"`.

## 5. Visual QA

- [x] 5.1 Streaming session card visibly drifts horizontally with continuous diagonal stripes, no seams.
- [x] 5.2 `ask_user` (purple) cards still show pure breathing pulse, no stripes.
- [x] 5.3 Light theme: header logo renders blue Π on transparent background (no dark square).
- [x] 5.4 Dark theme: header logo renders blue Π on transparent background.
- [x] 5.5 Toggle `prefers-reduced-motion: reduce` (DevTools → Rendering) and confirm the streaming card retains the static stripe pattern with no motion. _(user-confirmed)_
- [x] 5.6 Confirm sidebar logo + pin button look correct on mobile shell. _(user-confirmed)_

## 6. Documentation

- [x] 6.1 Update `AGENTS.md` with entries for `SessionSidebar.tsx`, `SessionList.tsx`, `index.css`, `PiLogo.tsx` describing the new behavior.
- [x] 6.2 No README/architecture updates needed — purely cosmetic + build-config fix.
