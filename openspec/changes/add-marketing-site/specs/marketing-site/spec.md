# Spec Delta: marketing-site

## ADDED Requirements

### Requirement: Public marketing site source

The repository SHALL contain a self-contained marketing site at `/site/` built with Astro + Tailwind + MDX, producing a fully static output.

#### Scenario: Site builds independently of the main app

- **GIVEN** a fresh clone of the repository
- **WHEN** a developer runs `cd site && npm ci && npm run build`
- **THEN** the build succeeds without depending on the root workspace, the `packages/*` workspaces, or any main-app build artifacts
- **AND** output is written to `site/dist/` as static HTML/CSS/JS assets

#### Scenario: Site declares "Pi blue" design tokens

- **GIVEN** the site's Tailwind configuration
- **WHEN** the config is loaded
- **THEN** it defines slate-950 as the default background, indigo-400 and violet-500 as accent colors, and CSS variables for glow gradients and dot-grid background

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

The site SHALL present the product's features as a bento-style grid of at least 12 cards with asymmetric sizing.

#### Scenario: Features rendered from data

- **GIVEN** a feature list declared in `site/src/content/features.ts`
- **WHEN** the Features section renders
- **THEN** the `BentoGrid` component reads that list and renders a responsive 12-column grid where each card's column/row span is driven by the data entry

#### Scenario: Every feature card has accessible imagery

- **GIVEN** any feature card that embeds a screenshot
- **WHEN** the card is rendered
- **THEN** the `<img>` has a descriptive `alt` attribute that names the feature

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
