## Why

pi-dashboard ships ~40 user-facing features but has no end-user documentation. The only "docs" today are the marketing landing page (`site/`), the engineering `docs/` tree, and ~280 OpenSpec capabilities — none aimed at a non-technical person trying to *use* the dashboard. Users discover features by accident. A categorized, navigable, screenshot-rich guide closes that gap.

We are well-positioned: the `site/` Astro 5 app already has `@astrojs/mdx`, Tailwind with a fully token-driven theme (`--pi-*` light/dark), a working Playwright screenshot pipeline (`site/scripts/screenshots/`), 369 stable `data-testid` hooks across the client, and existing light+dark screenshot folders. The new work is small relative to what already exists.

## Why now

The marketing site, screenshot pipeline, and stable selectors all exist. The marginal cost of adding a docs surface and extending the capture pipeline is low *now*; every release that ships without docs widens the gap between features and what users know exists.

## What Changes

- **Docs surface (Starlight).** Add `@astrojs/starlight` to `site/` serving docs at `/docs`, skinned via one `docs-theme.css` that maps the existing `--pi-*` tokens onto Starlight's `--sl-*` tokens (colors + Inter/JetBrains Mono fonts). Reconcile the theme toggle: site uses `<html class="dark">` (Tailwind class strategy), Starlight uses `data-theme` — drive both from one toggle. Search (Pagefind) ships with Starlight and is enabled at launch (static build-time index).
- **Feature registry = single source of truth.** Add `site/src/content/docs-registry.ts`: a hierarchical, declarative list of MAIN features → SUB-features → typed capture targets (`view | component | dialog`), each tagged with its source OpenSpec spec and a `data-testid`/route. The registry drives BOTH the docs structure (sidebar categories, pages, sections) AND the screenshot capture set. Add a feature once → new doc page + new shots.
- **Docs content.** ~40 curated user-facing features (from the ~280 OpenSpec specs — internal/plumbing specs excluded), grouped into ~8 sidebar categories. One Markdown/MDX page per main feature, written for non-technical readers: short prose + full screenshot + numbered steps + cutouts. Initial pass writes the highest-traffic categories; the registry makes the rest incremental.
- **Reproducible screenshot pipeline.** Extend `site/scripts/screenshots/` so a single command captures the SAME declared targets every run:
  - **Theme axis** — capture each target in dark AND light (drive the dashboard's own `.dark` theme, not just `colorScheme` media). Output `{viewport}-{theme}/`.
  - **Cutouts** — element screenshots via `getByTestId(...)` (layout-proof crops of components/dialogs), not just full-page views.
  - **Dialog targets** — an `openVia` interaction step (click testid → wait) to drive the UI into dialog/menu states before shooting.
  - **Determinism** — rich deterministic fixtures + frozen clock + disabled animations so each shot is visually stable run-to-run ("deterministic-enough", not byte-identical).
- **Theme-aware images.** Add a `<ThemedShot>` Astro component that renders both light+dark PNGs and reveals the matching one via the active docs theme — no flicker, no JS gymnastics.
- **A few `data-testid` additions** on the handful of feature regions that lack a stable hook (most already have one).
- **Docs/index updates** per the repo Documentation Update Protocol (delegated to subagent): rows in the matching `docs/file-index-<area>.md` splits; one-line pointer in `AGENTS.md` if warranted.
- **Non-goals**:
  - Do NOT make docs screenshots from the live/real dashboard (Option A) — docs use fixture-seeded Option B only, so regen is reproducible.
  - Do NOT chase byte-identical pixel reproducibility.
  - Do NOT restyle the marketing landing page or change its components.
  - Do NOT document internal/engineering capabilities.
  - Do NOT block the existing `npm run build` — docs build is additive and static.

## Capabilities

### New Capabilities

- `end-user-documentation`: a categorized, navigable, searchable (Pagefind, enabled at launch), screenshot-rich end-user guide served at `/docs`, themed with the site's own tokens, driven by a single hierarchical feature registry that is also the screenshot capture manifest. Screenshots are reproducible (same declared targets every run), theme-aware (light/dark), and include both full views and element cutouts.

### Modified Capabilities

- `marketing-site`: the Astro `site/` app gains a `/docs` route (Starlight integration) alongside the existing landing page; shared theme tokens, separate route tree.

## Impact

- **New trees**: `site/src/content/docs/` (Markdown pages), `site/src/content/docs-registry.ts`, `site/src/styles/docs-theme.css`, `site/src/components/ThemedShot.astro`.
- **New screenshots**: `site/public/screenshots/{desktop,mobile}-{dark,light}/` full views + `.../cutouts/` element shots — all generated + committed.
- **Modified**: `site/astro.config.mjs` (Starlight integration), `site/package.json` (deps + scripts), `site/scripts/screenshots/{capture,routes,seed,viewports}.ts` (theme axis, cutouts, openVia, rich fixtures), a few client components (add `data-testid`), `docs/file-index-*.md` splits, possibly `AGENTS.md` pointer.
- **Build**: docs are static (MDX/Starlight) — deterministic `npm run build`; Playwright runs only on `npm run screenshots`, never at site build time.
- **Deps added** (site only): `@astrojs/starlight` (+ Pagefind, bundled). No runtime/server deps.
- **Open design questions deferred to `design.md`**: exact category taxonomy; how rich fixtures must be per feature; clock-freeze mechanism; selector additions list.
