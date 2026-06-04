# Design — add-end-user-docs

## Context

`site/` is an Astro 5 static app (`output: "static"`) with `@astrojs/mdx`, `@astrojs/preact`, Tailwind. Theme is 100% CSS-variable-driven (`--pi-bg`, `--pi-accent`, …) with light/dark via `<html class="dark">`. A Playwright pipeline (`site/scripts/screenshots/`) already captures full-page shots; `desktop-light/` exists but is orphaned (current `capture.ts` hardcodes `colorScheme:"dark"`). Client has 369 unique `data-testid` values across 175 files. OpenSpec holds ~280 capabilities — engineering decomposition, not a user taxonomy.

## Decision 1 — Starlight, skinned (not DIY, not separate brand)

Use `@astrojs/starlight` mounted at `/docs` in the existing `site/` app. Get sidebar, categories, prev/next, TOC, and Pagefind search for free; skin via one `docs-theme.css` mapping `--pi-*` → `--sl-*`. Rejected: hand-rolled Content Collections (rebuilds search/nav for no benefit) and a standalone subsite (two builds/deploys for no gain). User requirement: share only colors/fonts/CSS, not the landing-page look — Starlight's token override fits exactly.

Theme-toggle reconciliation: Starlight uses `data-theme`, site uses `.dark` class. One toggle must set both. Small adapter (~10 lines) syncs the attribute and class + persists choice.

## Decision 2 — One hierarchical registry drives docs AND shots

`site/src/content/docs-registry.ts` is the single source of truth:

```
FeatureNode {
  id; title; category;            // docs: sidebar group + page
  spec: string;                   // source OpenSpec capability (provenance)
  blurb;                          // non-technical one-liner
  shots: ShotTarget[];            // screenshots for this node
  children?: FeatureNode[];       // sub-features
}
ShotTarget {
  name;
  kind: "view" | "component" | "dialog";
  route?: string;                 // for view
  testid?: string;                // for component/dialog cutout (getByTestId)
  openVia?: Step[];               // for dialog: drive UI into state first
  delay?: number; waitFor?: string;
}
```

Runner walks the tree and crosses every `ShotTarget` with `[dark,light] × [desktop,mobile]` → the full image matrix falls out automatically. "Reproducible" = same registry → same declared targets (component/view/dialog) captured every run. Adding a feature = one registry entry → new doc page + new shots. This replaces the flat `routes.ts` model.

## Decision 3 — Reproducibility = deterministic-enough, fixtures + frozen clock

Target visual stability run-to-run, NOT byte-identical pixels (a tar pit). Docs screenshots use **Option B (fixture-seeded dashboard)** exclusively — Option A (real dashboard) is non-reproducible and stays for marketing only.

Determinism work (the deferred "rich fixture generator" the screenshot README already promises):
- Rich deterministic fixtures (sessions, events, diffs, flows) with fixed IDs.
- Frozen clock → stable "N min ago" labels.
- Disable animations (inject `prefers-reduced-motion` / CSS).
- Blur focus / hide scrollbars; capture settled (non-streaming) states.
- Mask any irreducibly volatile region.

## Decision 4 — Cutouts via getByTestId; dialogs via openVia

- `view` → `page.goto(route)` + full-page screenshot.
- `component` → `getByTestId(x).screenshot()` (already-visible element, auto-cropped, layout-proof).
- `dialog` → run `openVia` steps (click trigger testid → wait) THEN `getByTestId(x).screenshot()`.

369 existing testids cover most targets; add a handful where missing. Selector-based crops survive layout changes; coordinate clips rejected (brittle).

## Decision 5 — Theme-aware images via <ThemedShot>

`<ThemedShot name="sessions" />` renders both `…-light.png` and `…-dark.png`; CSS reveals the one matching active docs theme (`[data-theme]`). Deterministic, no JS, no flicker. Pairs with Decision 1's toggle.

## Curated feature registry (draft — populates docs-registry.ts)

Derived from OpenSpec specs; internal/plumbing excluded. ~8 categories.

### Getting Started
- Find & connect to the dashboard (`mdns-discovery`, `server-selector`, `known-servers`)
- First-run setup (`first-run-wizard`, `landing-page-onboarding`)

### Your Sessions
- Session list & grouping (`session-listing`, `session-grouping`, `collapsible-groups`)
- Status & selection (`session-card-status`, `session-card-selection`)
- Filter & search (`session-list-filters`, `session-search`)
- Rename / resume / fork (`session-rename`, `session-resume`, `fork-from-message`)
- Folders & pinned dirs (`folder-workspaces`, `pinned-directories`, `folder-action-bar`)

### Chat & Prompts
- Live chat view (`chat-view`, `chat-display-preferences`)
- Rich rendering (`markdown-rendering`, `chat-math-rendering`, `mermaid-diagram`, `reasoning-display`)
- Images (`image-paste`, `image-lightbox`, `inline-image-tool-results`)
- Sending prompts (`mid-turn-prompt-queue`, `optimistic-prompt`, `command-autocomplete`, `file-autocomplete`)
- Model & context (`model-selector`, `context-usage-bar`, `token-stats-bar`)
- Interactive dialogs (`interactive-ui-dialogs`, `multiselect-dialog`)

### Tools
- Terminal (`terminal-emulator`, `terminals-view`)
- Editor (`editor-view`, `open-in-editor`)
- Diff viewer (`file-diff-view`)
- File & preview (`filesystem-browser`, `file-and-url-preview`, `markdown-preview-view`)

### Flows & Subagents
- Launch & manage flows (`flow-card-launcher`, `flow-card-grid`, `flow-controls`)
- Inspect flows (`flow-summary-view`, `flow-agent-detail`, `flow-architect-view`)
- Subagents (`subagents-plugin`)

### Git & Workspaces
- Branch & git ops (`git-context`, `git-branch-selector`, `git-operations-api`)
- Worktrees & workspaces (`worktree-spawn-dialog`, `workspace-management`)

### OpenSpec & Packages
- OpenSpec view & tasks (`openspec-card-section`, `openspec-task-toggle`, `specs-browser`, `openspec-archive-browser`)
- Packages (`package-management`, `package-search`, `package-install`, `package-update`, `package-remove`)
- Pi resources (`pi-resources-view`)

### Mobile, Sharing & Settings
- Mobile & PWA (`mobile-resilience`, `pwa-install-prompt`, `pwa-manifest`)
- Share remotely (`qr-code-dialog`, `zrok-tunnel`, `zrok-install-guide`, `trusted-networks`)
- Settings & themes (`settings-panel`, `theme-system`, `theme-gallery`, `global-preferences`)
- Providers & health (`provider-auth-ui`, `provider-connection-test`, `doctor-diagnostic`)

### Excluded (internal — representative)
`jiti-loader`, `event-reducer-decomposition`, `ws-ping-pong`, `extension-rpc-dispatch`, `meta-json-session-cache`, `bridge-heartbeat-watchdog`, `server-startup-node-version-guard`, `in-memory-event-buffer`, `catch-all-event-forwarding`, `spawn-register-watchdog`, `*-decomposition`, persistence/migration internals.

## Decision 6 — Pagefind search enabled at launch

Search ships from day one, not deferred. Starlight bundles Pagefind and indexes docs at build time by default, so the cost is ~zero and the value is high for non-technical users who navigate by searching. Enable the Starlight search UI in `astro.config.mjs`; verify the static Pagefind index builds with the initial content set. No extra dependency beyond Starlight. Even with a small initial page count, search is present and grows automatically as registry-driven pages are added.

## Open questions
- Per-feature fixture richness — minimal vs. fully populated (diffs, flows)?
- Clock-freeze mechanism: Playwright `clock` API vs. env-injected fixed time in the dashboard.
- Final category names/order for non-technical readers (validate with one real user?).
