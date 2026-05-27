## 1. Tests first (TDD)

- [x] 1.1 Add `packages/extension/src/__tests__/bridge-hasui-flip.test.ts` — implemented as a unit test on the extracted pure helper `flipHasUI(ctx)` (cleaner than driving the full `session_start` path; matches the project's existing pattern of testing pure-function mirrors of bridge logic — see `bridge-shutdown-reset.test.ts`)
- [x] 1.2 Sibling tmux scenario (`hasUI: true` → no-op, still true) covered by the same test file
- [x] 1.3 Non-writable `ctx.hasUI` (getter) AND frozen-ctx scenarios — both swallow + log `[dashboard] failed to flip ctx.hasUI` exactly once
- [x] 1.4 Red phase confirmed: `vitest run bridge-hasui-flip.test.ts` failed with `Cannot find module '../hasui-flip.js'` before implementation

## 2. Implementation

- [x] 2.1 Located `(ctx.ui as any).notify = ...` block in `bridge.ts` (~line 1521)
- [x] 2.2 Added `flipHasUI(ctx)` call (helper wraps the assignment in try/catch + warn). New file `packages/extension/src/hasui-flip.ts` + import in `bridge.ts`
- [x] 2.3 Assignment is below the pre-existing `cachedHasUI = ctx.hasUI` line — `cachedHasUI` retains the pre-flip value
- [x] 2.4 Single localized addition: 1 new file (`hasui-flip.ts`, 35 LOC) + 2 edits to `bridge.ts` (import + helper call)

## 3. Green phase

- [x] 3.1 All 8 new tests in `bridge-hasui-flip.test.ts` PASS (`vitest run` → 8 passed)
- [x] 3.2 Full suite: 6389 passed, 2 pre-existing failures (`tunnel.test.ts`, `git-worktree-lifecycle-ops.test.ts`) — confirmed unrelated via `git stash` baseline check; same 2 failures on stashed (pre-change) tree

## 4. Manual verification

- [x] 4.1 `npm run build` — client rebuilt (Vite, 8.98s)
- [x] 4.2 `POST /api/restart` returned `{ok: true}`; new server `/api/health` mode=dev, uptime≈2s
- [x] 4.3 `npm run reload` — sent to 2 connected sessions (`fix-node-resolution-under-electron` + `fix-bridge-hasui-for-headless-rpc`)
- [x] 4.4 User verified: `/ctx-stats` renders "context-mode stats (Pi)" card in dashboard-spawned RPC session
- [x] 4.5 User verified: `/ctx-doctor` renders "ctx-doctor (Pi)" card
- [ ] 4.6 (Optional) pi-agent-browser install-confirm dialog
- [ ] 4.7 (Optional) pi-web-access curator window opens

## 5. Docs

- [x] 5.1 FAQ row added to `docs/faq.md` (last entry, "Why does /ctx-stats / /ctx-doctor show only a green 'completed' pill")
- [x] 5.2 CHANGELOG `[Unreleased] ### Fixed` bullet added with pi-web-access curator-default migration note
- [x] 5.3 `docs/file-index-extension.md` updated: new row for `src/extension/hasui-flip.ts` (alphabetically after `git-link-builder.ts`) + appended `See change: fix-bridge-hasui-for-headless-rpc.` to existing `bridge.ts` row

## 6. Verify + archive (post-merge)

- [x] 6.1 `openspec validate fix-bridge-hasui-for-headless-rpc --strict` → "Change ... is valid"
- [ ] 6.2 After manual verification (4.4, 4.5) + landing, archive the change via `openspec-archive-change` skill
