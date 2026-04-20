## Why

The project's only public face today is the GitHub README — a dense, text-first artifact that buries the product's strongest pitch: **pi-dashboard turns any terminal-based pi session into a rich, visual, remotely-controllable, mobile-friendly experience.** That pitch is visual by nature and does not translate to a README.

Two specific audiences are under-served by the current README:

1. **Developers who don't prefer TUI-first workflows.** In a graphical interface, information density can be *increased* (many sessions at a glance instead of one) and the *size* of information can reflect its importance (active session large, idle sessions small, alerts glowing). A TUI flattens all of that into a single fixed-width, linear stream.
2. **Developers who want to delegate remote control.** With the dashboard + a tunnel, pi sessions can run on a server or cloud VM and be steered from a phone on the go — approving prompts, reviewing diffs, killing runaway processes — without SSH, tmux, or a laptop.

A dedicated marketing site on GitHub Pages gives these audiences a visual, animated landing page that shows — not tells — what the dashboard does, with a screenshot pipeline that keeps every image current as the UI evolves.

## What Changes

- **New `/site` directory**: Astro + Tailwind + MDX marketing site, self-contained, independent of the main app's build.
- **Design system**: "Pi blue" palette driven by CSS custom properties so the
  whole site themes via a single `class="dark"` toggle on `<html>`. Dark mode
  uses the original slate-950 / indigo-400 / violet-500 palette; light mode
  uses an off-white / slate-900 / indigo-500 variant. Supabase-inspired
  playful bento-grid layout, glow gradients, browser-frame mockups,
  gradient-bordered cards.
- **Theme selector (System / Light / Dark)**: Three-state pill selector in
  the nav bar, persists to `localStorage`, defaults to system preference,
  live-tracks OS theme flips while in System mode. Pre-hydration inline
  script (`ThemeScript.astro`) applies the resolved theme before paint so
  there is no FOUC.
- **Storytelling hero animation**: Floating browser mockup that crossfades through 4 dashboard states every 6s (session list → chat view → flow dashboard → diff review) using motion-one; pauses on hover.
- **Mission background graph**: Ambient non-figurative animated SVG
  visualising the project's mission — a left cluster of twinkling nodes
  ("many agent sessions") connected by flowing dashed arcs to a right spray
  of nodes ("any device, anywhere"), with sonar-style ping rings emitted
  from select nodes. Pure SVG + CSS, zero JS, anchored at the top of the
  page so it fades out as users scroll.
- **Scroll-triggered reveals**: Cards and section headings fade-in with a
  blur-to-sharp, translate-up, subtle scale motion when they enter the
  viewport. Per-column staggered timing through the bento. Implemented with
  a tiny inline `IntersectionObserver` (`RevealInit.astro`); respects
  `prefers-reduced-motion`.
- **"What is pi?" section**: Short explainer between the hero and the big
  idea section so visitors who have never heard of pi get context. Covers
  pi as an open-source coding-agent CLI, the notion of a session, and the
  key reassurance that the dashboard augments — does not replace — the TUI.
- **Why section**: Two side-by-side cards, one per argument (information density / visual hierarchy, and remote & mobile delegation), with supporting visuals.
- **Features bento grid**: 13 feature cards (expanded from the originally
  proposed 12 to include the embedded code-server / VS Code integration)
  on a 12-column grid tuned so every row sums to exactly 12 with no gaps.
  Covers multi-session dashboard, PromptBus dialogs, terminal, editor
  (code-server), flows, diff viewer, mobile, OpenSpec, packages, provider
  auth, discovery, tunnel/QR.
- **How-it-works section**: Simplified 3-box architecture diagram (bridge ↔ server ↔ browser) with an animated dotted WebSocket line.
- **Download section**: Prominent card surfacing the latest GitHub Release
  (version tag, publish date, platform cards for macOS / Linux / Windows).
  Assets classified and sorted by platform + architecture; each card shows
  the recommended primary download plus a collapsible list of alternatives
  (Intel/Apple Silicon DMG, `.deb`, portable/ZIP, etc.). The Hero CTA is
  dynamic too — renders as “Download vX.Y.Z →” linking to `#download`.
- **Automatic release sync**: Two complementary mechanisms keep the site
  in lockstep with releases. (a) At build time, the site fetches
  `api.github.com/.../releases/latest` and bakes version + assets into the
  static HTML. (b) On `release: published|edited`, a dedicated workflow
  (`.github/workflows/sync-release-version.yml`) writes the release
  metadata to `site/src/data/latest-release.json` and commits it back to
  main. The site code falls back to this committed cache when the live API
  is unavailable (offline / rate-limited). The deploy workflow also
  listens on the `release` event so every new release triggers a rebuild.
- **Get-started section**: OS/install-method tabs (Electron / pi package / npm) with copy-paste command blocks.
- **Playwright screenshot pipeline**: `npm run screenshots` script that
  boots the dashboard with seeded demo data, visits every panel, and
  captures desktop (1440) + mobile (390) shots in dark mode. Re-runnable
  so shots never go stale. For the first shipped screenshots, AI-generated
  mockups authored via the `nano-banana-imagegen` skill are used as
  stand-ins while real shots are captured by a maintainer.
- **Demo seeding**: Either a server `--seed-demo` flag or pre-baked JSON fixtures POSTed via REST — decided in design.md.
- **GitHub Pages deployment**: `.github/workflows/deploy-site.yml` using `actions/deploy-pages@v4` (modern path, no gh-pages branch). Triggers on push to main when `/site/**` or screenshots change.
- **Placeholder CNAME**: Commented-out CNAME file ready for `pi-dashboard.dev` swap later; no DNS work needed now.
- **404 + OG card**: On-brand playful 404 ("this session was aborted") and an AI-generated OG social card (glowing π mark + title + tagline).

## Capabilities

### New Capabilities

- `marketing-site`: The public-facing GitHub Pages site at `/site`, its
  design system (including the dual light/dark theme + theme selector),
  content sections (hero, what-is-pi, big idea, why, features bento grid,
  how-it-works, get started), ambient mission-graph background, scroll
  reveal animations, and Playwright screenshot pipeline.

### Modified Capabilities

_None — this is new surface area with no behavioral impact on the dashboard, bridge, or server._

## Impact

- **New directory**: `/site` (Astro app, fully self-contained with its own `package.json`).
- **New directory**: `/site/scripts/screenshots/` (Playwright capture pipeline + seed fixtures).
- **New workflow**: `.github/workflows/deploy-site.yml`.
- **Repo-root `package.json`**: Add `screenshots` script that delegates to `/site`.
- **No changes to**: dashboard server, bridge extension, web client, shared protocol, or any existing package.
- **Ongoing**: Whenever UI changes meaningfully, `npm run screenshots` is re-run to refresh images. Feature PRs that change visible UI should include the regenerated screenshots.

## Non-goals

- No live, embedded, in-browser demo of the dashboard (screenshots only).
- No documentation hosting (docs stay in `/docs` and the README).
- No custom domain work now (CNAME file stays placeholder until `pi-dashboard.dev` is registered).
- No i18n or multi-language content.
- No blog, changelog, or release-notes surface on the site.
- No analytics beyond GitHub Pages' default (privacy-respecting by default).
