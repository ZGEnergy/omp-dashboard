# Tasks — add-panel-elevation-system

## 1. Elevation-rim token
- [ ] 1.1 Add per-mode `--elevation-rim` in `packages/client/src/index.css`: `:root` (dark) `rgba(255, 255, 255, 0.10)`; `[data-theme="light"]` `rgba(255, 255, 255, 0.9)`.
- [ ] 1.2 Verify the token survives named-theme application (inline vars set by `applyThemeVars` in `themes.ts` only cover `CSS_VAR_KEYS`; a non-listed custom prop from `index.css` should persist). If it is stripped, add `--elevation-rim` to the shared per-mode merge in `themes.ts` instead and document which path was taken.
- [ ] 1.3 Add/extend a test in `packages/client/src/lib/__tests__/themes.test.ts` (or a small DOM test) asserting `--elevation-rim` resolves to the dark value by default and the light value under `[data-theme="light"]`.

## 2. Session card bevel + title weight
- [ ] 2.1 In `SessionCard.tsx` desktop container (~line 647), replace `shadow-md shadow-[var(--shadow-card)]` with the bevel: `shadow-[inset_0_1px_0_var(--elevation-rim),0_4px_8px_var(--shadow-card)]` (keep `hover:shadow-lg hover:-translate-y-0.5` and the selected branch intact).
- [ ] 2.2 In the mobile container (~line 535), apply the same bevel recipe.
- [ ] 2.3 Add `font-semibold` to the desktop session-name span (~line 697) and the mobile session-name span (~line 543).
- [ ] 2.4 Confirm the selected-card branch (border/tint/ring + `card-glow-fx`/`card-ring-fx`) is unchanged and now also carries the inset highlight without visual regression.

## 3. Folder / workspace header bevel
- [ ] 3.1 In `WorkspaceHeader.tsx`, add the bevel to the header bar: `inset 0 1px 0 var(--elevation-rim)` + `0 2px 4px var(--shadow-card)`.
- [ ] 3.2 Apply the same to the folder header bar (locate in `SortableWorkspaceFolder.tsx` / folder header render).

## 4. Cross-mode + cross-theme verification
- [ ] 4.1 Verify in light AND dark via `isolated-ui-verification` (worktree preview) that: session titles read heavier, cards/folder bars read as raised panels, and the selected card still clearly dominates.
- [ ] 4.2 Spot-check the lightest themes (Base, GitHub light) that the inset highlight is visible on `--bg-tertiary` surfaces; spot-check the lightest dark bg (Solarized dark) that the drop does not over-darken.
- [ ] 4.3 Confirm no WCAG contrast regression on session-name / meta text (no tint or shadow added to text; weight 600 only).

## 5. Docs
- [ ] 5.1 Update `SessionCard.tsx.AGENTS.md` and `WorkspaceHeader.tsx.AGENTS.md` rows to note the bevel + `See change: add-panel-elevation-system`.
- [ ] 5.2 If `--elevation-rim` lands in `themes.ts`, note it in the themes row; otherwise note the `index.css` home.
