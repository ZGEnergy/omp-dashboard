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

- **Astro 4** — static output, zero JS by default, supports React islands.
- **Tailwind CSS 3** (via `@astrojs/tailwind`) — same dialect the client uses.
- **MDX** (via `@astrojs/mdx`) — for the one long-form content section (Why), so copy can be authored in Markdown with embedded components.
- **motion-one** (`motion` package) — lightweight, ~4KB, declarative animations. Used in the single `HeroAnimation.tsx` island.
- **shiki** (built into Astro 4) — syntax highlighting for code blocks.
- **Playwright** — screenshot pipeline. Already implicitly available through `pi-agent-browser`; site uses it directly with its own `playwright` dep to avoid coupling.

**Explicitly NOT used**: Framer Motion (heavier than motion-one, overkill for one island), GSAP (overkill), Three.js/WebGL (over-the-top for a dev tool site), any CMS.

## Design tokens — "Pi blue"

Exposed as Tailwind theme extensions + CSS variables on `:root`.

```
Background          bg-slate-950         #020617
Surface             bg-slate-900/60      translucent cards
Surface hover       bg-slate-800/80
Border              border-slate-800
Border subtle       border-slate-800/60
Foreground          text-slate-50        #f8fafc
Foreground muted    text-slate-400
Accent primary      indigo-400           #818cf8
Accent secondary    violet-500           #8b5cf6
Accent glow         indigo-500/30 radial
Success             emerald-400          (reserved for CTAs / live dots)
Warning             amber-400            (reserved for "Beta" badges)

Gradient borders    bg-gradient-to-r from-indigo-500/50 via-violet-500/30 to-transparent
Hero glow           radial-gradient at 50% 0% of indigo-500/20 → transparent
Grid bg             1px slate-800/40 dot grid, 32px spacing, fades to edges
```

Typography:
- **Display / headlines**: Inter (variable), tight tracking, `font-bold`, size steps `text-5xl md:text-7xl`.
- **Body**: Inter 400/500, `leading-relaxed`.
- **Code / terminal**: JetBrains Mono.
- Single accent color word in every big headline wrapped in `<span class="text-indigo-400">` with a subtle glow.

## Hero animation — storytelling level

Single React island (`HeroAnimation.tsx`, `client:load`). Uses motion-one's `animate()` + a tiny state machine:

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
<Base>
  <Nav />                        <!-- sticky, glass backdrop -->
  <Hero>                         <!-- full viewport, HeroAnimation island -->
    headline / subhead / CTAs / mockup
  </Hero>
  <BigIdea />                    <!-- 1-line claim + 3-box arch diagram -->
  <Why>                          <!-- two WhyCards: density + remote -->
    <WhyCard icon="layout" />
    <WhyCard icon="phone" />
  </Why>
  <Features>                     <!-- bento grid, ~12 cards -->
    <BentoGrid features={FEATURES} />
  </Features>
  <HowItWorks />                 <!-- deeper architecture explanation -->
  <GetStarted>                   <!-- InstallTabs island -->
    <InstallTabs client:visible />
  </GetStarted>
  <Footer />
</Base>
```

### Bento grid sizing

12-column CSS grid, mix of `col-span-{4,6,8}` and `row-span-{1,2}`. The 12 cards:

| # | Feature | Size | Shot |
|---|---|---|---|
| 1 | Multi-session dashboard | col-span-8 row-span-2 | sessions.png |
| 2 | Real-time chat mirroring | col-span-4 | chat.png |
| 3 | PromptBus interactive dialogs | col-span-4 | *inline SVG mock* |
| 4 | Integrated terminal | col-span-4 | terminal.png |
| 5 | pi-flows live execution | col-span-8 row-span-2 | flows.png |
| 6 | Diff viewer | col-span-6 | diff.png |
| 7 | Mobile experience | col-span-6 | mobile/chat.png |
| 8 | OpenSpec integration | col-span-4 | openspec.png |
| 9 | Package management | col-span-4 | packages.png |
| 10 | Provider auth (OAuth) | col-span-4 | settings-providers.png |
| 11 | Network discovery | col-span-6 | *inline diagram* |
| 12 | Tunnel + QR code | col-span-6 | tunnel-qr.png + mobile/qr.png |

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
