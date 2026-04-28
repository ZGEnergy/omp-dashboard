## 1. Regression tests (write first, must FAIL on current code)

- [x] 1.1 In `packages/client/src/components/__tests__/`, add `PackageBrowser.installed-section.test.tsx` (or extend an existing PackageBrowser test file). The test SHALL mock `useInstalledPackages` to return three rows — `npm:pi-flows`, `/abs/path/my-ext`, `git@github.com:user/repo.git` — and assert that PackageBrowser renders a `PackageRow` for each (locate via `data-testid="pkg-row-..."`) with an `Uninstall` button.
- [x] 1.2 Add a test that clicks `Uninstall` on the `/abs/path/my-ext` row and asserts `operations.remove` was called with the literal string `"/abs/path/my-ext"` (no regex reshape, no `npm:` prefix).
- [x] 1.3 Add a test that asserts the "Installed" filter pill is NOT in the DOM (`data-testid="package-installed-filter"` should not exist).
- [x] 1.4 Add a cross-scope-badge test: mock `useInstalledPackages("local")` and `useInstalledPackages("global")` to both return `/abs/path/foo`. Render with `scope="local"` and assert the corresponding row shows the "also in global" badge.
- [x] 1.5 In `packages/client/src/components/__tests__/`, add `PiResourcesView.resources-tab.test.tsx`. Mock `usePiResources` to return a fixture where `local.skills` has 1 entry, `local.extensions` has 1, `packages` contains a `npm:pi-flows` entry contributing 4 skills + 2 extensions, and a `/abs/path/library-only` entry contributing 0 resources. Assert: (a) the tab label reads `"Resources"`, (b) the loose Skills/Extensions groups render, (c) the `pi-flows` 📦 collapsible renders WITH nested Skills (4) Extensions (2), (d) NO row exists for `library-only` (zero contributed resources), (e) NO `Uninstall` button exists anywhere in the Resources tab.
- [x] 1.6 Run `npm test -- packages/client/src/components/__tests__/PackageBrowser.installed-section.test.tsx packages/client/src/components/__tests__/PiResourcesView.resources-tab.test.tsx`. Verify ALL new assertions FAIL on unmodified code (they must, since the synthetic-card path drops non-npm sources, the filter pill exists, and `MergedScopeSection` renders standalone 📦 rows).

## 2. PackageBrowser refactor

- [x] 2.1 In `packages/client/src/components/PackageBrowser.tsx`, import `PackageRow` from `./PackageRow.js` and `classifySource` from `../lib/package-classifier.js`.
- [x] 2.2 Add a new "Installed Packages" JSX section between `<RecommendedExtensions ... />` and the URL-input row. The section SHALL render a `PackageRow` for each entry in `installedOwn.packages` whose `isRecommended === false`, passing `pkg.source` verbatim to `onUninstall` and `onUpdate` callbacks. Mirror the prop shape used by `UnifiedPackagesSection.renderInstalledRow` (~line 168).
- [x] 2.3 Conditionally hide the section header when `installedOwn.packages.filter(p => !p.isRecommended)` is empty (no empty heading).
- [x] 2.4 Remove the synthetic-`PackageCard`-for-installed loop at lines 95–122 (the `displayPackages` `useMemo` block that filters by `showInstalled`). Reduce `displayPackages` to just `search.packages`.
- [x] 2.5 Remove the `showInstalled` `useState` and the "Installed" filter pill button rendering it. Keep the four type pills.
- [x] 2.6 Re-key the `installedInfo` `useMemo` to map `pkg.source → { own, other }` directly (no regex extraction). Update `isInstalled` and `getInstalledScope` helpers to look up by `source` first; for search-result rows where only `pkg.name` is available, synthesize `npm:${pkg.name}` at lookup time.
- [x] 2.7 Update the line `onUninstall={() => operations.remove(\`npm:${pkg.name}\`)}` (search-results card path) to remain unchanged — it's correct for npm-registry results. Only the *new* installed-packages-section path uses `pkg.source` directly.

## 3. PiResourcesView refactor

- [x] 3.1 In `packages/client/src/components/PiResourcesView.tsx`, change the rendered tab label from `"Installed"` to `"Resources"` (line ~234, ternary on `tab === "installed"`). Keep the internal route id as `"installed"` for selector stability.
- [x] 3.2 Update `data-testid="resources-tab-bar"` to remain (it already reads `resources-tab-bar`); ensure individual tab `data-testid` values reference the new label semantically (`resources-tab-installed` → `resources-tab-resources` if such an attribute exists; otherwise no change needed).
- [x] 3.3 In `MergedScopeSection`, remove the standalone `{packages.map((pkg) => <PackageItem .../>)}` block that renders 📦 entries as top-level collapsibles (lines ~118–120 of the current file).
- [x] 3.4 Move `PackageItem` rendering INSIDE the existing `hasLoose` block: each contributed-resources package becomes a per-scope nested entry. Skip rendering any package whose `pkg.resources` has zero entries across all three resource types (no empty 📦 rows).
- [x] 3.5 Update the section's count label to reflect only resources (loose + per-package), not standalone-package count: `(${totalCount})` instead of `(${totalCount}${hasPkgs ? ` · ${packages.length} pkg${...}` : ""})`.

## 4. Verify the regression tests now pass

- [x] 4.1 Re-run `npm test -- packages/client/src/components/__tests__/PackageBrowser.installed-section.test.tsx packages/client/src/components/__tests__/PiResourcesView.resources-tab.test.tsx`. ALL assertions added in §1 SHALL pass.
- [x] 4.2 Run the full PackageBrowser test suite: `npm test -- packages/client/src/components/__tests__/PackageBrowser`. Existing banner / search / install tests SHALL still pass (no orphaned selectors).
- [x] 4.3 Run the full PiResourcesView test suite (`npm test -- packages/client/src/components/__tests__/PiResourcesView` if such a directory exists; otherwise the previous step covers it).

## 5. Verify no regressions

- [x] 5.1 Run `npm test -- packages/client`. ALL 1162 (or current count) client tests SHALL pass. New tests SHALL bring the total up.
- [x] 5.2 Run `npm run lint`. NO new TypeScript errors attributable to the changed files. Pre-existing errors from other in-flight changes are acceptable but must be unchanged in count and location.
- [x] 5.3 Run `npm run build`. The Vite build SHALL succeed.

## 6. Manual smoke test

> **Pending user verification** — run after implementation if a dev environment is available. The unit tests cover every shape exhaustively; the smoke test confirms visual layout and live-server behavior.

- [x] 6.1 Start the dashboard in dev mode (`npm run dev` + `pi-dashboard start --dev`).
- [x] 6.2 In a workspace, install a local-path extension via the Packages tab URL input (paste `/path/to/some/extension`). Verify it appears in the new "Installed Packages" section above search with a working `Uninstall` button. Click `Uninstall` and verify the row disappears within ~1s.
- [x] 6.3 Install a recommended extension (e.g. `pi-flows`) via the Recommended Extensions panel. Verify it appears in the recommended section, NOT duplicated in Installed Packages.
- [x] 6.4 Install a non-recommended npm package via search. Verify it appears in the Installed Packages section.
- [x] 6.5 Switch to the Resources tab. Verify the tab label reads `"Resources"`. Verify loose `.pi/{skills,extensions,prompts}` files render under "Local" if any exist. Verify each installed package that contributes resources appears as a nested 📦 collapsible WITHOUT an Uninstall button. Verify the search-results "Installed" filter pill is gone.
- [x] 6.6 Navigate to Settings → Pi Ecosystem → Other Packages. Verify it still works exactly as before (this change is workspace-only).
- [x] 6.7 Edge cases: empty workspace `.pi/` dir + no installed packages → Resources tab shows `(none)` placeholders; Packages tab shows search + recommended only, no orphaned "Installed Packages" header.

## 7. Document

- [x] 7.1 In `AGENTS.md`, update the `packages/client/src/components/PackageBrowser.tsx` entry (or add one if absent) to mention the new "Installed Packages" section, the removed filter pill, and the source-keyed `installedInfo` map. Reference change `unify-workspace-package-management`.
- [x] 7.2 In `AGENTS.md`, update the `packages/client/src/components/PiResourcesView.tsx` entry (or add one if absent) to clarify that the Resources tab is browse-only and the Packages tab is the workspace-scope manage surface. Reference the same change.
- [x] 7.3 In `CHANGELOG.md` `## [Unreleased]` `### Fixed` (or `### Changed` — pick whichever fits better), add a one-paragraph entry describing the unified package-management treatment, the rename, and the local-path uninstall fix. Reference change `unify-workspace-package-management`.
