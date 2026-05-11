# Tasks — Rebase 18 commits onto origin/develop

## 1. Pre-rebase safety

- [ ] 1.1 Fetch latest from origin: `git fetch origin`. Confirm origin/develop is unchanged since the analysis (current tip after fetch matches `c52fdb2f` or later).
- [ ] 1.2 Confirm clean working tree: `git status` shows only `packages/client/src/generated/plugin-registry.tsx` (gitignored artefact) and the submodule drift in `.pi/git/.../pi-shodh`. No staged or unstaged changes to other files.
- [ ] 1.3 Create backup branch: `git branch develop-prerebase-$(date +%Y%m%d-%H%M%S)`. Verify it exists with `git branch | grep prerebase`.
- [ ] 1.4 Confirm current ahead/behind: `git rev-list --left-right --count origin/develop...HEAD` returns `60   18`.
- [ ] 1.5 Document expected resolution count: 2 HIGH-risk manual merges (`SessionCard.tsx`, `AgentCardShell.tsx`), 1 MEDIUM verification (`slot-consumers.tsx`), other files via 3-way auto-merge.

## 2. Rebase execution

- [ ] 2.1 Start interactive rebase: `git rebase -i origin/develop`. Do NOT reorder, squash, or drop any commits in the rebase-todo editor — accept the default order.
- [ ] 2.2 Allow Git to replay commit 2c31067d (predicates + sync-versions). Expect clean apply; if conflict on `scripts/sync-versions.js`, accept origin's structure and re-apply our predicate-emission additions.
- [ ] 2.3 Allow Git to replay commits e3d89324, 122d503b (doc-only OpenSpec changes). Expect clean.
- [ ] 2.4 Allow Git to replay 8a271b60 (extract client-utils). EXPECT CONFLICT on `packages/client/src/components/AgentCardShell.tsx`. Apply the resolution recipe from `design.md` HIGH-RISK #2: choose "ours" (re-export shim) for the client file, then apply origin's CSS change to `packages/client-utils/src/AgentCardShell.tsx`. Run `git add` on both files. `git rebase --continue`.
- [ ] 2.5 Allow Git to replay 76f1ba9d, 1d02fbf4 (UI primitive registry + wiring). Possible MED conflict on `AGENTS.md` and `CHANGELOG.md` — apply both sets of additions, verify section ordering, `git add`, `git rebase --continue`.
- [ ] 2.6 Allow Git to replay f706218f (useSessionEvents). Possible MED conflict on `packages/dashboard-plugin-runtime/src/slot-consumers.tsx` — let it apply, will be cleaned up by 2d248280 a few commits later.
- [ ] 2.7 Allow Git to replay 8e0980d0, 6e966e78 (flows-plugin internals + slot wrappers). Expect clean.
- [ ] 2.8 Allow Git to replay f75b3ea9 (shell deletion). EXPECT CONFLICT on `packages/client/src/components/SessionCard.tsx`. Apply the resolution recipe from `design.md` HIGH-RISK #1: keep origin's SessionSubcard structure, delete FLOWS subcard wrapper entirely. Verify imports of `FlowActivityBadge` / `SessionFlowActions` are removed. `git add`, `git rebase --continue`.
- [ ] 2.9 Allow Git to replay 97ea8a87 (no-flow-references lint). Expect clean.
- [ ] 2.10 Allow Git to replay 2d248280 (revert content-view route field). Inspect `slot-consumers.tsx` post-apply — verify origin's new functions (`useSlotHasClaimsForSession`, `SessionCardMemorySlot`, `WorkspaceActionBarSlot`) are still present alongside our `forSession` predicate filter. If missing, manually copy from `git show origin/develop:packages/dashboard-plugin-runtime/src/slot-consumers.tsx` before `--continue`.
- [ ] 2.11 Allow Git to replay 6537c876 (predicate-based content-view activation). Expect clean.
- [ ] 2.12 Allow Git to replay 47e3b12d (archive commit). LOW conflict on `openspec/specs/dashboard-plugin-loader/spec.md` — additive, both sides extended different sections. Accept both.
- [ ] 2.13 Allow Git to replay c7c47234 (delete superseded changes). Expect clean.
- [ ] 2.14 Allow Git to replay 1f6a78e2 (retry banner fix). Expect clean — origin touched `bridge.ts` in `sessionPrompt` function only; we touched `message_end` handler. Different functions.
- [ ] 2.15 Allow Git to replay fa12f4e3, b0566863 (zed + queue proposals — pure new dirs). Expect clean.

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
