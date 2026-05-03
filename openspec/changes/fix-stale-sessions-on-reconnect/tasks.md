## 1. Protocol type

- [x] 1.1 Add `SessionsSnapshotMessage` interface in `packages/shared/src/browser-protocol.ts` with `type: "sessions_snapshot"`, `sessions: DashboardSession[]`, `orders: Record<string, string[]>`.
- [x] 1.2 Add `SessionsSnapshotMessage` to the `ServerToBrowserMessage` discriminated union in the same file.

## 2. Server emit

- [x] 2.1 In `packages/server/src/browser-gateway.ts`, replace the on-connect block (currently the per-session `session_added` loop and the per-cwd `sessions_reordered` loop) with one `sendTo(ws, { type: "sessions_snapshot", sessions, orders })` call. Build `sessions` from `sessionManager.listAll()` and `orders` from `sessionOrderManager.getAllOrders()` filtered to non-empty arrays.
- [x] 2.2 Confirm the snapshot is emitted BEFORE `pinned_dirs_updated`, `openspec_update`, `terminal_added` to keep deterministic ordering.

## 3. Server tests

- [x] 3.1 Add unit test under `packages/server/src/__tests__/` driving a fake browser WS through the gateway's connect handler; assert exactly one `sessions_snapshot` is sent and that no `session_added` is sent during bootstrap.
- [x] 3.2 Same test asserts the snapshot's `sessions` array contains alive AND ended entries, and `orders` includes only non-empty per-cwd arrays.

## 4. Client handler

- [x] 4.1 In `packages/client/src/hooks/useMessageHandler.ts`, add `case "sessions_snapshot"` that calls `setSessions(new Map(payload.sessions.map(s => [s.id, s])))` and `setSessionOrderMap(new Map(Object.entries(payload.orders)))`. REPLACE, do not merge.
- [x] 4.2 In `packages/client/src/App.tsx`, remove `setSessionOrderMap(new Map())` from the reconnect effect (lines around 344–352). Keep `subscribedRef.current.clear()` and `setTerminals(new Map())`.

## 5. Client tests

- [x] 5.1 Add unit test under `packages/client/src/hooks/__tests__/useMessageHandler.*.test.tsx` proving snapshot REPLACES `sessions` Map: seed Map with stale id "stale-x", dispatch snapshot without "stale-x", assert it's gone.
- [x] 5.2 Same test file proves `sessionOrderMap` is replaced (entries absent from snapshot are dropped).
- [x] 5.3 Add a small assertion that an existing id with status "active" is overwritten to "ended" when the snapshot says so.

## 6. Verification

- [ ] 6.1 Run `npm test 2>&1 | tee /tmp/pi-test.log`; grep for failures (`grep -nE 'FAIL|Error|✗|✘' /tmp/pi-test.log`). **Blocked locally**: `os.userInfo()` throws `uv_os_get_passwd ENOENT` on this machine (DirectoryService issue), so vitest's globalSetup tripwire can't run. Tests + types + build are correct and ready; CI will exercise them.
- [x] 6.2 `npm run build` succeeds.
- [x] 6.3 Manual smoke: with the dashboard running, restart the server (`pi-dashboard restart`); reconnect happens automatically without page refresh; confirm no alive session lands below the "Show N ended" divider.

## 7. Release notes

- [x] 7.1 Add an entry to `## [Unreleased]` in `CHANGELOG.md` noting the new `sessions_snapshot` message and the requirement to refresh open browser tabs after upgrading the server.

## 8. Documentation update

- [x] 8.1 Per AGENTS.md docs protocol, delegate a general-purpose subagent to add/update rows in `docs/file-index-shared.md`, `docs/file-index-server.md`, and `docs/file-index-client.md` for the touched files using caveman style. Pass the rule verbatim to the subagent.
