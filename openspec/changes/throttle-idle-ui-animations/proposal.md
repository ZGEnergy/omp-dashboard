## Why

PI Dashboard burns ~one full CPU core continuously while idle. Live `ps` on a MacBook (Apple Silicon) showed the Electron renderer at ~43% and the GPU process at ~41%, moving in lock-step — the signature of continuous per-frame compositing — with only 2 low-traffic sessions connected. Accumulated CPU time was ~8h renderer / ~7.75h GPU, draining battery for a UI nobody was watching.

Root cause is structural, not load-driven:

1. The selected session card runs an always-on, GPU-expensive neon glow border (`.card-selected-ring`, `packages/client/src/index.css:339-389`): two `conic-gradient` layers whose angle is driven by an animated registered custom property `@property --neon-angle`, and the `::after` layer applies `filter: blur()` over that gradient. Animating the gradient angle forces the gradient to be **re-rasterized every frame** (it cannot be cached as a static composited layer), and the per-frame `blur()` is one of the most expensive GPU operations available. This runs `13s linear infinite` — forever — and a selected card is essentially always present.
2. Nothing pauses animations when the window is not visible. On macOS, closing the window only hides it to the tray (`packages/electron/src/main.ts:284-289` calls `mainWindow.hide()`, not quit), so the neon ring keeps painting for hours in the background — this explains the ~8h accumulation.

The existing `prefers-reduced-motion` guard (`index.css:406-409`) is the only escape hatch and is inactive unless the user manually enables macOS Reduce Motion.

## What Changes

- **Pause all CSS animations when the document is hidden.** Add a `visibilitychange`/`blur`/`focus` listener that toggles an `app-hidden` class on the document root, with CSS that sets `animation-play-state: paused` on all elements and pseudo-elements while hidden. `document.visibilityState` flips to `hidden` when the window is hidden to the tray via `.hide()` even with Chromium occlusion detection disabled, so this kills the dominant background-drain case (tray-hidden for hours) without touching Electron occlusion flags.
- **Make the neon selected-card ring cheap while visible.** Replace the animated `@property --neon-angle` (which re-rasterizes the conic gradient every frame) with a static conic gradient rotated via `transform: rotate()` on the pseudo-elements — transforms are compositor-only and never trigger re-rasterization. A static blurred layer caches instead of re-blurring every frame. Same visual, near-zero steady-state cost.
- **Make the running/unread card stripes compositor-only while visible.** The `card-working-pulse` / `card-unread-pulse` stripes (`index.css:197-252`) animate `background-position`, a paint-triggering property that forces a per-frame repaint of every running/unread card (cheap per element, but it scales with the number of active cards). Replace the `background-position` scroll with a `transform: translate` on a pseudo-element overlay carrying the static repeating gradient — transforms composite without repaint. Keep the `opacity` pulse (already compositor-only).
- **Unify the ask_user (waiting-for-question) state onto the same stripes, in the question color (purple).** Today ask_user uses `card-input-pulse` (`index.css:256-262`), a `background-color` tint pulse — visually inconsistent with running (yellow stripes) and unread (cyan stripes), and a paint-triggering property. Replace it with a purple variant of the compositor-only stripe overlay (`card-input-stripes`), reusing the shared transform keyframes; color (purple-500) is the only difference, exactly as unread reuses working's geometry.
- **Stop the xterm cursor blink in `TerminalView`** (`cursorBlink: true` → `false`), matching `InlineTerminalCard` which already uses `false`. Removes a per-second repaint per open terminal tab.

Out of scope: re-enabling `MacWebContentsOcclusion` / setting `backgroundThrottling`. That only addresses the secondary "window open but covered by another app" case, carries a known blank-window-on-restore regression risk, and is unnecessary once animations pause on `visibilitychange`.

## Capabilities

### New Capabilities
- `ui-animation-energy`: idle/hidden-state energy discipline for the web client — animations MUST pause when the document is hidden, and decorative infinite animations MUST avoid per-frame rasterization/blur in steady state.

### Modified Capabilities
<!-- none -->

## Impact

- `packages/client/src/index.css` — neon ring: static conic gradient + `transform: rotate()` keyframes replacing `--neon-angle` animation; add `:root.app-hidden *, ::before, ::after { animation-play-state: paused !important }`.
- `packages/client/src/App.tsx` (or `main.tsx`) — add `visibilitychange`/`blur`/`focus` listener toggling the `app-hidden` root class.
- `packages/client/src/index.css` — stripes: move the repeating gradient onto a pseudo-element overlay scrolled via `transform: translate` keyframes, replacing the `background-position` animation on `.card-working-pulse` / `.card-unread-pulse`; keep the opacity pulse. Add purple `.card-input-stripes` variant reusing the shared keyframes; replace `.card-input-pulse` (`background-color` tint) and update its consumer.
- `packages/client/src/components/SessionCard.tsx:58` — return `card-input-stripes` instead of `card-input-pulse` for the ask_user state (and update the suppression comments at lines 52, 465).
- `packages/client/src/components/__tests__/SessionCard.test.tsx` — update ask_user assertions from `card-input-pulse` to `card-input-stripes`.
- `packages/client/src/components/TerminalView.tsx:55` — `cursorBlink: false`.
- No API, server, protocol, or dependency changes. Client-only. No Electron main-process change.
- Verification requires before/after `ps` readings (renderer + GPU %) in two window states (visible-with-selected-card, hidden-to-tray).
