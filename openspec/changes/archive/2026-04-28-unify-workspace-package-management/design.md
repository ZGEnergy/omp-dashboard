## Context

The proposal locks in direction A: **the workspace's "Packages" tab becomes
the only manage surface, and the "Installed" tab becomes a pure browse
surface (renamed "Resources").** This mirrors the global UI's existing
treatment, where loose files are not shown alongside installed packages.

The fix reuses three components that already ship in production via
`consolidate-packages-settings-ui`:

- `PackageRow` — generic, source-type-badged row with optional
  Update/Uninstall/View-README/Reset actions.
- `classifySource(source)` — pure function returning `"npm" | "git" |
  "local" | "global"`.
- `groupInstalledPackages(rows, coreNpmNames)` — pure split into
  Recommended / Other.

All three are scope-agnostic. The workspace UI today does not consume
them; it consumes a npm-only synthetic-`PackageCard` path inside
`PackageBrowser` and a mixed loose-files-plus-packages renderer in
`MergedScopeSection`. This design replaces both with the production-tested
machinery.

## Goals / Non-Goals

**Goals:**
- Workspace-scope installed packages render with the same component
  surface as global-scope installed packages (`PackageRow`).
- Local-path, git, and npm sources have working install / update /
  uninstall buttons in the workspace UI.
- The workspace "Resources" tab is a single-purpose browse surface:
  loose `.pi/` files + per-package nested resource trees. No standalone
  📦 manage rows.
- Cross-scope badges (`"also installed in <other>"`) work for every
  source shape, keyed by `pkg.source` not by extracted name.
- Tab renamed from "Installed" to "Resources" so the new contract is
  self-evident on first encounter.
- Existing search & install affordance in the Packages tab survives
  unchanged (the search bar, type filter pills, URL input, recommended
  extensions section).

**Non-Goals:**
- Server-side changes. `installed-package-enricher.ts` already returns
  every field `PackageRow` needs.
- Protocol changes. `PackageOperationCompleteMessage`,
  `InstalledPackage`, etc. stay verbatim.
- Restructuring `UnifiedPackagesSection`. The global UI is the
  reference implementation, not the work product.
- A delete affordance for loose `.pi/` files. They stay view-only.
- Settings-tab consolidation. The Settings → Pi Ecosystem surface
  remains the global manage authority; the workspace Packages tab is
  the workspace-scope mirror.
- Replacing `PackageCard` for the search-results path. Search results
  are `NpmPackageResult` rows from the npm registry — they don't
  carry a `source` string yet, so `PackageCard`'s npm-name-driven
  rendering is correct there.

## Decisions

### D1. Add an "Installed Packages" section above search in `PackageBrowser`

The new section sits between the existing `RecommendedExtensions` panel
and the URL-input row. It renders rows from `useInstalledPackages(scope,
cwd)` filtered to `isRecommended === false` (recommended ones already
appear above), each as a `PackageRow` with:

```ts
<PackageRow
  source={pkg.source}
  sourceType={classifySource(pkg.source)}
  displayName={pkg.displayName ?? pkg.source}
  currentVersion={pkg.version}
  // ...
  onUninstall={() => operations.remove(pkg.source)}     // raw source
  onUpdate={() => operations.update(pkg.source)}        // raw source
/>
```

`pkg.source` flows verbatim — same as `UnifiedPackagesSection.tsx:189`.
Local-path, git, and npm all uninstall through the same call shape.

**Why a section, not a tab subdivision:** users expect "Packages" to
contain everything related to packages in this scope. A separate tab
("Manage" vs "Search") would force two tab transitions for a workflow
that should be one (find → install, see → uninstall). The vertical
section split in `UnifiedPackagesSection` is exactly this layout, and it
works.

**Alternatives considered:**

- **A. Move all installed-package management into Settings only and make
  the workspace Packages tab search-only.** Rejected: contradicts the
  workspace-scoped mental model. Users installing into `<cwd>/.pi/`
  expect to manage those installs in the workspace UI.
- **B. Keep the "Installed" filter pill in the search results and add
  uninstall buttons to `PackageCard`.** Rejected: doesn't help non-npm
  sources, since `PackageCard` is keyed by `pkg.name` from the npm
  registry. Also keeps the synthetic-card path that's the source of
  the original bug.
- **C. Leave the "Installed" filter pill but switch its rendered rows
  to `PackageRow` while keeping the search-results path on
  `PackageCard`.** Rejected: gives one tab two visually inconsistent
  row layouts ("filter on" → list rows, "filter off" → grid cards).
  Confusing.

### D2. Drop the `PackageBrowser` "Installed" filter pill

The dedicated "Installed Packages" section makes the filter pill
redundant — the user no longer needs to "filter the search results to
installed" to find installed packages, because they're listed
explicitly above search. Remove the pill button entirely.

**Side benefit:** removes the synthetic-`PackageCard` loop at
`PackageBrowser.tsx:95-122` that's the source of the original
non-npm-drops bug. No regex parsing, no `npm:`-prefix guessing.

### D3. Remove standalone 📦 rows from `MergedScopeSection`

The `MergedScopeSection` today renders `packages[]` entries (from
`scanPiResources(cwd)`) as collapsible 📦 rows alongside loose
Skills/Extensions/Prompts groups. This conflation is the second bug
the user reported. Remove the standalone 📦 rendering.

**Keep:** the per-package nested resource trees (`PackageItem`
internals — Skills (4), Extensions (2), Prompts (0)). These answer
"what does this package contribute to my session?" which is a *browse*
question, legitimately part of the Resources tab. They render as nested
collapsibles within the per-scope (Local/Global) groups, just no
longer alongside an "uninstall me" affordance.

**Alternative considered:**
- **A1. Drop the per-package nested resources too, leaving Resources
  tab as loose-files-only.** Rejected: users want to see what skills
  a package contributes without going to GitHub. The package-as-
  contributor view is browse-relevant.

### D4. Tab rename "Installed" → "Resources"

Tab labels in `PiResourcesView` are an enum literal: `"installed" |
"packages"`. The internal id stays `"installed"` (no need to break
existing test selectors); only the rendered label changes:

```ts
{tab === "installed" ? "Resources" : "Packages"}
```

`data-testid="resources-tab-bar"` and individual tab `data-testid`s
get a parallel rename for clarity, but with the existing aliases kept
through one minor release for any external selectors.

**Alternative considered:**
- **B1. Keep "Installed" label.** Rejected — the user explicitly chose
  the rename in the scope batch.

### D5. Cross-scope badges keyed by `pkg.source`

`PackageBrowser`'s `installedInfo` map currently extracts the npm name
from each source via regex and double-keys the map by both name and
`npm:<name>`. Replace with single-key-by-`source` lookups:

```ts
const installedInfo = useMemo(() => {
  const map = new Map<string, { own: boolean; other: boolean }>();
  for (const p of installedOwn.packages) map.set(p.source, { own: true, other: false });
  for (const p of installedOther.packages) {
    const e = map.get(p.source) ?? { own: false, other: false };
    e.other = true;
    map.set(p.source, e);
  }
  return map;
}, [installedOwn.packages, installedOther.packages]);
```

Search-results rows (which have `pkg.name` from npm registry but no
`pkg.source`) still need badge lookup; reconstruct their source as
`npm:${pkg.name}` at lookup time. Non-npm cross-scope badges work
automatically because installed-packages-section rows have a real
`pkg.source` to look up.

## Risks / Trade-offs

- **[Risk: Tab rename breaks bookmarks / muscle memory.]** → Mitigation:
  same icon, same position, same internal route id (`"installed"`).
  Documented in CHANGELOG with a one-line user note.

- **[Risk: Removing the "Installed" filter pill is a visible UX
  regression for users who used it.]** → Mitigation: the new "Installed
  Packages" section serves the same need with a clearer surface (no
  toggle needed; always visible). The old pill effectively did "show
  me only installed npm packages" — the new section shows installed
  packages of every shape, more useful.

- **[Risk: Per-package nested resource trees in Resources tab clutter
  the view if a workspace has many installed packages.]** → Mitigation:
  per-package nodes are collapsible (already implemented). A future
  change can add a "expand all / collapse all" if needed; not in scope.

- **[Trade-off: Two manage surfaces (workspace Packages tab + global
  Settings) is more code than one.]** → Acceptance: scope separation is
  more important than DRY here. The workspace UI manages `<cwd>/.pi/
  settings.json`; Settings manages `~/.pi/agent/settings.json`. Different
  files, different scopes, different blast radius — keep separate UIs.

## Migration Plan

None. Pure SPA bundle change.

- **Deploy:** rebuild client (`npm run build`), restart server (`POST
  /api/restart`). No bridge reload, no protocol change, no settings
  migration, no config flip.
- **Rollback:** revert the changed files. No persisted state to unwind.

## Open Questions

None. The four design decisions cover every UI shape choice; the
component-reuse path is grounded in existing production code.
