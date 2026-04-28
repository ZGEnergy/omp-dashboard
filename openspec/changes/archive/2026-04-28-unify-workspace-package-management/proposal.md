## Why

The dashboard has two workspace-package surfaces that disagree about what
"managing packages" means:

1. **Global** — Settings → Pi Ecosystem (`UnifiedPackagesSection`).
   Renders ONLY rows from `pm.listConfiguredPackages()` — i.e. the
   `packages[]` array in `~/.pi/agent/settings.json`. Loose
   `~/.pi/agent/{skills,extensions,prompts}/` files are deliberately not
   shown here; they're not packages. Each row uses `PackageRow` with
   `classifySource(pkg.source)` and `operations.remove(pkg.source)` — the
   raw source flows through, and every shape (`npm:foo`, `/abs/path/bar`,
   `git://host/x/y`) gets the same install/uninstall treatment.
2. **Workspace** — workspace card → Pi Resources view, with two tabs:
   - **Installed tab** (`MergedScopeSection`) — mixes loose `<cwd>/.pi/`
     files (skills, extensions, prompts the user authored) with installed
     packages from `packages[]` under one collapsible "Local" header. The
     📦 package rows have **no install/uninstall affordance at all**.
   - **Packages tab** (`PackageBrowser`) — search & install only.
     "Installed" filter pill drops every non-`npm:` source via the regex at
     `PackageBrowser.tsx:102`; even if a synthetic card existed, the
     hardcoded `operations.remove(\`npm:${pkg.name}\`)` call at line 264
     would 404 against any source whose canonical form isn't `npm:<name>`.

Three concrete user-visible bugs:

- **Local-path packages cannot be uninstalled from the workspace UI.** A
  user who installs `/home/me/my-ext` sees it briefly during install, then
  it vanishes from the Packages tab and surfaces in the Installed tab as a
  buttonless 📦 row. The only working uninstall path is to navigate
  Settings → Pi Ecosystem and find it under "Other Packages" — which
  contradicts the workspace-scoped mental model.
- **Loose `.pi/` files are mis-categorized as packages.** Workspace
  artifacts (`.pi/skills/foo/SKILL.md`) and installed packages
  (`📦 /abs/path/bar`) live under the same heading, despite having
  completely different semantics (the former are user-authored files, the
  latter are settings-tracked dependencies).
- **Cross-scope badges only work for npm sources.** `installedInfo` in
  `PackageBrowser` is keyed by name-extracted-via-regex, so a
  `/abs/path/foo` installed in both workspace and global never gets the
  "also installed in global" badge.

## What Changes

The user's locked-in direction: **apply the global treatment everywhere,
which means treating "package management" as a single concern with one
canonical UI shape.** Loose `.pi/` files belong in a browse surface
("what capabilities can my session use?"), not in a manage surface ("what
is in my packages[] array?"). This change separates the two concerns:

- **Repurpose the workspace's "Installed" tab as a pure browse surface.**
  Rename it to **"Resources"**. It keeps showing loose
  `<cwd>/.pi/{skills,extensions,prompts}` and `~/.pi/agent/{...}` files
  plus the per-package nested resources (📦 my-pkg → the skills it
  contributes). It STOPS showing 📦 rows as standalone manageable
  entries — the package itself becomes a *contributor of resources*, not
  a *thing-with-an-uninstall-button*.

- **Make the workspace's "Packages" tab the only workspace-scope manage
  surface.** Add an "Installed Packages" section above the search field,
  rendered with the same `PackageRow` + `classifySource(pkg.source)` +
  `operations.remove(pkg.source)` machinery as `UnifiedPackagesSection`.
  Local-path, git, and npm sources all get install/update/uninstall
  buttons that work — because the source string flows through verbatim,
  same as it does for the global UI.

- **Re-key cross-scope badges by `pkg.source`.** Drop the npm-only regex
  in `PackageBrowser.installedInfo`. Any source shape can be cross-scope-
  detected because `pkg.source` is the canonical identifier the server
  already uses.

- **Drop the synthetic-`PackageCard`-for-installed code path entirely.**
  The "Installed" filter pill in the search-results area was always a
  workaround for the missing manage surface. With the dedicated
  "Installed Packages" section above search, the filter pill is
  redundant. Remove it.

- **Add tests** that drive every source shape (`npm:`, `/abs/path/`, `git`)
  through the new "Installed Packages" section in PackageBrowser, plus a
  PiResourcesView test that asserts the Resources tab no longer renders
  package rows as standalone manageable entries (per-package nested
  resources stay).

This change is **client-only**. Server-side data is unchanged — the
enricher already returns rich enough `InstalledPackage` rows for
`PackageRow` to consume, and `scanPiResources` already returns separated
`local` / `global` / `packages` arrays. The fix is a pure UI reshape that
makes the workspace components reuse the global components' patterns.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities

- **`package-install`** — workspace-scope manage UI. New requirements:
  (1) workspace-scope installed packages SHALL render via the same
  `PackageRow` machinery as global, with source-shape parity (npm, git,
  local-path); (2) `operations.remove` SHALL receive `pkg.source`
  verbatim, never a regex-reshaped npm name; (3) cross-scope badges
  SHALL be keyed by `source` not by extracted name.

- **`pi-resource-view`** (or whatever spec covers `PiResourcesView` —
  to be confirmed during the specs phase). The "Installed" tab is
  renamed "Resources" and is a pure browse surface. Loose `.pi/` files
  and per-package nested resources stay; standalone 📦 manage rows
  (with implied install/uninstall semantics) move to the Packages tab.

> Will reconcile exact capability names against `openspec/specs/` during
> the specs phase. `package-install` exists; the resource-view spec name
> needs verification.

## Impact

**Affected client files:**
- `packages/client/src/components/PackageBrowser.tsx` — add "Installed
  Packages" section using `PackageRow`; remove npm-only regex filter and
  the hardcoded `npm:${pkg.name}` remove call; remove "installed" filter
  pill (now redundant).
- `packages/client/src/components/PiResourcesView.tsx` — rename tab
  label "Installed" → "Resources"; remove standalone 📦 package rows
  from `MergedScopeSection` (keep the per-package nested resource trees
  since those answer "what does this package give my session?").
- `packages/client/src/components/__tests__/PackageBrowser.*.test.tsx` —
  add per-source-shape regression tests.
- `packages/client/src/components/__tests__/PiResourcesView.*.test.tsx` —
  assert standalone 📦 rows don't appear in the Resources tab.

**No impact on:**
- `packages/shared/src/browser-protocol.ts` — message shapes unchanged.
- `packages/server/src/installed-package-enricher.ts` — server data
  unchanged.
- `packages/server/src/pi-resource-scanner.ts` — scanning unchanged;
  only client-side rendering of the scan output changes.
- `packages/client/src/components/UnifiedPackagesSection.tsx` — already
  correct; this change makes the workspace UI match it.
- `packages/client/src/components/PackageCard.tsx` — still used for the
  search-results path (rendering `NpmPackageResult` from the npm
  registry); only the *installed-card* synthetic path is dropped.
- `packages/client/src/components/PackageRow.tsx` — already generic;
  no changes needed.

**User impact:**
- Local-path and git-source installed packages get a working uninstall
  button in the workspace Packages tab.
- Resources tab is a clean, single-purpose browse surface — no more
  buttonless 📦 rows that look like they should do something.
- Cross-scope "also installed in <other>" badges work for every source
  shape, not just npm.
- The renamed tab ("Installed" → "Resources") is a small mental-model
  shift; the tooltip / first-render of the tab makes the intent clear.

**Risk:**
- Low-medium. The fix reuses well-tested components (`PackageRow`,
  `classifySource`, `groupInstalledPackages`) that ship in production
  via `consolidate-packages-settings-ui`. The biggest risk is the
  Resources-tab rename — users who memorized "Installed" will need a
  brief re-orientation. Mitigation: keep the tab in the same position
  with the same icon; the structural separation (browse vs manage) is
  more discoverable than the current mixed-bucket layout.
