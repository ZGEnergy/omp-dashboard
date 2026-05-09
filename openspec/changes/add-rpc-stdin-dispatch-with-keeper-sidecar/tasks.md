## 1. Pre-flight verification

- [ ] 1.1 Verify `fix-extension-slash-commands-in-dashboard` has shipped (its tasks should all be checked, or at least the bridge-side helpers + slash-dispatch.ts + command-routing spec are landed). This change EXTENDS those — do not start before they ship. Run `openspec status --change fix-extension-slash-commands-in-dashboard` to confirm.
- [ ] 1.2 Empirical confirmation: in the dev environment, run `echo '{"type":"prompt","message":"/ctx-stats","id":"test"}' | pi --mode rpc 2>&1 | head -20` and confirm pi dispatches the slash command (some output indicating ctx-stats handler ran). Capture the verification in a notes file `notes/preflight-rpc-dispatch.md`.
- [ ] 1.3 Verify `@earendil-works/pi-coding-agent@0.74.0` (or whatever pi version is pinned) still does NOT export `dispatchCommand`. Run `grep -rn dispatchCommand $(npm root)/@earendil-works/pi-coding-agent/dist/` — should return 0 matches. If it returns matches, the upstream PR has landed and Path B is now possible; revisit whether this whole change is still needed.

## 2. Keeper sidecar (CommonJS, no TS loader)

- [ ] 2.1 Create `packages/server/src/rpc-keeper/keeper.cjs`. CJS-pure, only Node built-ins (`child_process`, `net`, `fs`, `path`). Reads sessionId from `process.argv[2]`. Resolves socket path from sessionId per spec (`<homedir>/.pi/dashboard/sessions/<sessionId>.rpc.sock` Unix, `\\.\pipe\pi-rpc-<sessionId>` Windows).
- [ ] 2.2 Implement keeper startup sequence: bind UDS / named-pipe socket BEFORE spawning pi. If bind fails because the socket exists, `unlink()` and retry exactly once. If second bind fails, exit non-zero with log.
- [ ] 2.3 Spawn pi as child: `child_process.spawn("pi", ["--mode", "rpc"], {stdio: ["pipe", logFd, logFd], env: {...process.env, PI_DASHBOARD_SPAWNED: "1"}, cwd: process.cwd()})`. Log file path: `<homedir>/.pi/dashboard/sessions/keeper-<sessionId>.log`.
- [ ] 2.4 Write keeper PID sidecar to `<sockPath>.pid` (Unix) or named-pipe-equivalent path. Cleanup on graceful exit.
- [ ] 2.5 Wire `child.on("exit", ...)`: when pi exits, unlink socket + PID sidecar, exit 0.
- [ ] 2.6 Wire UDS server `connection` listener: forward each `\n`-terminated chunk to pi's stdin. Multiple concurrent connections allowed; do not serialize beyond what pi's stdin pipe enforces.
- [ ] 2.7 Wire `pi.stdin.on("error", ...)`: detect EPIPE / closed-stream errors. On EPIPE, exit 0 (pi is gone; same path as pi.exit).
- [ ] 2.8 Crash-detection window: spawn pi, wait 300ms, if pi has exited, log diagnostic and exit non-zero (preserves existing dashboard `PI_CRASHED` semantic).
- [ ] 2.9 No JSON parsing or content validation in the keeper — it is a "dumb wire" forwarding raw lines.
- [ ] 2.10 Emit a startup-completion log line (`keeper ready: <sessionId>`) once both socket bind succeeded AND pi spawned without immediate crash. Used by integration tests.

## 3. Keeper unit tests (CJS)

- [ ] 3.1 Create `packages/server/src/rpc-keeper/__tests__/keeper.test.cjs` (CJS, runs under Vitest with appropriate config). Spawn the keeper as a real subprocess in test, with a mock pi script (`mock-pi.cjs` that just echoes stdin to a file).
- [ ] 3.2 Test: connect to keeper UDS, write `{"type":"prompt","message":"hello","id":"1"}\n`, assert mock-pi's stdin file contains the same line.
- [ ] 3.3 Test: kill mock-pi, assert keeper exits 0 and unlinks socket + PID file.
- [ ] 3.4 Test: stale-socket recovery — pre-create socket file, start keeper, assert it succeeds via unlink-and-retry.
- [ ] 3.5 Test: crash-detection — mock-pi script that exits immediately; assert keeper exits non-zero within 1s.
- [ ] 3.6 Test: concurrent connections — open 3 simultaneous UDS connections, write a line on each, assert all 3 lines reach mock-pi's stdin in some order.
- [ ] 3.7 Windows-specific tests gated by `process.platform === "win32"`: same scenarios with `\\.\pipe\...` instead of UDS path.

## 4. Server-side keeper-manager

- [ ] 4.1 Create `packages/server/src/rpc-keeper/keeper-manager.ts`. Exports a class / factory `KeeperManager` with methods: `spawnKeeperFor(sessionId, cwd, env): Promise<SpawnResult>`, `writeRpc(sessionId, line: string): Promise<boolean>`, `killKeeper(sessionId): boolean`, `discoverExistingKeepers(): Promise<{sessionId, keeperPid, sockPath}[]>`.
- [ ] 4.2 `spawnKeeperFor`: spawn `node <path>/keeper.cjs <sessionId>` as a detached process, with `stdio: ["ignore", logFd, logFd]`. Use `spawnDetached` primitive from `packages/shared/src/platform/detached-spawn.ts` for cross-platform consistency.
- [ ] 4.3 `writeRpc`: connect to the session's UDS / named pipe with up-to-3-attempt exponential backoff (50ms, 150ms, 350ms). Write the line. Close the connection. Return true on success, false on all-attempts-failed. Internal try/catch — never throws.
- [ ] 4.4 `killKeeper`: send SIGTERM to the keeper PID via `killPidWithGroup` (existing primitive). Caller is responsible for cleanup; `killKeeper` itself does not unlink files.
- [ ] 4.5 `discoverExistingKeepers`: scan `<homedir>/.pi/dashboard/sessions/*.rpc.sock` (Unix) or named-pipe directory (Windows). For each socket, read the corresponding `.pid` sidecar; check both keeper PID alive AND pi PID alive (cross-reference with `headlessPidRegistry`); return only the live tuples. Unlink stale entries.
- [ ] 4.6 Unit test `packages/server/src/__tests__/keeper-manager.test.ts`: mock `child_process.spawn` and `net.createConnection`; assert spawn args, write happens, retry-then-fail behavior, killKeeper sends SIGTERM.

## 5. Integration with `process-manager.ts::spawnHeadless`

- [ ] 5.1 Read `useRpcKeeper` from `~/.pi/dashboard/config.json` (default `false`). Implement in `loadConfig` if not already present.
- [ ] 5.2 In `spawnHeadless`: if `useRpcKeeper === true`, route through `KeeperManager.spawnKeeperFor(...)` and return its `SpawnResult` (the `pid` field is the keeper PID). Else fall through to the existing tail-wrapper / direct-pipe paths.
- [ ] 5.3 Pass through `spawnToken` env var to keeper, which passes it to pi (existing token-correlation contract).
- [ ] 5.4 Crash-detection window applies to KEEPER spawn, not pi (keeper applies its own to pi internally).
- [ ] 5.5 Update `headlessPidRegistry.register` call site: register the keeper PID as the spawn-time PID. Pi PID is linked later via `session_register` token correlation (existing).
- [ ] 5.6 Add a unit test for the new branch in `packages/server/src/__tests__/process-manager-keeper-spawn.test.ts`.

## 6. `headlessPidRegistry` extensions

- [ ] 6.1 Extend `HeadlessPidEntry` interface to optionally carry `keeperPid?: number` and `keeperSockPath?: string`.
- [ ] 6.2 Add method `writeRpc(sessionId, line: string): Promise<boolean>`. Looks up entry by sessionId, delegates to `KeeperManager.writeRpc(sessionId, line)`. Returns false if no entry or no keeper for that session.
- [ ] 6.3 Extend `cleanupOrphans` startup pass: also scan UDS sockets and reconcile with PID registry as specified in `rpc-keeper-sidecar` requirement.
- [ ] 6.4 Extend `killBySessionId`: when the entry has a `keeperPid`, kill BOTH keeper PID and pi PID. Order: kill pi first (so keeper's auto-exit-on-pi-exit fires), wait briefly, fall back to killing keeper if still alive.
- [ ] 6.5 Update unit tests for `headless-pid-registry.test.ts`: add scenarios with keeper PIDs.

## 7. Bridge wiring (`slash-dispatch.ts` + `bridge-context.ts`)

- [ ] 7.1 Add `isHeadlessRpcSession(): boolean` to `bridge-context.ts`. Implementation per `extension-rpc-dispatch` Requirement: `process.env.PI_DASHBOARD_SPAWNED === "1"` AND `process.argv` contains `--mode` adjacent to `rpc`. Pure, exported.
- [ ] 7.2 Unit test for `isHeadlessRpcSession()` in `bridge-context.test.ts` (or a new file): cover all 4 corner cases (both true, env-only, argv-only, neither).
- [ ] 7.3 Modify `tryDispatchExtensionCommand` signature: add optional `connection?: ConnectionManager` parameter.
- [ ] 7.4 Implement Path C branch: when `!hasDispatchCommand(pi)` AND `isHeadlessRpcSession()` AND `connection` is defined, emit `started`, then `connection.send({type: "dispatch_extension_command", sessionId, command: text, requestId: randomUUID()})`. Do NOT emit a terminal event.
- [ ] 7.5 Path D stays as-is when Path C predicates are not met, including when `connection` is undefined.
- [ ] 7.6 Update both call sites: `bridge.ts::sessionPrompt` (pass `connection`) and `command-handler.ts`'s slash else-arm (`connection` may be undefined in the test-shim).
- [ ] 7.7 Update `bridge-slash-command-routing.test.ts`: add scenarios for Path C — assert `dispatch_extension_command` emission with correct shape; assert no terminal `command_feedback` from bridge for Path C; assert Path D still fires when `isHeadlessRpcSession()` returns false.

## 8. Server-side dispatch handler

- [ ] 8.1 Add `dispatch_extension_command` to `packages/shared/src/protocol.ts` as an extension-to-server message: `{type: "dispatch_extension_command", sessionId: string, command: string, requestId: string}`.
- [ ] 8.2 Create `packages/server/src/rpc-keeper/dispatch-router.ts`. Exports `handleDispatchExtensionCommand(msg, ctx)`. Implements the lifecycle from `extension-rpc-dispatch` Requirement "Server-side dispatch routing to keeper".
- [ ] 8.3 Wire the handler into `pi-gateway.ts` (or `browser-gateway.ts` — wherever extension-to-server messages are dispatched). Ensure the message arrives at the new handler.
- [ ] 8.4 Use `headlessPidRegistry.writeRpc(sessionId, JSON.stringify({type: "prompt", message: command, id: requestId}))` to forward to the keeper.
- [ ] 8.5 Emit optimistic `command_feedback {sessionId, command, status: "completed"}` to all browser subscribers of that session on UDS-write success. Use the existing browser-broadcast helper in handler-context.
- [ ] 8.6 Emit `command_feedback {sessionId, command, status: "error", message: <reason>}` to browser subscribers on any failure (no keeper, retries exhausted, write error). Reasons: `"RPC keeper unavailable for this session"`, `"Failed to write RPC line: <error>"`.
- [ ] 8.7 Unit test `packages/server/src/__tests__/dispatch-extension-command-router.test.ts`: drive `handleDispatchExtensionCommand` with mock keeper-manager + mock browser broadcaster; assert correct event emissions for: success path, no-keeper path, write-fails path.

## 9. Cross-cutting behavior tests

- [ ] 9.1 Update existing `bridge-slash-command-routing.test.ts` to assert Paths B/C/D mutual exclusion: for each input, exactly one of (`pi.dispatchCommand` called, `connection.send dispatch_extension_command` called, sink got `error` feedback) fires — never two.
- [ ] 9.2 Add an integration smoke test (manual, document in tasks file): start dashboard with `useRpcKeeper: true`, spawn a headless session, type `/ctx-stats` in chat, assert chat shows `started → completed` (single row, dedup'd by reducer) AND ctx-stats output renders normally via bridge events.
- [ ] 9.3 Add a manual smoke test: kill the keeper PID directly while pi is running. Server next `dispatch_extension_command` should fail gracefully with "keeper unavailable" error feedback. Pi stays alive (now with closed stdin); subsequent slash commands fail until session is killed and respawned.
- [ ] 9.4 Add a manual smoke test: `/api/restart` while a keeper-managed session is running. Confirm session survives, slash dispatch works after server reconnects.
- [ ] 9.5 Add a manual smoke test: `/api/restart` immediately followed by `/ctx-stats` (race). Bridge resends after reconnect; expected outcome is one dispatch (any duplicate is at-most-once because pi's `_tryExecuteExtensionCommand` is idempotent on side-effect-free commands; document any non-idempotent case).

## 10. Documentation

- [ ] 10.1 Update `docs/architecture.md`: add an "RPC keeper sidecar" subsection under bridge / process-manager. Include a mermaid diagram of the three-process topology and the dual-channel boundary.
- [ ] 10.2 Update `docs/slash-command.md`: add Path C as the third decision branch in the existing flowchart; cite this change name; remove the "Path C rejected" decision (or amend it with "REOPENED in change `add-rpc-stdin-dispatch-with-keeper-sidecar` after Path B failed to ship through pi 0.74").
- [ ] 10.3 Update `AGENTS.md` Key Files: add rows for `packages/server/src/rpc-keeper/keeper.cjs`, `packages/server/src/rpc-keeper/keeper-manager.ts`, `packages/server/src/rpc-keeper/dispatch-router.ts`. Update the existing `slash-dispatch.ts` row with the Path C addition.
- [ ] 10.4 Update `CHANGELOG.md` `[Unreleased] → Fixed`: "Extension slash commands (`/ctx-stats`, `/curator`, `/agents`, `/flows:*`) now dispatch correctly in headless dashboard sessions via the new RPC keeper sidecar. Tmux / Windows Terminal sessions retain the existing stopgap until upstream `pi.dispatchCommand` ships."
- [ ] 10.5 Update `docs/faq.md`: add an entry "Why does /ctx-stats work in some sessions but not others?" — explain headless vs tmux distinction and the keeper architecture briefly.
- [ ] 10.6 Verify `openspec validate add-rpc-stdin-dispatch-with-keeper-sidecar --strict` passes.

## 11. Phase 1 ship criteria (default OFF)

- [ ] 11.1 Confirm `useRpcKeeper: false` is the default. Existing headless behavior unchanged for users who don't opt in.
- [ ] 11.2 Confirm all tests pass with the flag both ON and OFF. Add a CI matrix entry for `useRpcKeeper: true` if practical.
- [ ] 11.3 Document the opt-in in CHANGELOG with a clear note: "experimental — default off; flip in `~/.pi/dashboard/config.json` with `useRpcKeeper: true` to test extension slash commands in headless sessions."

## 12. Upstream follow-up (NOT blocking this change)

- [ ] 12.1 File a PR against `mariozechner/pi-coding-agent` (or `earendil-works/pi-coding-agent` — confirm correct upstream) adding `dispatchCommand(text, options?)` to `ExtensionAPI`. Reference both this change name and `fix-extension-slash-commands-in-dashboard`. Implementation: 5-line addition delegating to `session.prompt(text, {expandPromptTemplates: true, streamingBehavior: options?.streamingBehavior})`.
- [ ] 12.2 Once the upstream PR ships in some pi 0.x release: open a follow-up dashboard change `retire-rpc-keeper-when-dispatchCommand-available` to:
  - Flip `useRpcKeeper` default back to `false` (or remove the flag).
  - Mark Path C as deprecated; on pi versions with `dispatchCommand`, Path B is preferred.
  - After 1–2 releases, remove the keeper code entirely. The bridge's three-way decision collapses back to two-way.

## 13. Phase 2 ship criteria (default ON) — separate change

This phase is NOT covered by the current change. After Phase 1 has shipped and run for at least one release cycle without regressions, file a follow-up change `enable-rpc-keeper-by-default` to:

- [ ] 13.1 Flip `useRpcKeeper` default to `true`.
- [ ] 13.2 Retire the legacy non-keeper code paths in `process-manager.ts` (Unix `tail -f` wrapper, Windows direct stdin pipe).
- [ ] 13.3 Remove the `useRpcKeeper` config flag entirely (always-on behavior).
- [ ] 13.4 Migration documentation in CHANGELOG for users with custom spawn scripts (rare, but possible).
