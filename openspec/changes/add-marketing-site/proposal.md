## Why

The project's only public face today is the GitHub README — a dense, text-first artifact that buries the product's strongest pitch: **pi-dashboard turns any terminal-based pi session into a rich, visual, remotely-controllable, mobile-friendly experience.** That pitch is visual by nature and does not translate to a README.

Two specific audiences are under-served by the current README:

1. **Developers who don't prefer TUI-first workflows.** In a graphical interface, information density can be *increased* (many sessions at a glance instead of one) and the *size* of information can reflect its importance (active session large, idle sessions small, alerts glowing). A TUI flattens all of that into a single fixed-width, linear stream.
2. **Developers who want to delegate remote control.** With the dashboard + a tunnel, pi sessions can run on a server or cloud VM and be steered from a phone on the go — approving prompts, reviewing diffs, killing runaway processes — without SSH, tmux, or a laptop.

A dedicated marketing site on GitHub Pages gives these audiences a visual, animated landing page that shows — not tells — what the dashboard does, with a screenshot pipeline that keeps every image current as the UI evolves.

## What Changes

- **New `/site` directory**: Astro + Tailwind + MDX marketing site, self-contained, independent of the main app's build.
- **Design system**: "Pi blue" palette (slate-950 / indigo-400 / violet-500 accents) with Supabase-inspired playful bento-grid layout, glow gradients, browser-frame mockups, gradient-bordered cards.
- **Storytelling hero animation**: Floating browser mockup that crossfades through 3–4 dashboard states every 6s (session list → chat view → flow dashboard → mobile view) using motion-one; pauses on hover.
- **Why section**: Two side-by-side cards, one per argument (information density / visual hierarchy, and remote & mobile delegation), with supporting visuals.
- **Features bento grid**: ~12 feature cards — asymmetric sizing, annotated screenshots, short playful copy. Covers multi-session dashboard, PromptBus dialogs, terminal, flows, diff viewer, mobile, OpenSpec, packages, provider auth, discovery, tunnel/QR.
- **How-it-works section**: Simplified 3-box architecture diagram (bridge ↔ server ↔ browser) with an animated dotted WebSocket line.
- **Get-started section**: OS/install-method tabs (Electron / pi package / npm) with copy-paste command blocks.
- **Playwright screenshot pipeline**: `npm run screenshots` script that boots the dashboard with seeded demo data, visits every panel, and captures desktop (1440) + mobile (390) shots in dark mode. Re-runnable so shots never go stale.
- **Demo seeding**: Either a server `--seed-demo` flag or pre-baked JSON fixtures POSTed via REST — decided in design.md.
- **GitHub Pages deployment**: `.github/workflows/deploy-site.yml` using `actions/deploy-pages@v4` (modern path, no gh-pages branch). Triggers on push to main when `/site/**` or screenshots change.
- **Placeholder CNAME**: Commented-out CNAME file ready for `pi-dashboard.dev` swap later; no DNS work needed now.
- **404 + OG card**: On-brand playful 404 ("this session was aborted") and a single hand-crafted OG social card.

## Capabilities

### New Capabilities

- `marketing-site`: The public-facing GitHub Pages site at `/site`, its design system, content sections, and Playwright screenshot pipeline.

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
