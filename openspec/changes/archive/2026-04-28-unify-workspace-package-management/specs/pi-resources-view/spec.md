## ADDED Requirements

### Requirement: Resources tab SHALL be a pure browse surface

The first tab in `PiResourcesView` SHALL be labeled "Resources" (rendered text). Its purpose SHALL be to browse pi-resource files (skills, extensions, prompts) loose in `<cwd>/.pi/` or `~/.pi/agent/`, plus the resources contributed by each installed package. The tab SHALL NOT render standalone manage rows for installed packages (no "uninstall" buttons, no version pills, no source-type badges at the top level). Per-package nested resource trees SHALL remain (a 📦 collapsible whose children are the Skills/Extensions/Prompts the package contributes).

The internal route id SHALL remain `"installed"` to preserve existing test selectors and route deep-links; only the rendered label and `data-testid`s change.

#### Scenario: Tab label reads "Resources"

- **WHEN** `PiResourcesView` renders its tab bar
- **THEN** the first tab's visible text is `"Resources"` (not `"Installed"`)
- **AND** the second tab's text remains `"Packages"`

#### Scenario: Loose `.pi/` files render under their scope

- **WHEN** `<cwd>/.pi/skills/foo/SKILL.md`, `<cwd>/.pi/extensions/bar.ts`, and `<cwd>/.pi/prompts/baz.md` exist
- **THEN** the Resources tab's "Local" section renders a `Skills (1)` group, an `Extensions (1)` group, and a `Prompts (1)` group
- **AND** each entry is clickable (opens the file in the content area)
- **AND** no entry has an Uninstall button

#### Scenario: Per-package nested resource trees render

- **WHEN** the workspace has `packages: ["npm:pi-flows"]` installed
- **AND** `pi-flows` contributes 4 skills and 2 extensions to the session
- **THEN** the Resources tab's "Local" section renders a 📦 `pi-flows` collapsible
- **AND** expanding it reveals `Skills (4)` and `Extensions (2)` sub-groups
- **AND** clicking an individual skill/extension opens the file (read-only)
- **AND** the 📦 row has no Uninstall button (manage actions live in the Packages tab)

#### Scenario: Installed package with no contributed resources still renders nothing standalone

- **WHEN** the workspace has `packages: ["/abs/path/library-only"]` installed
- **AND** `library-only` contributes zero skills/extensions/prompts
- **THEN** the Resources tab does NOT render a 📦 row for `library-only`
- **AND** the package still appears with full management UI in the Packages tab

### Requirement: Packages tab SHALL be the only workspace-scope manage surface

The Packages tab in `PiResourcesView` SHALL host the workspace-scope install / update / uninstall workflow. It SHALL render `PackageBrowser` with `scope="local"` and `cwd={folderCwd}`. The tab SHALL be discoverable to users who installed a non-npm package and want to remove it (via the Installed Packages section described in the `package-browse` spec).

#### Scenario: Packages tab is the sole workspace-scope uninstall path

- **WHEN** the workspace has a local-path package installed (`/home/me/my-ext`)
- **THEN** the Packages tab's Installed Packages section renders a `PackageRow` for it with an `Uninstall` button
- **AND** the Resources tab does not render a manage row for it
- **AND** clicking `Uninstall` issues `POST /api/packages/remove { source: "/home/me/my-ext", scope: "local", cwd }`
