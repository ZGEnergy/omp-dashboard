# Design: Marketing Site

## Goals

1. **Visually stunning** — Supabase-inspired playful bento grid with glow, gradients, browser mockups, animated hero.
2. **Self-contained** — `/site` has its own `package.json`, build, and tooling. Does not couple to the main app's Vite build or TypeScript project graph.
3. **Fast** — Astro ships zero JS by default. Lighthouse ≥95 on mobile. Motion is opt-in via islands.
4. **Re-runnable screenshots** — The site never goes stale because capturing screenshots is a scripted, one-command pipeline.
5. **Deployable via GitHub Actions + Pages** — No `gh-pages` branch; uses `actions/deploy-pages@v4`.

## Non-goals

- No server-side rendering at request time (static output only).
- No MDX-authored docs (docs stay in `/docs`).
- No live dashboard embed.

## Directory layout

```
/site
├── package.json              # astro, @astrojs/tailwind, @astrojs/mdx, motion, playwright
├── astro.config.mjs
├── tailwind.config.cjs
├── tsconfig.json
├── public/
│   ├── favicon.ico           # reuse /public/icon-192.png rendered to ico
│   ├── og-card.png           # hand-crafted 1200×630
│   └── screenshots/          # generated, git-committed
│       ├── desktop/
│       │   ├── sessions.png
│       │   ├── chat.png
│       │   ├── flows.png
│       │   ├── terminal.png
│       │   ├── diff.png
│       │   ├── openspec.png
│       │   ├── packages.png
│       │   ├── settings-providers.png
│       │   └── tunnel-qr.png
│       └── mobile/
│           ├── session-list.png
│           ├── chat.png
│           ├── action-menu.png
│           └── qr.png
├── src/
│   ├── layouts/
│   │   └── Base.astro        # <head>, OG tags, nav, footer
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro        # wraps <HeroAnimation client:load/>
│   │   ├── HeroAnimation.tsx # the ONE React island — storytelling crossfade
│   │   ├── BrowserFrame.astro
│   │   ├── MobileFrame.astro
│   │   ├── FeatureCard.astro
│   │   ├── BentoGrid.astro
│   │   ├── WhyCard.astro
│   │   ├── InstallTabs.tsx   # React island for tab state
│   │   ├── CodeBlock.astro   # copy button, syntax-highlighted via shiki
│   │   ├── ArchitectureDiagram.astro  # inline SVG, CSS-animated dotted line
│   │   └── GlowBackdrop.astro
│   ├── pages/
│   │   ├── index.astro       # the whole site lives here; single-page
│   │   └── 404.astro         # "this session was aborted" playful page
│   ├── content/
│   │   └── features.ts       # feature list as data, rendered by BentoGrid
│   └── styles/
│       └── global.css        # tailwind base + custom css variables
└── scripts/
    └── screenshots/
        ├── README.md
        ├── capture.ts        # Playwright entry
        ├── seed.ts           # seeds dashboard with demo state
        ├── fixtures/
        │   ├── sessions.json # fake sessions
        │   ├── flows.json
        │   ├── diffs.json
        │   └── terminal-output.txt
        └── viewports.ts      # desktop + mobile definitions
```

## Stack

- **Astro 5** — static output, zero JS by default, supports framework islands.
- **Tailwind CSS 3** (via `@astrojs/tailwind`) — same dialect the client uses.
- **MDX** (via `@astrojs/mdx`) — available for long-form content; not
  currently used on any page but retained for future growth.
- **Preact 10** (via `@astrojs/preact({ compat: true })`) — chosen over React
  to stay under the 50 KB JS budget. The single `HeroAnimation.tsx`,
  `ThemeToggle.tsx`, and `InstallTabs.tsx` islands use Preact + `preact/hooks`.
- **motion-one** (`motion` package) — lightweight declarative animations,
  used in `HeroAnimation.tsx`.
- **shiki** (built into Astro 5) — syntax highlighting for code blocks,
  configured with dual `{ light, dark }` themes so code follows the site theme.
- **Playwright** — screenshot pipeline. Already implicitly available through `pi-agent-browser`; site uses it directly with its own `playwright` dep to avoid coupling.

**Explicitly NOT used**: React (swapped for Preact for bundle budget reasons), Framer Motion (heavier than motion-one), GSAP (overkill), Three.js/WebGL (over-the-top for a dev tool site), any CMS.

## Design tokens — "Pi blue", dual-theme

All palette tokens live as CSS custom properties on `:root` (light) and
`:root.dark` (dark), and the Tailwind config maps `pi-*` names to those
variables using the `rgb(var(--pi-xxx) / <alpha-value>)` form. This means a
single `class="dark"` toggle on `<html>` restyles the entire site with no
`dark:` prefix sprawl across components.

```
Token           Dark (default original)    Light (added)
─────────────   ──────────────────────   ────────────────────
pi-bg           #020617  (slate-950)       #f8fafc  (slate-50)
pi-surface      #0f172a  (slate-900)       #ffffff  (white)
pi-surface-alt  #1e293b  (slate-800)       #f1f5f9  (slate-100)
pi-border       #1e293b  (slate-800)       #e2e8f0  (slate-200)
pi-fg           #f8fafc  (slate-50)        #0f172a  (slate-900)
pi-muted        #94a3b8  (slate-400)       #475569  (slate-600)
pi-accent       #818cf8  (indigo-400)      #6366f1  (indigo-500)
pi-accent2      #8b5cf6  (violet-500)      #7c3aed  (violet-600)
pi-success      #34d399  (emerald-400)     #10b981  (emerald-500)
pi-warn         #fbbf24  (amber-400)       #d97706  (amber-600)
pi-glow         0.28 strength              0.14 strength
dot-grid        slate-800 @ 0.4            slate-400 @ 0.35
```

Gradient borders, glow shadows, and hero radial glow all resolve through
these tokens so they retint naturally between themes.

Typography:
- **Display / headlines**: Inter (variable), tight tracking, `font-bold`, size steps `text-5xl md:text-7xl`.
- **Body**: Inter 400/500, `leading-relaxed`.
- **Code / terminal**: JetBrains Mono.
- Single accent color word in every big headline wrapped in `<span class="pi-accent-word">` with a subtle glow.

## Theme system

The site supports **System / Light / Dark** mode with per-visitor
persistence. Two components collaborate:

- **`ThemeScript.astro`** — an `is:inline` `<script>` inlined at the top of
  `<head>` before any stylesheet link. It reads `localStorage.pi-theme`
  (default: "system"), resolves against `prefers-color-scheme`, and sets
  `class="dark"` on `<html>` *before paint* so there is no flash of
  wrong theme. It also attaches a `matchMedia` listener so OS theme flips
  propagate while the user is in "system" mode.
- **`ThemeToggle.tsx`** — a Preact island in the nav bar. A 3-button
  radiogroup (System / Light / Dark) that writes to `localStorage` and
  re-applies the class. Matches the rest of the site's aesthetic (pill
  background, accent glow on the active option).

Because all palette tokens are CSS variables and every component uses
`pi-*` Tailwind utilities, the theme toggle instantly retints the whole
page with only a 300 ms `background-color` / `color` transition on the
root. Reduced-motion users get no transition.

Code blocks use Astro's dual-theme shiki support
(`themes={{ light: "github-light", dark: "github-dark-dimmed" }}`) plus a
tiny `html.dark .astro-code { ... }` rule that swaps the CSS variables
shiki emits.

## Mission background graph

`MissionGraph.astro` is an ambient, non-figurative animated SVG that
encodes the project's mission. It is anchored at the top of the page
(`absolute top-0 h-screen`), fades out via a mask before the content
sections begin, and carries zero JavaScript.

Visual encoding:

- Left cluster of ~18 twinkling nodes = many pi agent sessions
- Right spray of ~22 twinkling nodes = any device, anywhere
- Curved dashed arcs between them (S-curves, no visible central hub) =
  events streaming through WebSockets
- Sonar-style ping rings emitted from select "emitter" nodes every few
  seconds with staggered delays = live activity

Implementation:

- Deterministic seeded jitter so SSR output is stable
- CSS-only keyframes (`@keyframes mg-flow`, `mg-twinkle`, `mg-ping`) —
  no JS beyond what Astro's templating does
- Colors driven by `rgb(var(--pi-accent))` so the graph retints cleanly
  between light and dark themes
- `prefers-reduced-motion: reduce` → all mission-graph animations disabled;
  ping rings hidden entirely

## Scroll-triggered reveals

Cards, section headings, and key content blocks fade in with a blur-to-sharp,
translate-up, subtle-scale motion as they enter the viewport. Implemented via:

- CSS selectors on `[data-reveal]` in `global.css` (initial hidden state +
  transitions); an `.is-visible` class toggle animates them in. Per-element
  stagger via `style="--reveal-delay: N"` → delay = N × 70 ms.
- `RevealInit.astro` — a ~30-line inlined `IntersectionObserver` that toggles
  `.is-visible` when elements cross 12 % into the viewport, then unobserves
  them so they don't re-animate on scroll-back.
- `prefers-reduced-motion: reduce` → reveals are no-ops; elements are
  visible immediately with no transform or blur.

Applied to: every `FeatureCard` (stagger by column), each `WhyCard`, both
columns of the Big Idea, the How-It-Works diagram and its three mini-cards,
the What-Is-Pi explainer card, every section heading.

## Latest-release surface + auto-sync

The marketing site needs to show the current dashboard version at all times
with zero manual editing. Two layers collaborate:

```
  Maintainer publishes a GitHub Release
               │
               ├─ release.published event
               │
   ──────────┼─────────────────────────────────
   │         │                                   │
   ▼         ▼                                   ▼
 sync-release-version.yml              deploy-site.yml
 ──────────────────────────           ──────────────
 gh api /releases/latest → JSON       live fetch + cache fallback
 write site/src/data/                  build → actions/deploy-pages@v4
   latest-release.json
 commit back to main  ──(site/** changed)──┐
                                                 ▼
                              re-run deploy-site.yml on that commit
```

### Client library: `site/src/lib/github-release.ts`

Resolution order on every build:

1. **Live GitHub API** — `api.github.com/repos/<owner>/<repo>/releases/latest`.
   Authenticated with `GITHUB_TOKEN` when available (higher rate limit).
   8-second `AbortController` timeout.
2. **Static cache** — `site/src/data/latest-release.json`, imported at
   build time. Covers offline builds, API outages, and rate limits.
3. **`null`** — components fall back to a generic “releases” link.

An escape hatch (`PI_SKIP_RELEASE_FETCH=1`) short-circuits to the cache
for local builds that want deterministic output.

Asset classification normalises the messy filenames from electron-builder
into `{ platform: macos|linux|windows, kind: string, priority: number }`.
Kinds are human-readable labels (“DMG (Apple Silicon)”, “Installer (.exe)”,
etc.) and `priority` determines which asset becomes the “primary” CTA
per platform (DMG → macOS, AppImage → Linux, NSIS Setup → Windows).

### Sync workflow: `.github/workflows/sync-release-version.yml`

- Triggers: `release: [published, edited]` + `workflow_dispatch`.
- Uses `gh api /releases/latest` with a `jq` filter to produce the exact
  shape the site expects (`tagName`, `name`, `url`, `publishedAt`,
  `assets[]`).
- Diff-gated commit: if the file hasn't changed, skips the push so
  re-runs are idempotent.
- Requires `permissions: contents: write` so the default `GITHUB_TOKEN`
  can push back to `main`.

Because the deploy workflow has a `paths: ["site/**"]` filter, the
commit made by the sync workflow automatically triggers a fresh build
— no second event wiring needed.

### DownloadSection UX

- Three platform cards (macOS / Linux / Windows) with SVG logos.
- Primary CTA = the first asset per platform, with size label.
- Secondary assets tucked into a native `<details>` accordion
  (“Other downloads (N)”) so the card stays uncluttered but power users
  have every build.
- “Release notes ↗” and “All releases ↗” links at the top.
- Dynamic Hero CTA: “Download vX.Y.Z →” (or generic “Get the app →” if
  fetch + cache both fail).
- Zero JavaScript on the page — everything resolves at build time.

## Hero animation — storytelling level

Single Preact island (`HeroAnimation.tsx`, `client:load`). Uses motion-one's `animate()` + a tiny state machine:

```
        ┌────────────┐
        │  state 0   │──── 6s ──┐
        │  sessions  │          │
        └────────────┘          ▼
              ▲           ┌────────────┐
              │           │  state 1   │
              │           │   chat     │
              │           └────────────┘
              │                 │ 6s
              │                 ▼
        ┌────────────┐    ┌────────────┐
        │  state 3   │◄── │  state 2   │
        │   mobile   │ 6s │   flows    │
        └────────────┘    └────────────┘

  pause on hover / touch
  prefers-reduced-motion → freeze on state 0
```

Each "state" is a pre-rendered PNG from the screenshot pipeline, layered inside a `<BrowserFrame>`. Transitions: opacity crossfade + `scale(1 → 1.01)` + `translateY(0 → -4px)`. Background glow hue shifts subtly with each state.

Ambient background: slow hue-rotate on the radial glow, ~30s period. CSS-only, no JS.

## Page structure

Single `index.astro` with sections — no router, no multi-page.

```
<Base>                           <!-- ThemeScript inlined in <head> -->
  <MissionGraph />               <!-- ambient animated bg, top-anchored -->
  <Nav>                          <!-- sticky, glass backdrop -->
    <ThemeToggle />              <!-- System / Light / Dark island -->
  </Nav>
  <Hero>                         <!-- HeroAnimation island -->
    headline / subhead (links to #what-is-pi) / CTAs / mockup
  </Hero>
  <WhatIsPi />                   <!-- NEW: short explainer of what pi is -->
  <BigIdea />                    <!-- 1-line claim + 3-box arch diagram -->
  <Why>                          <!-- two WhyCards: density + remote -->
    <WhyCard icon="layout" />
    <WhyCard icon="phone" />
  </Why>
  <Features>                     <!-- bento grid, 13 cards -->
    <BentoGrid features={FEATURES} />
  </Features>
  <HowItWorks />                 <!-- deeper architecture explanation -->
  <GetStarted>                   <!-- InstallTabs island -->
    <InstallTabs client:visible />
  </GetStarted>
  <Footer />
  <RevealInit />                 <!-- IntersectionObserver bootstrap -->
</Base>
```

### Bento grid sizing

12-column CSS grid tuned so every row sums to exactly 12 columns and no
gaps are introduced by auto-placement. 13 cards across 7 rows:

| Row | Cards | Cols |
|---|---|---|
| 1–2 | sessions (8×2) · chat (4) / promptbus (4) stacked | 12 |
| 3–4 | terminal (4) / editor (4) stacked · flows (8×2) | 12 |
| 5 | diff (6) · mobile (6) | 12 |
| 6 | openspec (4) · packages (4) · providers (4) | 12 |
| 7 | discovery (6) · tunnel (6) | 12 |

Shot list:

| # | Feature | Size | Shot |
|---|---|---|---|
| 1 | Multi-session dashboard | col-span-8 row-span-2 | sessions.png |
| 2 | Real-time chat mirroring | col-span-4 | chat.png |
| 3 | PromptBus interactive dialogs | col-span-4 | *no image, text-only* |
| 4 | Integrated terminal | col-span-4 | terminal.png |
| 5 | pi-flows live execution | col-span-8 row-span-2 | flows.png |
| 6 | Embedded VS Code (code-server) | col-span-4 | editor.png |
| 7 | Diff viewer | col-span-6 | diff.png |
| 8 | Mobile experience | col-span-6 | mobile/chat.png |
| 9 | OpenSpec integration | col-span-4 | openspec.png |
| 10 | Package management | col-span-4 | packages.png |
| 11 | Provider auth (OAuth) | col-span-4 | settings-providers.png |
| 12 | Network discovery | col-span-6 | *inline diagram* |
| 13 | Tunnel + QR code | col-span-6 | tunnel-qr.png |

## Why-section copy (draft — to be refined)

**Card 1 — "Not everyone thinks in monospace."**
> In a terminal, every message has the same weight. In a dashboard, importance has a size. Active sessions are big. Idle ones are small. Running flows glow. Errors shout. You can see *many* sessions at once — not just the one your cursor is in. Information density goes up. Cognitive load goes down.

**Card 2 — "Your agents don't have to live on your laptop."**
> Run pi on a server, a cloud VM, or a beefy home workstation. Approve prompts from your phone on the train. Kill a runaway process from bed. Review a diff from the couch. The dashboard turns any pi session into a URL you can hand to any device — no SSH, no tmux, no laptop required.

Both cards get a small visualization next to the text.

## Screenshot pipeline

Goals: scripted, seeded, re-runnable, multi-viewport.

### Flow

```
  npm run screenshots
        │
        ▼
  1. Start a fresh dashboard server on a random port
     with a temp HOME so real sessions aren't touched:
        HOME=$(mktemp -d) PI_DASHBOARD_PORT=0
        pi-dashboard start
        (capture actual port from stdout)
        │
        ▼
  2. POST seed fixtures via REST:
        fixtures/sessions.json → register fake sessions
        fixtures/flows.json    → inject flow state
        fixtures/diffs.json    → inject diff events
        (seed.ts handles this)
        │
        ▼
  3. Playwright opens each route × each viewport:
        desktop 1440×900:
          /                   → sessions.png
          /session/:id/chat   → chat.png
          /session/:id/flow   → flows.png
          /folder/:x/terminal → terminal.png
          /session/:id/diff   → diff.png
          /settings?tab=providers → settings-providers.png
          /settings?tab=packages  → packages.png
          /tunnel             → tunnel-qr.png
        mobile 390×844:
          /                   → mobile/session-list.png
          /session/:id/chat   → mobile/chat.png
          kebab open          → mobile/action-menu.png
          /tunnel             → mobile/qr.png
        │
        ▼
  4. Shut down server, clean temp HOME.
  5. Output: site/public/screenshots/** (committed)
```

### Seed strategy — decision: REST-only, no server flag

Instead of adding a `--seed-demo` flag to the real server (pollutes production code), seed purely via existing REST endpoints:

- `POST /api/sessions` — register fake sessions
- `POST /api/sessions/:id/events` — inject fake events (if endpoint exists; if not, we publish events through a test-only WebSocket mock)
- Local `events.json` files in `~/.pi/agent/sessions/<id>/` can be placed directly to simulate historical sessions

This keeps all demo-data concerns inside `/site/scripts/screenshots/` — the dashboard codebase learns nothing new.

**Fallback if REST injection proves insufficient**: the screenshot script can spawn a real pi session with a scripted prompt and let it run briefly to generate organic content. This is slower but zero-coupling.

### Viewports

```ts
// viewports.ts
export const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 2 };
export const MOBILE  = { width: 390,  height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
```

Dark mode only for v1 — that's the dashboard's default and what the site's palette assumes.

### Integration with the site build

- Screenshots are **committed** to git (not re-captured on every CI run — too slow, too fragile).
- A single repo-root script `npm run screenshots` invokes `/site/scripts/screenshots/capture.ts`.
- The site build just reads PNGs from `/site/public/screenshots/` like any other static asset.

## Deploy workflow

`.github/workflows/deploy-site.yml`:

```
Trigger:   push to main affecting site/** or .github/workflows/deploy-site.yml
           workflow_dispatch
Jobs:
  build:
    - checkout
    - setup-node 22
    - cache ~/.npm
    - cd site && npm ci
    - cd site && npm run build          # → site/dist
    - upload-pages-artifact site/dist
  deploy:
    - needs: build
    - deploy-pages
```

Repo Settings → Pages → Source = "GitHub Actions". No `gh-pages` branch created.

## CNAME placeholder

`/site/public/CNAME` is **not** created yet. When `pi-dashboard.dev` is acquired:

1. Add `/site/public/CNAME` containing `pi-dashboard.dev`.
2. Configure DNS A/ALIAS records per GitHub Pages docs.
3. Enable "Enforce HTTPS" in repo settings.

Documented in `/site/README.md`.

## 404 page

Playful, on-brand: terminal aesthetic, a faux `session_end` event, a "Return to dashboard" button linking to `/`. One screen, no nav. CSS-only motion.

## OG image

Hand-crafted `public/og-card.png` (1200×630). Dark slate background, π logo glow, headline "Your pi agents, in the browser.", URL tagline. No dynamic OG generation for v1.

## Accessibility & performance budget

- Lighthouse targets: Performance ≥95, Accessibility ≥95, Best Practices ≥95, SEO ≥95 (mobile).
- Total JS shipped: ≤50 KB gzipped (the single hero island + install tabs).
- All images `loading="lazy"` except the hero mockup.
- All images have descriptive `alt` text (feature name + short description).
- Color contrast ≥4.5:1 on body copy, ≥3:1 on large text.
- `prefers-reduced-motion` → hero freezes on state 0, no hue-shift, no card pulses.
- Keyboard nav: full tab order, visible focus rings, skip-to-content link.

## Open questions / future work (out of scope for v1)

- Dynamic per-route OG images (Astro's image API supports this).
- Light-mode variant.
- Localized content.
- Embedded live demo (would require CORS/auth gymnastics with a hosted sandbox instance).
- Analytics / heatmaps.
- Release notes or a blog.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Screenshots drift as UI changes | `npm run screenshots` re-runnable; PR template reminder for visible-UI changes. |
| Seed-via-REST proves insufficient for rich scenes | Fallback to running a real pi session in the capture script. |
| Hero animation feels gimmicky | Level 2 only; pause on hover; reduced-motion respected; can downgrade to Level 1 if feedback is negative. |
| Astro + React island hydration bundles sneak up | Single island (`HeroAnimation`), one more for `InstallTabs`. Budget enforced via a tiny CI check on `site/dist/**/*.js` total size. |
| Deploy workflow races with main app CI | Separate workflow file, separate concurrency group, only runs on `site/**` changes. |
| gh-pages misconfiguration | First deploy documented in `/site/README.md` with step-by-step settings screenshots. |
