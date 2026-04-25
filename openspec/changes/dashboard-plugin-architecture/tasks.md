# Tasks

This change is **design-only**. It captures the plugin architecture and the slot taxonomy. Implementation lands in follow-up changes:

- `add-dashboard-shell-slots-runtime` (the plugin loader + slot consumers; not yet scaffolded)
- `extract-openspec-as-plugin` (scaffolded by this change)
- `extract-flows-as-plugin` (scaffolded by this change)

## 1. Design review

- [x] 1.1 Resolve open questions in `design.md` §"Open Questions". **Done** — all 8 questions resolved (full state, `plugins.<id>.*` config namespace, no plugin-to-plugin direct access, per-plugin code splitting, `enabled` flag in config, auto-register/deregister bridge entries, failure isolation via `/api/health`, `content-inline-footer` stays React-only). design.md §"Resolved Open Questions" now records each decision with rationale.
- [ ] 1.2 Confirm slot taxonomy frozen list — no last-minute additions or renames before implementation starts.
- [ ] 1.3 Validate that the slot taxonomy covers every existing OpenSpec and Flow component identified in the layout scan (no missing slots).
- [ ] 1.4 Confirm with anyone using internal dashboard imports that the plugin context API surface is sufficient (or document gaps).
- [ ] 1.5 Validate the SettingsPanel can host plugin sections without breaking existing core sections (auth, providers, network, packages, pi-core, tools). The refactor lands in `add-dashboard-shell-slots-runtime`; this task only validates the design covers the existing sections cleanly.
- [ ] 1.6 Confirm migration path for legacy top-level config keys (e.g. `openspec.*`) into `plugins.<id>.*` works with one-time auto-migration in plugin server entries; document the deprecation window in `extract-openspec-as-plugin`.

## 2. Scaffold follow-up change directories

- [x] 2.1 Create `openspec/changes/extract-openspec-as-plugin/` with proposal.md scoped to OpenSpec extraction only. **Done** — see that change folder.
- [x] 2.2 Create `openspec/changes/extract-flows-as-plugin/` with proposal.md scoped to Flow rendering extraction only. **Done** — see that change folder.
- [x] 2.2b Create `openspec/changes/extract-subagents-as-plugin/` with proposal.md scoped to extracting the `@tintinweb/pi-subagents` tool renderers and reducer slice (Agent/get_subagent_result/steer_subagent + SubagentState). **Done** — also documents the future PR-back-to-tintinweb path. Depends on the `tool-renderer` slot landing first.
- [x] 2.2c Create `openspec/changes/extract-git-as-plugin/` with proposal.md scoped to extracting bridge git poller, server REST routes, BranchPicker, BranchSwitchDialog, GitInfo display, GroupGitInfo. **Done** — also introduces the "bundled-by-default" plugin concept; `platform/git.ts` and `session-diff.ts` and `Session.gitBranch/gitPr` fields stay in core; FileDiffView stays in core.
- [ ] 2.3 Create `openspec/changes/add-dashboard-shell-slots-runtime/` with proposal.md scoped to the loader + consumer components (no concrete plugin extractions). Deferred until this design proposal is reviewed.

## 3. Cross-reference and documentation

- [ ] 3.1 Add a stub `openspec/specs/dashboard-shell-slots/spec.md` placeholder (created by this change's spec already; the archive will populate the main spec).
- [ ] 3.2 Add a stub `openspec/specs/dashboard-plugin-loader/spec.md` placeholder (same).
- [ ] 3.3 Update `docs/architecture.md` with a "Plugin Architecture (planned)" section describing the two-tier model and slot taxonomy.
- [ ] 3.4 Update `extension-ui-system` proposal to cross-reference this umbrella so future readers see the relationship.

## 4. Reference verification

- [x] 4.1 Re-read `App.tsx` conditional rendering block and verify every existing branch maps cleanly to one of the new slot kinds (`content-view`, `content-header-sticky`, `content-inline-footer`, `anchored-popover`). **Done** — coverage table in design.md §"Slot taxonomy".
- [x] 4.2 Re-read `SessionCard.tsx`, `SessionList.tsx` and verify badges/action-bars/folder-section all map to slots. **Done** — design.md §"Slot taxonomy" maps each.
- [ ] 4.3 Cross-check with `extension-ui-system` design.md §"Slot taxonomy" — ensure the descriptor-renderable slots use identical names and payload shapes; if any drift, fix before review concludes.

## 5. Build integration spike

- [ ] 5.1 Prototype the Vite plugin (`vite-plugin-dashboard-plugins`) standalone to validate manifest discovery + generated registry approach. Not blocking; informs implementation feasibility.
- [ ] 5.2 Confirm tree-shaking works for unused plugin React via test fixtures (one plugin with two unused exports — confirm they don't ship in the final bundle).
- [ ] 5.3 Prototype the `settings-section` slot end-to-end: a fake plugin contributes a React settings section, writes to its namespace, sees the broadcast, re-renders. Validates the persistence + reactive-broadcast loop before real plugins consume it.
- [ ] 5.4 Prototype the `tool-renderer` slot: a fake plugin claims `tool-renderer` for a synthetic `toolName: "Demo"`; verify the chat picks the plugin component over `GenericToolRenderer` and that error-boundary fallback works. Validates the seam before `extract-subagents-as-plugin` consumes it.
- [ ] 5.5 Document the `node_modules` discovery extension path (Future Work) so the eventual move of `subagents-plugin` to `@tintinweb/pi-subagents` has a clear implementation roadmap.
