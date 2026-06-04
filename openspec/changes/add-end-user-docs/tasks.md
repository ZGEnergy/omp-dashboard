# Tasks

## 1. Docs surface (Starlight)

- [ ] 1.1 Add `@astrojs/starlight` to `site/package.json`; register integration in `site/astro.config.mjs` with `/docs` base. Keep existing landing page untouched.
- [ ] 1.2 Create `site/src/styles/docs-theme.css` mapping `--pi-*` (colors) + Inter/JetBrains Mono fonts → Starlight `--sl-*` tokens, light + dark. Wire via Starlight `customCss`.
- [ ] 1.3 Reconcile theme toggle: one control sets BOTH `<html class="dark">` (site/Tailwind) and Starlight `data-theme`; persist choice. Verify no flash on load.
- [ ] 1.4 Define sidebar categories from the registry (Decision 2). Verify `/docs` renders with skinned theme + working sidebar/prev-next/TOC.

## 2. Feature registry (single source of truth)

- [ ] 2.1 Create `site/src/content/docs-registry.ts` with `FeatureNode` / `ShotTarget` types (see design.md).
- [ ] 2.2 Populate from the curated registry in design.md: ~8 categories, main features + sub-features, each tagged with source spec + route/testid.
- [ ] 2.3 Add a small helper that flattens the tree into (a) docs page list and (b) capture target list, so docs + shots stay in sync from one source.

## 3. Screenshot pipeline — reproducible, theme-aware, cutouts

- [ ] 3.1 Add theme axis to `site/scripts/screenshots/capture.ts`: loop `[dark,light]`; drive the dashboard's OWN theme (`.dark` class / localStorage), not just `colorScheme`. Output `{viewport}-{theme}/`.
- [ ] 3.2 Replace flat `routes.ts` consumption with registry-driven targets (`view | component | dialog`). Crossed with `[dark,light] × [desktop,mobile]`.
- [ ] 3.3 Cutouts: `component`/`dialog` targets shot via `getByTestId(...).screenshot()` into `.../cutouts/`. `dialog` runs `openVia` steps (click testid → wait) first.
- [ ] 3.4 Determinism: rich deterministic fixtures in `seed.ts`/`fixtures/` (fixed IDs, events, diffs, flows); frozen clock; disable animations (`prefers-reduced-motion`/CSS); hide scrollbars; capture settled states.
- [ ] 3.5 Regenerate full matrix via `npm run screenshots`; verify two runs capture the SAME declared areas (reproducible target set). Commit all PNGs.
- [ ] 3.6 Remove the orphaned/stale shots no longer referenced; confirm `desktop-light/` (or new `{viewport}-light/`) is now script-generated.

## 4. Client selector hooks

- [ ] 4.1 Audit registry `testid`/`openVia` targets against existing 369 `data-testid`s.
- [ ] 4.2 Add `data-testid` to the handful of feature regions lacking a stable hook (surgical; no behavior change).

## 5. Theme-aware images + content

- [ ] 5.1 Create `site/src/components/ThemedShot.astro`: renders light+dark PNGs, reveals matching one via active docs theme. No JS flicker.
- [ ] 5.2 Author Markdown/MDX docs pages (initial high-traffic categories: Getting Started, Your Sessions, Chat & Prompts, Tools). Non-technical prose + full shot + numbered steps + cutouts via `<ThemedShot>`.
- [ ] 5.3 Stub remaining category pages from the registry so navigation is complete; fill incrementally.

## 6. Search (Pagefind, enabled at launch)

- [ ] 6.1 Enable Starlight's Pagefind search UI in `astro.config.mjs`.
- [ ] 6.2 Verify the static Pagefind index builds with the initial docs content and returns results for feature titles/prose.
- [ ] 6.3 Confirm search modal is keyboard-accessible and theme-skinned (inherits `--pi-*` tokens).

## 7. Docs index + verification

- [ ] 7.1 Delegate to subagent (caveman style): add rows for all new files to the matching `docs/file-index-<area>.md` splits; add `AGENTS.md` pointer if warranted.
- [ ] 7.2 `npm run build` in `site/` succeeds (static, deterministic); `/docs` renders themed, navigable, with images swapping on theme toggle.
- [ ] 7.3 `npm run screenshots` reproduces the same target set; no uncommitted drift after a clean run.
