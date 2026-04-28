## ADDED Requirements

### Requirement: PackageBrowser SHALL render an Installed Packages section

The `PackageBrowser` component SHALL render a dedicated "Installed Packages" section above the search results. The section SHALL list every row returned by `useInstalledPackages(scope, cwd)` whose `isRecommended === false` (recommended ones already render in the existing `RecommendedExtensions` panel). Each row SHALL be a `PackageRow` and SHALL display source-type badges via `classifySource(pkg.source)`. The section SHALL render the same way regardless of source shape — `npm:`, absolute path, relative path, `file://`, `git://`, `https://...git`, and bare git URLs all SHALL produce a row with `Update` and `Uninstall` actions.

#### Scenario: npm-source row in workspace scope

- **WHEN** the workspace `<cwd>/.pi/settings.json` has `packages: ["npm:pi-flows"]`
- **THEN** `PackageBrowser` renders a `PackageRow` with `source="npm:pi-flows"` and `sourceType="npm"`
- **AND** the row exposes `Update` and `Uninstall` buttons

#### Scenario: local-path row in workspace scope

- **WHEN** the workspace `<cwd>/.pi/settings.json` has `packages: ["/abs/path/my-ext"]`
- **THEN** `PackageBrowser` renders a `PackageRow` with `source="/abs/path/my-ext"` and `sourceType="local"`
- **AND** the row exposes a working `Uninstall` button

#### Scenario: git-source row in workspace scope

- **WHEN** the workspace `<cwd>/.pi/settings.json` has `packages: ["git@github.com:user/repo.git"]`
- **THEN** `PackageBrowser` renders a `PackageRow` with `sourceType="git"`
- **AND** the row exposes a working `Uninstall` button

#### Scenario: empty installed list does not render the section header

- **WHEN** the workspace settings.json `packages[]` is empty
- **AND** there are no recommended extensions installed
- **THEN** `PackageBrowser` does not render the "Installed Packages" section header (no empty heading)
- **AND** the search-results area renders normally

### Requirement: Uninstall and update calls SHALL pass `pkg.source` verbatim

When a `PackageRow` in the Installed Packages section invokes `onUninstall` or `onUpdate`, the client SHALL call `operations.remove(pkg.source)` or `operations.update(pkg.source)` with the original `pkg.source` string from the server's `InstalledPackage` row. The client SHALL NOT regex-extract an npm name, prepend an `npm:` prefix, or otherwise reshape the source.

#### Scenario: local-path uninstall uses raw source

- **WHEN** the user clicks `Uninstall` on a row whose `pkg.source === "/home/me/my-ext"`
- **THEN** the client invokes `operations.remove("/home/me/my-ext")` (the original path string)
- **AND** the corresponding `POST /api/packages/remove` body has `{ source: "/home/me/my-ext", scope, cwd }`

#### Scenario: git-source update uses raw source

- **WHEN** the user clicks `Update` on a row whose `pkg.source === "git@github.com:user/repo.git"`
- **THEN** the client invokes `operations.update("git@github.com:user/repo.git")`

### Requirement: Cross-scope installed badges SHALL be keyed by `source`

The `PackageBrowser`'s `installedInfo` map SHALL be keyed by `pkg.source` (the canonical source string from the server). Cross-scope detection SHALL work for every source shape, not only `npm:<name>`. The npm-name regex extraction at `PackageBrowser.tsx:35-49` (pre-change) SHALL be removed.

#### Scenario: local-path installed in both scopes shows cross-scope badge

- **WHEN** the workspace settings.json has `packages: ["/abs/path/foo"]`
- **AND** the global settings.json also has `packages: ["/abs/path/foo"]`
- **AND** the user is viewing `PackageBrowser` with `scope="local"`
- **THEN** the `/abs/path/foo` row shows a "also installed in global" badge

#### Scenario: search-result row for a package installed in workspace shows local-scope badge

- **WHEN** the user searches `npm` and a result for `pi-flows` appears
- **AND** `pi-flows` is installed in the workspace (`source === "npm:pi-flows"`)
- **THEN** the search-result `PackageCard` shows the "installed locally" badge using a synthesized `npm:${pkg.name}` lookup against the source-keyed map

### Requirement: PackageBrowser SHALL NOT render an "Installed" filter pill

The previous "Installed" filter pill in the type-filter row SHALL be removed. The Installed Packages section above replaces its function. No control SHALL exist for filtering the search results to installed packages only.

#### Scenario: Filter pill is absent

- **WHEN** `PackageBrowser` renders
- **THEN** no `data-testid="package-installed-filter"` element exists
- **AND** the type-filter row contains only the four type pills (extension/skill/theme/prompt)

#### Scenario: Synthetic-installed-card path is removed

- **WHEN** a non-npm package (e.g. `/abs/path/foo`) is installed
- **THEN** no synthetic `PackageCard` is rendered for it in the search-results grid
- **AND** the package appears only in the Installed Packages section (as a `PackageRow`)
