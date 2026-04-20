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

## Phase 10 — Post-implementation refinements

Iteration passes driven by direct visual review in the browser after the
initial implementation landed. Each was captured as a matching spec update
in `specs/marketing-site/spec.md`.

- [x] 10.1 **Dual-theme palette**: refactored `pi-*` Tailwind tokens to
  resolve through CSS variables; defined light-theme and dark-theme
  variable sets in `global.css`.
- [x] 10.2 **Theme selector**: added `ThemeToggle.tsx` Preact island
  (System / Light / Dark radiogroup) in the nav, and the no-FOUC
  `ThemeScript.astro` inlined into `<head>` that resolves the initial
  theme before paint and listens for OS theme flips in System mode.
- [x] 10.3 **Theme-aware SVGs**: migrated hardcoded hex colors in
  `ArchitectureDiagram.astro`, `MissionGraph.astro`, and a handful of
  components to `rgb(var(--pi-xxx))` so every element retints with the
  theme.
- [x] 10.4 **Shiki dual-theme**: `CodeBlock.astro` uses
  `themes={{ light: "github-light", dark: "github-dark-dimmed" }}` plus a
  small `html.dark .astro-code` rule in `global.css` to swap themes.
- [x] 10.5 **MissionGraph**: added non-figurative ambient background —
  left cluster + right spray of twinkling nodes connected by S-curve
  dashed flow arcs, with sonar-style ping rings emitted from select
  nodes. Anchored at top of page, mask-faded out before content. Zero JS.
- [x] 10.6 **Scroll-triggered reveals**: `RevealInit.astro` inlined
  IntersectionObserver + `[data-reveal]` CSS rules; applied to every
  FeatureCard (per-column stagger), WhyCard, BigIdea columns,
  HowItWorks cells, GetStarted, and section headings.
- [x] 10.7 **"What is pi?" section**: new `WhatIsPiSection.astro` between
  Hero and BigIdea; hero subhead gained an in-page anchor link on the
  word "pi" pointing at it.
- [x] 10.8 **Embedded code-server feature card**: added a 13th bento
  entry for the VS Code / code-server integration with its own generated
  screenshot.
- [x] 10.9 **Bento grid gap audit**: re-tuned span widths so every row
  sums to exactly 12 columns (sessions-banner + stacked pair; terminal /
  editor stacked next to flows-banner; diff+mobile pair; openspec /
  packages / providers triple; discovery+tunnel pair).
- [x] 10.10 **Header / footer logomark**: swapped the gradient `π` box
  for the real `app-icon.png` from the main app's `public/icon-192.png`.
- [x] 10.11 **Spec + design updates**: captured everything above in
  `proposal.md`, `design.md`, and `specs/marketing-site/spec.md`
  (added requirements for theme selector, mission graph, reveal
  animations, "What is pi?" section, code-server card, and zero-gap
  bento grid).

## Phase 11 — Download surface + release auto-sync

- [x] 11.1 **`src/lib/github-release.ts`**: build-time fetcher that reads
  `api.github.com/.../releases/latest`, classifies assets by platform +
  arch (DMG / AppImage / .deb / Installer .exe / portable / ZIP),
  exports a `LatestRelease` shape keyed by platform with a primary
  asset per platform and sorted alternates.
- [x] 11.2 **Resolution order + resilience**: live API → committed
  `site/src/data/latest-release.json` cache → `null`. Includes an
  8-second fetch timeout, `GITHUB_TOKEN` support, and a
  `PI_SKIP_RELEASE_FETCH=1` escape hatch for local builds.
- [x] 11.3 **`src/data/latest-release.json`**: persisted, git-tracked
  snapshot of the current release (tag, URL, publish date, assets).
- [x] 11.4 **`DownloadSection.astro`**: prominent `#download` section
  between How-It-Works and Get-Started with three platform cards,
  primary CTA + size per card, collapsible “Other downloads” accordion,
  release-notes + releases-index links, zero JavaScript.
- [x] 11.5 **Dynamic Hero CTA**: “Download vX.Y.Z →” when a release is
  resolved, generic “Get the app →” when both fetch and cache fail.
- [x] 11.6 **Nav link**: added “Download” between Why and Install.
- [x] 11.7 **`sync-release-version.yml`**: new workflow triggered on
  `release: [published, edited]` + `workflow_dispatch`. Uses `gh api`
  + `jq` to rewrite `latest-release.json`, commits back to main only
  when the file changed, requires `permissions: contents: write`.
- [x] 11.8 **`deploy-site.yml`**: added `release: [published]` trigger
  and `GITHUB_TOKEN` env on the build step for API rate-limit relief.
- [x] 11.9 **tsconfig**: enabled `resolveJsonModule: true` for the JSON
  import.
- [x] 11.10 **Spec updates**: new `Latest-release surface with auto-sync`
  requirement in `specs/marketing-site/spec.md` with 5 scenarios
  (download section renders, hero reflects version, API-outage fallback,
  sync workflow commits cache, release event rebuilds site).

## Phase 12 — Light-theme mockups for theme-aware screenshots

- [x] 12.1 Generated 10 light-theme desktop mockups via
  `nano-banana-imagegen` (sessions, chat, flows, terminal, editor, diff,
  openspec, packages, settings-providers, tunnel-qr), matching the
  site's light palette (off-white bg, slate borders, indigo-500 accents).
- [x] 12.2 Committed them to `site/public/screenshots/desktop-light/`
  with stable filenames matching `desktop/`.
- [x] 12.3 **FeatureCard.astro**: render both dark and light variants
  with `dark:block` / `dark:hidden` CSS toggles. Light path
  auto-derived from the dark path with a string replace.
- [x] 12.4 **HeroAnimation.tsx**: each state renders both a dark and a
  light `<img>` stacked at `absolute inset-0`, CSS-toggled via the
  same `dark:` variants. Crossfade animations continue to work because
  they animate opacity on the container, not the images.
- [x] 12.5 **Spec update**: added “Hero and feature mockups swap per
  theme” scenario under the theme-selector requirement.
