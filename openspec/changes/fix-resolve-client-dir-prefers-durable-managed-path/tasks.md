## 1. Resolver reorder

- [x] 1.1 Edit `packages/server/src/resolve-client-dir.ts`: build the managed-root candidate first (when `resolveManagedDirRoot(serverDir)` returns non-null), then append strategies 1–5 in their existing relative order.
- [x] 1.2 Update the file header comment to encode the new invariant: "durable paths first, volatile (scope-dir) paths after." Renumber the strategy list in the comment to match the new order.

## 2. Tests

- [x] 2.1 Update `packages/server/src/__tests__/static-client-resolution.test.ts`:
  - The test `picks strategy #6 (managed-dir root) when scope-dir is wiped ...` SHALL flip its position assertion to `candidates[0]` instead of `candidates[candidates.length - 1]`. Rename the test to reflect the new chain position (managed-root is now strategy #1 when `.version` resolves).
- [x] 2.2 Add a new test `prefers durable managed-root over volatile scope-dir even when both resolve`:
  - Plant BOTH `<managed>/node_modules/@blackbelt-technology/pi-dashboard-web/dist/index.html` AND `<managed>/packages/dist/client/index.html`.
  - Assert `clientDir === <managed>/packages/dist/client`.
  - Assert `candidates[0] === <managed>/packages/dist/client`.
- [x] 2.3 Verify the existing "picks strategy #1 (Node module resolver)" test still passes: its setup has no `.version` marker, so the managed candidate is not added and the chain is unchanged.
- [x] 2.4 Verify the "returns empty clientDir when no candidate has index.html" test still passes for both the with-marker and without-marker paths.

## 3. Build + smoke

- [x] 3.1 `npm run build:local` in `packages/electron/`. The bundle-staleness gate from `fix-build-installer-stale-server-bundle` SHALL detect the changed `resolve-client-dir.ts` and re-bundle (`reason=source-newer`).
- [x] 3.2 Install the new DMG. Quit any running PI Dashboard. Relaunch.
- [x] 3.3 `curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8000/` SHALL return `HTTP 200` (was `HTTP 404` before this fix).
- [x] 3.4 Confirm the running server's resolved path: log inspection or one-shot script verifying it points at `<managed>/packages/dist/client`, NOT `<managed>/node_modules/@blackbelt-technology/pi-dashboard-web/dist`.

## 4. Docs

- [x] 4.1 `docs/file-index-server.md` row for `resolve-client-dir.ts` extended with: "Durable paths first: managed-root candidate leads when `.version` marker present; scope-dir candidates follow. See change: fix-resolve-client-dir-prefers-durable-managed-path." Caveman style per AGENTS.md (delegate to subagent).
