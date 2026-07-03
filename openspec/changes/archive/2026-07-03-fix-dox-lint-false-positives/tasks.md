# Tasks — fix `kb dox lint` false positives

## 1. Row-path resolution (Defect A) + repo-root fallback (Option B)
- [x] `dox.ts` `doxLint` — resolve row paths against `dirname(af)`, not `cwd`, via shared `resolveRowPath` → verify: unit fixture with a valid basename row in a sub-dir `AGENTS.md` reports 0 orphans
- [x] Add `resolveRowPath(agentsDir, cwd, rp)`: dir-relative first, then repo-root (`cwd`) fallback before orphan — rescues `docs/AGENTS.md` root-config rows (`biome.json`, `playwright.config.ts`) → verify: unit fixture (docs/ sub-dir row for a repo-root file) reports 0 orphans
- [x] Confirm `broken-pointer` + absolute-path branches still behave → verify: existing dox tests green
- [x] Guard `--fix`: no valid rows pruned → verify: patched `doxLint` on main repo drops orphan 1069 → 1 (the 1 = genuinely-absent `.pi-test-harness.json`, a correct **orphan** finding — absent file, not stale, which requires an existing-but-drifted file)

## 2. DOX-table scoping (Defect B)
- [x] Add heading-tracking (`# DOX —` scope) to shared `parseRowPaths` + the `doxLint` inline row scan — only rows under a `DOX` heading count → verify: unit fixture with a non-DOX prose table (backtick path cell) yields 0 rows
- [x] `doxInit` inherits the guard via `parseRowPaths` → verify: init/lint agree on row set for a mixed file
- [x] Root `AGENTS.md` contributes 0 DOX rows → verify: `Explore`/`react-expert`/`qa/packer/*.pkr.hcl` no longer reported

## 3. Extend scope to `kb-extension/reindex.ts` (same two-bug family)
- [x] `acknowledgeRows` — resolve rows dir-relative (+ root fallback), key staleness by cwd-relative path → verify: `acknowledgeRows clears stale flags` test green
- [x] `decideNudge` — resolve rows before comparing to the edited file's abs path (was comparing cwd-relative `rel` vs basename → always "missing") → verify: nested-basename-row fixture returns `null`, not `missing`
- [x] Local `resolveRowPath` mirror in `reindex.ts` (avoids depending on an unreleased `kb` export across the versioned package boundary; worktree has no `node_modules` → resolves `kb` from main checkout) → verify: `kb-extension` reindex tests 7/7 green

## 4. Regression + integration
- [x] Add spec scenarios as tests: Defect A (dir-relative), Defect B (table-scope), Option B (repo-root fallback), reindex nested-basename → verify: `kb` 47 pass / 1 skip; `kb-extension` 7 pass
- [x] Patched `doxLint` on main repo → verify: total 1226 → 133 (orphan 1, over-threshold 8 preserved, missing 94 out-of-scope `.md`-convention, missing-companion 30). NOTE: measure from the main checkout — running from inside `.worktrees/**` makes `DEFAULT_EXCLUDE` match the cwd path prefix and scan nothing.

## 5. Documentation
- [x] Update `packages/kb/src/AGENTS.md` `dox.ts` row purpose (dir-relative resolution + repo-root fallback + `resolveRowPath` export + DOX-heading scoping) — direct edit, source tree
- [x] `packages/kb-extension/src/AGENTS.md` `reindex.ts` row — noted dir-relative row resolution + repo-root fallback + cwd-relative staleness (direct edit); lints clean, under caps
- [x] `docs/`-side note NOT warranted — no `docs/` file references `kb dox lint`/DOX resolution internals (grep-verified); tool-side wording kept generic (no repo-specific tokens in `kb`/`kb-extension` source), repo-specific rationale lives in this change's `design.md`
