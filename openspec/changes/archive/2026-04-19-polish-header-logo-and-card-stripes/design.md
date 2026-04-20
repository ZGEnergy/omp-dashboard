## Context

The dashboard's left sidebar header shows a small "π" as the brand/home button, and active session cards use a subtle background-color pulse to signal that an agent is streaming. Both are working but visually inconsistent with the rest of the product:

- The text `π` is rendered by whatever serif font the OS picks; on most platforms it's thin and grey-ish, nothing like the bold geometric Π in the app icon (`public/icon-192.png`, also used for the PWA manifest, the Electron tray, favicons, and the marketing site hero).
- The pulse animation on streaming cards is gentle but ambiguous — it reads more as "this card is alive" than as "this agent is currently doing work." A drifting diagonal stripe pattern is the long-established UI idiom for ongoing background activity (Finder copy, apt progress, GitHub Actions running indicators, etc.).

Both fixes are pure presentation. No data flow, no protocol, no server logic changes.

## Goals / Non-Goals

**Goals:**
- Sidebar header brand mark visually matches the app icon used everywhere else.
- Streaming/resuming session cards have an unambiguous "work in progress" visual signal while preserving the existing breathing pulse.
- Respect `prefers-reduced-motion`.

**Non-Goals:**
- Producing a vector (SVG) version of the logo. Using the existing 192px PNG at ~24px is good enough; SVG conversion is a separate concern that would benefit the marketing site too.
- Changing the `ask_user` purple pulse. It intentionally stays "breathing-only" to contrast with "working = stripes."
- Re-theming colors or introducing new design tokens.
- Changing animation on hover, focus, or any other state.

## Decisions

### 1. Header logo: PNG `<img>` instead of inline SVG

The existing `public/icon-192.png` is already cached by the PWA service worker and shipped in every build. Rendering it as `<img class="w-6 h-6">` inside the existing `<button>` is one line and visually correct.

**Considered alternatives:**

| Option | Verdict |
|---|---|
| Inline SVG component | Best long-term (recolorable via `currentColor`, crisp at any size) but requires extracting/redrawing the mark. Out of scope for this change. |
| Keep text but pick a font | Won't match the bold geometric Π reliably across platforms. |
| **PNG `<img>`** | ✅ Zero new assets, immediate visual fix, trivial revert. |

### 2. Card animation: two background layers, two animations

CSS `background` accepts multiple layered images. The clean composition is:

```
LAYER 1 (top)    diagonal stripes  →  drifts via background-position
LAYER 2 (bot.)   flat amber tint   →  opacity-pulses (the existing breathing)
```

Two independent `@keyframes` running together on the same element. Critically, the **pulse animates `opacity` of the whole element, not `background-color`** — that way the stripes breathe *with* the tint rather than the two layers feeling unrelated.

**Why coprime periods (2s stripes, 3s pulse):**
If both animations share a period, the card visibly "pumps" in lockstep, which is more attention-grabbing, not less. Coprime-ish periods create constantly shifting overlap, which reads as ambient activity.

```
t=0s ──────── t=2s ──────── t=4s ──────── t=6s
 ▓░░▓░░▓░░▓ ░▓░░▓░░▓░░▓ ▓░░▓░░▓░░▓ ░▓░░▓░░▓  ← stripes (2s period)
 dim ── bright ── dim ── bright ── dim ── bright  ← pulse  (3s period)
```

### 3. Tuning values (starting point, may be adjusted in implementation)

| Property | Value | Rationale |
|---|---|---|
| Stripe angle | `45deg` | Standard barber pole / progress idiom |
| Stripe / gap width | `10px / 10px` (period 20px) | Visible at card scale, not busy |
| Stripe alpha | `rgba(234,179,8,0.08)` | Same amber hue as existing pulse, low contrast |
| Flat tint alpha | `rgba(234,179,8,0.06)` | Slightly weaker than current `0.06` standalone, since stripes add load |
| Stripe drift | 40px in 2s linear | One full pattern cycle every 2s |
| Pulse opacity range | `0.55 → 1 → 0.55` over 3s ease-in-out | Preserves current "breathing" feel |

These are starting values; the change explicitly invites tuning during implementation review against real running cards.

### 4. Reduced-motion fallback

```css
@media (prefers-reduced-motion: reduce) {
  .card-working-pulse { animation: none; }
}
```

The static stripe + tint *background* remains, so the streaming state is still legible without any motion. The current code has no reduced-motion guard, so this is a small accessibility improvement included with the change.

### 5. State semantics across pulse classes

The dashboard has two related "card state" animations in `index.css`:

| Class | State | Animation after this change |
|---|---|---|
| `.card-working-pulse` | streaming, resuming | Diagonal stripes drifting + breathing tint |
| `.card-input-pulse` | ask_user pending | Breathing only (purple) — **unchanged** |

This intentional split gives the user a quick read: **stripes = the machine is doing something; pulse-only = the machine is waiting on you.**

## Risks / Trade-offs

- **Visual load**: Layered animations could feel busy. Mitigation: low alphas, coprime periods, and the explicit invitation to tune values during implementation against a live dashboard.
- **PNG at small size**: A 192px PNG rendered at ~24px is slightly soft compared to inline SVG. Acceptable trade-off for now; a future change can swap to SVG once a vector source exists.
- **Test fragility**: Existing `SessionCard.test.tsx` only asserts on the `card-working-pulse` class name, not the CSS, so animation changes won't break it. Header test (if added) will assert on `<img alt="Pi Dashboard">` presence.
- **Theme contrast**: `rgba(234,179,8,…)` reads differently on light vs. dark backgrounds. The dashboard is dark-mode-only today, so this is fine; revisit if/when a light theme lands.

## Migration Plan

None — pure visual change, no persisted state, no protocol surface.

## Open Questions

_All resolved during implementation — see §Resolved Decisions._

## Resolved Decisions (post-implementation)

### A. PNG `<img>` was wrong — inline SVG `PiLogo` shipped

Light-theme review caught that `public/icon-192.png` ships with an opaque dark navy rounded-square background. In light mode that became a visible black square in the sidebar header. Switched to a small `PiLogo.tsx` inline-SVG component using `fill="currentColor"` and a fully transparent background. The component inherits `text-blue-500 hover:text-blue-400` from the parent button, restoring the original hover affordance without `hover:opacity-80`.

### B. There were TWO sidebar headers, not one

The codebase has two sidebar implementations — `SessionSidebar.tsx` AND `SessionList.tsx` — the latter is what's actually rendered on the desktop. The original task list only patched `SessionSidebar.tsx`. The fix had to be applied to both.

### C. Stripe animation must scroll ACROSS stripes, not along them

First attempt animated `background-position` from `(0,0)` to `(28.28, 28.28)` (diagonal). Result: zero perceived motion despite the position numerically changing. Reason: a CSS `linear-gradient(45deg, …)` produces stripes that run along the (1,1) diagonal. Translation along that same diagonal is pattern-invariant. The fix is to translate purely horizontally `(Δx, 0)` so the shift cuts across the stripes.

### D. `background-size` must be an integer multiple of the diagonal period — not arbitrary

First attempt used `background-size: 40px 40px`. Visible seams appeared every 40px because the natural diagonal period of a 45° gradient with 20px stops is `20/√2 ≈ 14.142 px` along each axis (or `20√2 ≈ 28.2843 px` for one full visible period in screen-space). 40 isn't a multiple. Fix: `background-size: 28.2843px 28.2843px` (exactly one period). Animation distance is also a period multiple (`113.1371px = 4 × 20√2`) so the loop is perfectly seamless.

### E. Vite `publicDir` was misconfigured — fixed in this change

While wiring up the (later abandoned) PNG `<img>`, discovered that `publicDir: "../../public"` in `packages/client/vite.config.ts` resolved to a non-existent `packages/public/` directory (publicDir is relative to `root`, which is `src/` → needs three `../` to reach project-root `public/`). Static assets had been silently 404'ing in production. Fixed to `"../../../public"`. Side effect: PWA manifest + service worker now actually ship.

### F. Pin-folder button got an explicit text label

Not in the original scope. Added during the same UI polish pass: the `📌+` icon-only button next to the Active-only / Show hidden filters became `📌 Add folder` with tooltip `"Pin a folder to the sidebar"`.

### G. Final tuning values that shipped

| Property | Shipped value | Note |
|---|---|---|
| Stripe alpha | `rgba(234,179,8,0.10)` | Bumped from 0.08 starting suggestion for visibility |
| Tint alpha | `rgba(234,179,8,0.06)` | Unchanged |
| Stripe / gap | `10px / 10px` (period 20px gradient stops) | Unchanged |
| `background-size` | `28.2843px 28.2843px, auto` | One full diagonal period for seamless tiling |
| Stripe scroll | `0px 0` → `56.5685px 0` over 2s linear | 2 periods, horizontal only |
| Pulse opacity | `0.6 → 1 → 0.6` over 3s ease-in-out | Slightly tighter low end (0.55 → 0.6) |
| Animation timing | **2s stripes / 3s pulse** | Coprime periods so the effects never visually lock into a single rhythm |
