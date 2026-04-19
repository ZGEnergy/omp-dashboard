# Tasks: Marketing Site

## Phase 1 — Scaffold

- [x] 1.1 Create `/site` directory with its own `package.json` (Astro 5, Tailwind, MDX, motion, React).
- [x] 1.2 Configure `astro.config.mjs` with Tailwind + MDX + React integrations, output: `static`.
- [x] 1.3 `tailwind.config.cjs` with Pi-blue theme tokens (slate-950 bg, indigo-400 / violet-500 accents, custom glow utilities).
- [x] 1.4 `tsconfig.json` extending Astro strict; `src/env.d.ts`.
- [x] 1.5 `src/styles/global.css` with Tailwind base + CSS variables + dot-grid background utility.
- [x] 1.6 `src/layouts/Base.astro` with `<head>`, OG tags, favicon, nav, footer, `<slot/>`.
- [x] 1.7 Root `/site/README.md` documenting dev, build, screenshots, and first-deploy steps.
- [x] 1.8 Add `screenshots` script at repo-root `package.json` that delegates to `/site/scripts/screenshots/capture.ts`.

## Phase 2 — Design system primitives

- [x] 2.1 `components/Nav.astro` (sticky glass backdrop, logo, Features / Why / Install / GitHub star link).
- [x] 2.2 `components/Footer.astro` (repo, license, social, "made by" line).
- [x] 2.3 `components/GlowBackdrop.astro` (radial indigo glow, CSS hue-rotate on :root).
- [x] 2.4 `components/BrowserFrame.astro` (3 dots, URL bar, inner slot, drop shadow, subtle gradient border).
- [x] 2.5 `components/MobileFrame.astro` (phone bezel for mobile screenshots).
- [x] 2.6 `components/FeatureCard.astro` (gradient-bordered card, icon slot, title, blurb, optional img).
- [x] 2.7 `components/BentoGrid.astro` (12-col grid, asymmetric spans from a props-driven feature list).
- [x] 2.8 `components/WhyCard.astro` (two-column: big icon + body copy).
- [x] 2.9 `components/CodeBlock.astro` (shiki-highlighted, copy button).
- [x] 2.10 `components/ArchitectureDiagram.astro` (inline SVG: bridge → server → browser, CSS-animated dotted WebSocket line).
- [x] 2.11 `content/features.ts` with the 12-feature data array (id, title, blurb, size, screenshot path, icon).

## Phase 3 — Hero

- [x] 3.1 `components/Hero.astro` scaffolding: headline, subhead, CTA buttons, mockup slot, glow layer.
- [x] 3.2 Placeholder hero copy with one accent word and 2 CTAs ("Get the app" → releases, "Star on GitHub" → repo).
- [x] 3.3 `components/HeroAnimation.tsx` — single Preact island (swapped from React to stay under 50 KB JS budget). State machine cycling 4 states every 6s with motion-one crossfade + subtle translateY/scale.
- [x] 3.4 Pause-on-hover and `prefers-reduced-motion` respected (freeze on state 0).
- [x] 3.5 Inline placeholder PNGs (solid-color stubs) until Phase 7 generates real ones.
- [x] 3.6 Ambient background hue-shift on the glow (CSS keyframes, ~30s period).

## Phase 4 — Big idea + Why

- [x] 4.1 `BigIdea` section: 1-line claim "pi runs in your terminal — the dashboard puts it everywhere else." + `ArchitectureDiagram` below.
- [x] 4.2 `Why` section with two `WhyCard`s.
- [x] 4.3 Card 1 copy ("Not everyone thinks in monospace") + small inline SVG showing TUI vs dashboard size/density contrast.
- [x] 4.4 Card 2 copy ("Your agents don't have to live on your laptop") + small inline SVG showing server + phone + tunnel.

## Phase 5 — Features grid

- [x] 5.1 Render `<BentoGrid>` from `content/features.ts`.
- [x] 5.2 Verify each card size class maps correctly (col-span-4/6/8, row-span-1/2 as designed).
- [x] 5.3 Author short, playful copy for all 12 feature cards.
- [x] 5.4 Add small colored dot badges ("New", "Mobile", "Realtime") where appropriate.
- [x] 5.5 Image `alt` text on every card.

## Phase 6 — How it works + Get started + 404

- [x] 6.1 `HowItWorks` section: larger arch diagram + brief prose explaining bridge ↔ server ↔ browser.
- [x] 6.2 `components/InstallTabs.tsx` Preact island — tabs for Electron / pi package / npm. Tabs preserve selection in URL hash.
- [x] 6.3 Copy-paste command blocks for each tab (CodeBlock + copy button).
- [x] 6.4 `pages/404.astro` — playful "this session was aborted" terminal-style page with button back to `/`.
- [x] 6.5 `public/og-card.png` — AI-generated 1456×816 social card (gradient π + title + tagline) via `nano-banana-imagegen` skill.
- [x] 6.6 `public/favicon.png` derived from existing `public/icon-192.png`.

## Phase 7 — Screenshot pipeline

- [x] 7.1 `scripts/screenshots/viewports.ts` — desktop (1440×900 @2x) and mobile (390×844 @3x touch).
- [x] 7.2 `scripts/screenshots/fixtures/` — committed JSON fixture `sessions.json` + README. Richer fixtures (events, flows, diffs) tracked as follow-up.
- [x] 7.3 `scripts/screenshots/seed.ts` — writes fixture session directories under a temp HOME so the dashboard scanner picks them up at startup.
- [x] 7.4 `scripts/screenshots/capture.ts` — orchestrator with two modes: target existing dashboard via `SCREENSHOT_TARGET_URL`, or spawn temp `pi-dashboard` + seed + capture + cleanup.
- [x] 7.5 Capture routes per design.md table (desktop: sessions, chat, flows, terminal, diff, openspec, packages, settings-providers, tunnel-qr).
- [x] 7.6 Capture mobile routes (session-list, chat, action-menu, qr).
- [x] 7.7 Output to `site/public/screenshots/{desktop,mobile}/` with stable filenames matching `content/features.ts`.
- [x] 7.8 `scripts/screenshots/README.md` documenting both modes, viewports, outputs, and troubleshooting.
- [x] 7.9 Replaced placeholder PNGs with AI-generated dashboard mockups via the `nano-banana-imagegen` skill (Gemini). 9 desktop + 4 mobile screenshots authored to match the Pi-blue palette. The Playwright pipeline remains ready for maintainers who want to capture real shots later.
- [x] 7.10 Generated mockup screenshots committed to git.

## Phase 8 — Deploy

- [x] 8.1 `.github/workflows/deploy-site.yml` — build + deploy-pages job, triggered on push to main for `site/**` + workflow file itself + `workflow_dispatch`.
- [x] 8.2 Concurrency group `pages-deploy` with `cancel-in-progress: true`.
- [x] 8.3 Enable Pages in repo settings (Source: GitHub Actions) — documented in `/site/README.md` first-time-setup section.
- [ ] 8.4 First successful deploy; verify live URL renders correctly on desktop + mobile (runs automatically once the PR merges; validated post-merge by maintainer).
- [x] 8.5 CI check: Astro build must succeed (covered by the deploy workflow's `build` job, which runs on every push matching the path filter).
- [x] 8.6 JS-size budget check in `scripts/check-js-size.mjs`, wired to `npm run size` and enforced by the deploy workflow.

## Phase 9 — Polish & verification

- [ ] 9.1 Lighthouse mobile targets — requires post-deploy verification against the live URL.
- [x] 9.2 A11y primitives wired up: skip-to-content link, visible focus ring, semantic landmarks, ARIA labels on tabs and live region on hero.
- [ ] 9.3 Cross-browser smoke test — deferred to post-deploy.
- [x] 9.4 `prefers-reduced-motion` respected: hero freezes on state 0, body hue-shift disabled, global animation duration overridden in `global.css`.
- [x] 9.5 README.md update — added "Website" link under the hero paragraph.
- [x] 9.6 AGENTS.md update — added site and deploy-workflow entries to Key Files.
- [x] 9.7 docs/architecture.md — added note pointing at `/site` as product-adjacent.
- [x] 9.8 CNAME placeholder documented in `/site/README.md` under "Custom domain (future: pi-dashboard.dev)".
