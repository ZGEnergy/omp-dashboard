# Tasks — Rebase 18 commits onto origin/develop

## 1. Pre-rebase safety

- [x] 1.1 Fetched. origin/develop tip = `ab711621` (feat(bootstrap): detect + one-click cleanup of legacy @mariozechner/pi-coding-agent) — unchanged since analysis.
- [x] 1.2 Clean working tree confirmed. Only `.pi/git/.../pi-shodh` (submodule drift) and `packages/client/src/generated/plugin-registry.tsx` (gitignored).
- [x] 1.3 Backup branch created: `develop-prerebase-20260511-123808`.
- [x] 1.4 Ahead/behind: `60	19` (one more than the original 18 because the proposal commit `4b73bef5` was added). All 19 commits will be replayed.
- [x] 1.5 Expected: 2 HIGH-risk manual merges (SessionCard.tsx, AgentCardShell.tsx), 1 MEDIUM verification (slot-consumers.tsx), AGENTS.md + CHANGELOG.md likely auto-merge, other files clean.

## 2. Rebase execution

- [x] 2.1 Used `git rebase origin/develop` (non-interactive). Submodule + generated artefact pre-stashed.
- [x] 2.2 2c31067d replayed as 98162836. Conflicts: `scripts/sync-versions.js` (kept origin's CI note + our `if (totalRewrites > 0)` / `if (totalPreserved > 0)` block); `packages/client/src/generated/plugin-registry.tsx` (modify/delete — deleted, gitignored artefact).
- [x] 2.3 e3d89324 → fbe4006b, 122d503b → 7ca25bc8. Both clean (doc-only).
- [x] 2.4 8a271b60 → 9ea87b7e. HIGH-RISK #2 resolved per recipe: kept re-export shim in `packages/client/src/components/AgentCardShell.tsx`; applied origin's `ae59eed5` color-mix CSS to `packages/client-utils/src/AgentCardShell.tsx` (selected vs unselected branch).
- [x] 2.5 76f1ba9d → c2f6a5c4, 1d02fbf4 → c7256f73. AGENTS.md + CHANGELOG.md auto-merged. Conflict only on `packages/dashboard-plugin-runtime/package.json` (kept both exports: `./manifest-validator` from origin + `./test-support` from us).
- [x] 2.6 f706218f → 5939c074. `slot-consumers.tsx` auto-merged. `package-lock.json` conflict resolved by taking incoming version (will regen via `npm install` at end).
- [x] 2.7 8e0980d0 → 042cc356, 6e966e78 → ada7987e. Both clean.
- [x] 2.8 f75b3ea9 → 5f708213. HIGH-RISK #1 resolved per recipe in SessionCard.tsx: kept origin's WorkspaceSubcard (hosts SessionCardBadgeSlot internally with FlowActivityBadgeClaim contribution); deleted FLOWS subcard wrapper entirely; removed dangling `flows,` from destructured props. SessionList.tsx mini-conflict resolved: kept origin's `useFolderDragHandle` import + dropped `FlowInfo` type.
- [x] 2.9 97ea8a87 → 302973fd. Clean.
- [x] 2.10 2d248280 → 4b33c1e4. Clean auto-merge of slot-consumers.tsx — post-merge verification deferred to section 3.
- [x] 2.11 6537c876 → c0feef85. Clean.
- [x] 2.12 47e3b12d → 9fd79be4. LOW conflict on `dashboard-plugin-loader/spec.md` resolved by keeping BOTH requirements: origin's "Shell consumes the generated plugin registry" then our "Plugin runtime exposes UI primitive registry context".
- [x] 2.13 c7c47234 → af427860. Clean.
- [x] 2.14 1f6a78e2 → bcc5eb10. Clean — confirmed bridge.ts auto-merged (sessionPrompt edits + message_end edits in different functions).
- [x] 2.15 fa12f4e3 → 747ae922, b0566863 → c419c42e, plus 4b73bef5 (rebase proposal) → 3a3e9a8f, plus dc0438ab (tick commit) → c7d21870. All clean (proposal dirs + tasks.md tick).

## 3. Post-rebase verification

- [ ] 3.1 Regenerate package-lock.json (it likely conflicted): `npm install` and verify exit 0.
- [ ] 3.2 Type-check: `npm run reload:check 2>&1 | tee /tmp/post-rebase-typecheck.log`. Expect 0 errors in files we touched. Pre-existing errors in `use-message-handler-pending-prompt.test.ts`, `plugin-registry.tsx`, `provider-register-reload.test.ts` are out of scope.
- [ ] 3.3 Run full test suite: `npm test 2>&1 | tee /tmp/post-rebase-test.log`. Expect at least 5195 passing tests (the pre-rebase baseline). Investigate any new failures.
- [ ] 3.4 Run repo-lints specifically: `npm test -- no-flow-references-in-shell no-primitive-direct-import sync-versions-spec`. All must pass.
- [ ] 3.5 Validate OpenSpec: `openspec validate --all --strict 2>&1 | grep -E '(dashboard-plugin-loader|dashboard-shell-slots|plugin-ui-primitive|rebase-flows-track)'`. All 4 must show ✓.
- [ ] 3.6 Build the client: `npm run build`. Confirm clean build, no bundle-size regression.
- [ ] 3.7 Smoke test: `pi-dashboard restart` then visit `http://localhost:8000`. Confirm:
  - Dashboard loads without console errors
  - Session cards render with the new subcard layout (origin's design)
  - No FLOWS subcard appears on any card
  - If a flows-plugin session is active, the badge + dashboard render via slot claims (our pluginize-flows-via-registry work)
- [ ] 3.8 Visual verification of `AgentCardShell.tsx` CSS: confirm unselected cards have the new blended secondary+tertiary background (origin's `ae59eed5` intent preserved).

## 4. Push

- [ ] 4.1 Final ahead/behind check: `git rev-list --left-right --count origin/develop...HEAD`. LEFT side = 0 (origin/develop equals what we rebased onto). RIGHT side = number of replayed commits (expected 18, possibly fewer if any became empty).
- [ ] 4.2 Plain push (no flags): `git push origin develop`. Expect "Updating <sha>..<sha>" and "fast-forward". Reject any output mentioning "force" or "non-fast-forward" — if push fails, return to step 1.1 (someone moved origin during our rebase).
- [ ] 4.3 Confirm push: `git log --oneline origin/develop -5` shows our 5 most-recent commits on top.

## 5. Cleanup

- [ ] 5.1 Delete the backup branch once push succeeds: `git branch -D develop-prerebase-<timestamp>`.
- [ ] 5.2 Run `openspec archive rebase-flows-track-onto-develop` to move this change to archive. No spec sync (this change has no spec deltas).

## 6. Out-of-scope follow-ups (tracked, not done)

- [ ] 6.1 (FOLLOW-UP) Create `retire-shell-flow-capability-specs` change to remove the 3 capability specs still referencing deleted flow fields (`session-listing/spec.md`, `flow-server-state/spec.md`, `flow-card-status/spec.md`).
- [ ] 6.2 (FOLLOW-UP) Create `reconcile-flows-extension-ui-vs-plugin-runtime` change to make the architectural call: either supersede origin's `pi-flows-adopt-extension-ui` proposal with our `pluginize-flows-via-registry`, or accept both as parallel mechanisms with documented use cases.
- [ ] 6.3 (FOLLOW-UP) Complete J.1-J.6 documentation housekeeping from the archived `pluginize-flows-via-registry/tasks.md`:
  - CHANGELOG.md ### Added entry for useSessionEvents + flows-plugin
  - CHANGELOG.md ### Removed entry for 4 DashboardSession fields
  - `docs/plugin-ui-primitives.md` cross-reference verification
  - `AGENTS.md` flows-plugin canonical pattern note (if missing)
