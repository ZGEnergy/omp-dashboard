## 1. Broaden the gate + add kb index to the run (`.pi/settings.json`)

- [ ] 1.1 Update `worktreeInit.gate` in `.pi/settings.json` to detect absence of ANY restored asset:
      `test ! -d node_modules || test ! -d .pi/skills/openspec-explore || test ! -f .pi/dashboard/kb/index.db`
      → verify: in a checkout missing only the kb index, `bash -c "<gate>"` exits `0`; in a fully-restored checkout it exits non-zero.
- [ ] 1.2 Append the kb-index pre-warm to `worktreeInit.run.command`:
      `npm ci && npx openspec init --tools pi --force && NODE_OPTIONS=--experimental-sqlite npx kb index`
      → verify: running the command in a fresh checkout produces `node_modules/`, `.pi/skills/openspec-*`, and a non-empty `.pi/dashboard/kb/index.db`.
- [ ] 1.3 Confirm the `kb` bin resolves after `npm ci` (`node_modules/.bin/kb` → `@blackbelt-technology/pi-dashboard-kb/dist/cli.js`); if `dist/cli.js` is not present post-install, front the step with the package build or the `tsx src/cli.ts` dev invocation.
      → verify: `npx kb index` exits 0 and prints an `indexed N files` line.

## 2. Spec: gate/run coherence (worktree-init-hook)

- [ ] 2.1 Add the "Gate SHALL cover every asset the run restores" requirement to `openspec/specs/worktree-init-hook/spec.md` (applied from this change's delta on archive).
      → verify: `openspec validate add-kb-index-to-worktree-init` passes; `openspec show add-kb-index-to-worktree-init` lists the modified capability.

## 3. Docs (delegate to subagent, caveman style)

- [ ] 3.1 `docs/faq.md`: note the worktree-init command now pre-warms the kb index, and the gate covers all restored assets (node_modules + opsx skills + kb index).
- [ ] 3.2 `docs/file-index-server.md`: annotate the `packages/server/src/worktree-init.ts` row — gate/run coherence guidance; `See change: add-kb-index-to-worktree-init`.
      → verify: `kb search "worktree init kb index"` surfaces the updated rows.

## 4. Manual verification

- [ ] 4.1 Create a throwaway worktree, delete its `.pi/dashboard/kb/index.db` (keep `node_modules`), grant TOFU trust, run init → confirm the gate re-fired and the kb index rebuilt.
- [ ] 4.2 Confirm re-hash: after editing `worktreeInit`, the first run request returns `init_untrusted` (trust re-prompt) as expected.
