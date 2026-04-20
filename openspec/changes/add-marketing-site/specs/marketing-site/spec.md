# Spec Delta: marketing-site

## ADDED Requirements

### Requirement: Public marketing site source

The repository SHALL contain a self-contained marketing site at `/site/` built with Astro + Tailwind + MDX, producing a fully static output.

#### Scenario: Site builds independently of the main app

- **GIVEN** a fresh clone of the repository
- **WHEN** a developer runs `cd site && npm ci && npm run build`
- **THEN** the build succeeds without depending on the root workspace, the `packages/*` workspaces, or any main-app build artifacts
- **AND** output is written to `site/dist/` as static HTML/CSS/JS assets

#### Scenario: Site declares "Pi blue" design tokens as CSS variables

- **GIVEN** the site's Tailwind configuration and `global.css`
- **WHEN** the stylesheet loads
- **THEN** every `pi-*` Tailwind color resolves through a CSS variable of
  the form `rgb(var(--pi-xxx) / <alpha-value>)` so opacity utilities still
  work, and both `:root` (light) and `:root.dark` declare a complete set of
  these variables covering bg, surface, surface-alt, border, fg, muted,
  accent, accent2, success, and warn

### Requirement: Theme selector with System / Light / Dark and no FOUC

The site SHALL support a System / Light / Dark theme selector with
pre-paint resolution of the initial theme.

#### Scenario: First paint matches the resolved theme

- **GIVEN** a visitor with `localStorage.pi-theme` unset and an OS set to
  dark mode
- **WHEN** they load the site for the first time
- **THEN** an inlined script in `<head>` resolves the theme to "dark" and
  sets `class="dark"` on `<html>` before any stylesheet parses, so no
  flash of light content appears

#### Scenario: Explicit choice is persisted across reloads

- **GIVEN** a visitor who clicks the Light option in the theme toggle
- **WHEN** they reload the page
- **THEN** `<html>` does not carry the `dark` class and
  `localStorage.pi-theme` is `"light"`

#### Scenario: System mode tracks OS changes live

- **GIVEN** a visitor in System mode
- **WHEN** they toggle their OS color-scheme preference while the page is
  open
- **THEN** the site's theme updates to match without a reload

#### Scenario: Hero and feature mockups swap per theme

- **GIVEN** a visitor switches between light and dark modes
- **WHEN** the hero animation and feature bento grid re-render
- **THEN** each dashboard mockup image flips between a dark-themed PNG
  (under `site/public/screenshots/desktop/`) and a light-themed PNG
  (under `site/public/screenshots/desktop-light/`) via CSS-driven
  visibility (`dark:block` / `dark:hidden`) so the mockups always match
  the active theme

### Requirement: Storytelling hero animation

The site SHALL render an animated hero that crossfades through multiple dashboard states to showcase the product visually.

#### Scenario: Hero cycles through 4 states

- **GIVEN** a user visits the site on a device that does not set `prefers-reduced-motion: reduce`
- **WHEN** the page loads
- **THEN** the hero mockup displays one of four dashboard states (sessions, chat, flows, mobile) and transitions to the next state every 6 seconds with a crossfade, slight scale, and translateY motion

#### Scenario: Hero respects reduced motion

- **GIVEN** a user with `prefers-reduced-motion: reduce` set
- **WHEN** the page loads
- **THEN** the hero freezes on the first state, the background hue does not shift, and card pulse animations are disabled

#### Scenario: Hero pauses on hover

- **GIVEN** the hero animation is cycling
- **WHEN** the user hovers the mockup on a pointer device, or touches it on a touch device
- **THEN** the state-cycle timer pauses until the pointer leaves or the touch ends

### Requirement: Why section articulates TUI-vs-GUI and remote-delegation arguments

The site SHALL include a "Why" section with two dedicated cards, one for each of the two core arguments the project makes against a pure-TUI workflow.

#### Scenario: Information-density card is present

- **GIVEN** a user scrolls to the Why section
- **WHEN** the section renders
- **THEN** one card explicitly argues that a graphical interface increases information density compared to a TUI and that the size of information can reflect its importance

#### Scenario: Remote-delegation card is present

- **GIVEN** a user scrolls to the Why section
- **WHEN** the section renders
- **THEN** the second card explicitly argues that pi sessions can run on a remote server and be controlled from mobile devices, without requiring SSH, tmux, or a laptop

### Requirement: Features bento grid

The site SHALL present the product's features as a bento-style grid with
asymmetric sizing that covers all of the dashboard's headline features.

#### Scenario: Features rendered from data

- **GIVEN** a feature list declared in `site/src/content/features.ts`
- **WHEN** the Features section renders
- **THEN** the `BentoGrid` component reads that list and renders a responsive 12-column grid where each card's column/row span is driven by the data entry

#### Scenario: Grid rows have no gaps

- **GIVEN** the bento grid's feature entries
- **WHEN** the sum of `col-span` values per grid row is computed
- **THEN** every row's declared spans total exactly 12 so that CSS grid
  auto-placement leaves no empty cells

#### Scenario: Embedded code-server / VS Code feature is included

- **GIVEN** the features list
- **WHEN** it is rendered
- **THEN** there is a dedicated card for the embedded editor / code-server
  integration, with its own screenshot and copy describing lazy-start and
  per-workspace behavior

#### Scenario: Every feature card has accessible imagery

- **GIVEN** any feature card that embeds a screenshot
- **WHEN** the card is rendered
- **THEN** the `<img>` has a descriptive `alt` attribute that names the feature

### Requirement: Newcomer-friendly "What is pi?" introduction

The site SHALL include an introductory section between the hero and the
big-idea section that explains what pi is for visitors unfamiliar with it.

#### Scenario: Hero subhead links to the explainer

- **GIVEN** the rendered hero
- **WHEN** a visitor reads the subhead
- **THEN** the word "pi" is an in-page link that jumps to the explainer
  section

#### Scenario: Explainer covers CLI, session, and non-replacement of TUI

- **GIVEN** the "What is pi?" section
- **WHEN** it renders
- **THEN** it describes pi as an open-source coding-agent CLI, introduces
  the term "session", and explicitly states that the dashboard does not
  replace the TUI but runs alongside it

### Requirement: Ambient mission-graph background

The site SHALL render an ambient, non-figurative animated background that
visually encodes the project's mission (many agents → bridged events → any
device).

#### Scenario: Graph is pure SVG and respects reduced motion

- **GIVEN** the rendered site
- **WHEN** the MissionGraph component is inspected
- **THEN** it is a single inline SVG styled by CSS (no additional JS
  shipped) and, under `prefers-reduced-motion: reduce`, all of its
  animations (edge flow, node twinkle, ping rings) are disabled

#### Scenario: Graph retints with the theme

- **GIVEN** a visitor switches between light and dark mode
- **WHEN** the MissionGraph re-renders
- **THEN** its node, edge, and ping colors follow the `--pi-accent` /
  `--pi-accent2` CSS variables so the graph reads correctly on both
  backgrounds

### Requirement: Scroll-triggered reveal animations

Cards, section headings, and key content blocks SHALL animate into view
when they enter the viewport, with staggered timing and reduced-motion
support.

#### Scenario: Elements reveal on first intersection

- **GIVEN** any element tagged with `data-reveal`
- **WHEN** the user scrolls and the element crosses into the viewport
- **THEN** the `.is-visible` class is added and a 700 ms CSS transition
  runs (opacity, translate, scale, blur) to bring it in

#### Scenario: Reveals do not re-fire on scroll-back

- **GIVEN** an element that has already been revealed
- **WHEN** the user scrolls it out of and back into the viewport
- **THEN** the observer does not re-observe the element and the element
  remains statically visible

#### Scenario: Reduced-motion users see no animation

- **GIVEN** a visitor with `prefers-reduced-motion: reduce`
- **WHEN** the page loads
- **THEN** every `[data-reveal]` element is visible immediately with no
  transform, blur, or transition

### Requirement: Playwright screenshot pipeline

The repository SHALL provide a scripted, re-runnable screenshot pipeline that captures every feature panel at desktop and mobile viewports.

#### Scenario: Pipeline runs end-to-end from a single command

- **GIVEN** a developer has installed dependencies in `/site`
- **WHEN** they run `npm run screenshots` from the repo root
- **THEN** the script starts a temporary dashboard server with a temp HOME, seeds it with demo fixtures, opens every route at each viewport with Playwright, writes PNGs to `site/public/screenshots/{desktop,mobile}/`, and shuts down the server

#### Scenario: Demo data is injected via existing REST or on-disk session files

- **GIVEN** the seeding step of the pipeline
- **WHEN** fixtures are applied
- **THEN** no new server-only flag or code path is required; all seeding uses existing REST endpoints or direct writes to `~/.pi/agent/sessions/` within the temp HOME

#### Scenario: Screenshots cover all named routes

- **GIVEN** the routes listed in `design.md`'s screenshot table
- **WHEN** the pipeline finishes
- **THEN** every listed route has a PNG at the expected path under `site/public/screenshots/`, at the declared viewport dimensions

### Requirement: Latest-release surface with auto-sync

The site SHALL prominently surface the latest published GitHub release
(version tag, publish date, per-platform downloads) and keep that
surface in sync without manual editing.

#### Scenario: Download section renders per-platform cards

- **GIVEN** a successful build with at least a cached release in
  `site/src/data/latest-release.json`
- **WHEN** the rendered page is inspected
- **THEN** there is a `#download` section that shows the release tag,
  publish date, links to release notes and the releases index, and three
  platform cards (macOS / Linux / Windows), each with a primary download
  button sized by the classifier (DMG for macOS, AppImage for Linux,
  Installer .exe for Windows) and any additional assets tucked into a
  collapsible “Other downloads” accordion

#### Scenario: Hero CTA reflects the current version

- **GIVEN** a successful build with a resolved release
- **WHEN** the hero renders
- **THEN** its primary CTA label is “Download <tag> →” and its href is
  the in-page anchor `#download`

#### Scenario: Build survives API outage via committed cache

- **GIVEN** the GitHub API is unreachable (timeout, 403, or 5xx)
- **WHEN** the site builds
- **THEN** `github-release.ts` falls back to
  `site/src/data/latest-release.json` and the Download section still
  renders the last known release with no HTML difference to the visitor

#### Scenario: Release publish updates the committed cache

- **GIVEN** a maintainer publishes a new GitHub release
- **WHEN** the `sync-release-version` workflow runs
- **THEN** it writes the latest release metadata to
  `site/src/data/latest-release.json` and, if the content changed,
  commits the file back to `main` with a message of the form
  `chore(site): sync latest-release.json to <tag>`

#### Scenario: Release event rebuilds and redeploys the site

- **GIVEN** the deploy-site workflow
- **WHEN** a GitHub release is published
- **THEN** the workflow runs via its `release: { types: [published] }`
  trigger, builds the site with fresh release data, and publishes via
  `actions/deploy-pages@v4`

### Requirement: GitHub Pages deployment via GitHub Actions

The repository SHALL deploy the marketing site to GitHub Pages using the modern `actions/deploy-pages` workflow, without using a `gh-pages` branch.

#### Scenario: Deploy workflow triggers on site changes

- **GIVEN** a commit to `main` that modifies any file under `site/**` or the deploy workflow itself
- **WHEN** the workflow runs
- **THEN** it builds the site, uploads the output as a Pages artifact, and deploys it via `actions/deploy-pages`

#### Scenario: Deploy workflow can be run manually

- **GIVEN** a maintainer needs to redeploy without a source change
- **WHEN** they trigger `workflow_dispatch` on the site-deploy workflow
- **THEN** the workflow runs to completion and publishes the current `main` content

#### Scenario: Custom-domain ready but not active

- **GIVEN** the site at v1 is served from `username.github.io/pi-agent-dashboard`
- **WHEN** a maintainer later acquires `pi-dashboard.dev`
- **THEN** the swap requires only adding a `site/public/CNAME` file and DNS records — no workflow or build changes

### Requirement: Performance and accessibility budgets

The site SHALL ship minimal JavaScript and meet accessibility baselines.

#### Scenario: JavaScript bundle budget

- **GIVEN** a successful site build
- **WHEN** the total gzipped size of `site/dist/**/*.js` is measured
- **THEN** it does not exceed 50 KB

#### Scenario: Lighthouse mobile targets

- **GIVEN** a Lighthouse mobile audit of the deployed site
- **WHEN** the audit completes
- **THEN** Performance, Accessibility, Best Practices, and SEO each score at least 95
