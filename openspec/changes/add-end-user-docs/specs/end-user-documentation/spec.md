# end-user-documentation — delta

## ADDED Requirements

### Requirement: Categorized navigable docs surface at /docs
The Astro `site/` app SHALL serve end-user documentation at `/docs` using `@astrojs/starlight`, with a category sidebar, per-page table of contents, and prev/next navigation. Docs SHALL be authored in Markdown/MDX and build statically (no server, deterministic `npm run build`). The docs surface SHALL be skinned with the site's own theme tokens (`--pi-*` colors, Inter/JetBrains Mono fonts) and SHALL NOT alter the marketing landing page.

#### Scenario: User browses docs by category
- **WHEN** a user opens `/docs`
- **THEN** a sidebar SHALL list feature categories (Getting Started, Your Sessions, Chat & Prompts, Tools, Flows & Subagents, Git & Workspaces, OpenSpec & Packages, Mobile/Sharing/Settings)
- **AND** selecting a feature SHALL open its page with prev/next links and an on-page table of contents

#### Scenario: Docs inherit site theme
- **WHEN** the docs render in light or dark mode
- **THEN** colors and fonts SHALL match the site's `--pi-*` tokens
- **AND** a single theme toggle SHALL drive both the site's `.dark` class and Starlight's `data-theme`

### Requirement: Docs are searchable at launch
The docs surface SHALL ship full-text search (Pagefind, bundled with Starlight) enabled from first release. The search index SHALL be built statically at site build time (no runtime/server dependency) and SHALL cover documented feature pages. The search UI SHALL inherit the site's theme tokens.

#### Scenario: User searches for a feature
- **WHEN** a user opens `/docs` and types a feature name or keyword into search
- **THEN** matching documentation pages SHALL appear in results
- **AND** results SHALL be served from the static build-time index with no server call

### Requirement: Feature registry is single source of truth for docs and screenshots
A hierarchical registry (`site/src/content/docs-registry.ts`) SHALL declare main features, sub-features, and typed capture targets (`view | component | dialog`), each tagged with its source OpenSpec capability and a route or `data-testid`. The registry SHALL drive BOTH the docs page/sidebar structure AND the screenshot capture set. Adding one registry entry SHALL produce both a doc page and its screenshots.

#### Scenario: Adding a feature extends docs and shots together
- **WHEN** a new `FeatureNode` is added to the registry
- **THEN** its docs page SHALL appear in the correct sidebar category
- **AND** its declared shot targets SHALL be included in the next `npm run screenshots` run

#### Scenario: Only user-facing features documented
- **WHEN** the registry is populated from OpenSpec specs
- **THEN** internal/engineering capabilities (e.g. `jiti-loader`, `ws-ping-pong`, `*-decomposition`) SHALL be excluded
- **AND** each documented feature SHALL reference its source spec for provenance

### Requirement: Reproducible screenshot capture of declared targets
`npm run screenshots` SHALL capture the SAME set of declared targets (the specific view, component, or dialog named in the registry) on every run, against a fixture-seeded dashboard (Option B), not the live dashboard. Capture SHALL be deterministic-enough: rich fixed fixtures, frozen clock, disabled animations — so repeated runs are visually stable. Generated PNGs SHALL be committed.

#### Scenario: Two runs capture the same areas
- **WHEN** `npm run screenshots` is run twice with no code changes
- **THEN** both runs SHALL capture the identical set of named targets (same components/views/dialogs)
- **AND** the resulting images SHALL be visually stable (no drift from timestamps, random data, or mid-animation frames)

#### Scenario: Docs do not use the live dashboard
- **WHEN** docs screenshots are generated
- **THEN** they SHALL come from a fixture-seeded dashboard
- **AND** SHALL NOT depend on the contributor's real sessions or data

### Requirement: Screenshots are theme-aware and include cutouts
Each capture target SHALL be shot in both dark and light themes across desktop and mobile viewports. In addition to full-page `view` shots, the pipeline SHALL produce element `cutout` shots for `component` and `dialog` targets via `getByTestId(...)`. `dialog` targets SHALL be driven into their open state via declared `openVia` interaction steps before capture. The docs SHALL display the image matching the reader's active theme.

#### Scenario: Image swaps with docs theme
- **WHEN** a reader toggles between light and dark in the docs
- **THEN** each screenshot SHALL swap to the matching light/dark image without flicker

#### Scenario: Dialog cutout captured
- **WHEN** a target is `kind: "dialog"` with `openVia` steps and a `testid`
- **THEN** the pipeline SHALL run the steps to open the dialog
- **AND** capture a cropped cutout of the dialog element only
