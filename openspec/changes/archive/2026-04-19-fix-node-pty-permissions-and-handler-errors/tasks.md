## 1. Hoist-aware node-pty permission fix

- [x] 1.1 Rewrite `packages/server/scripts/fix-pty-permissions.cjs` to locate `node-pty` via `require.resolve("node-pty/package.json")` and walk `prebuilds/*/spawn-helper`, chmod-ing each to `0o755`. Keep the top-level try/catch but narrow it so a missing `node-pty` is a silent no-op while individual chmod failures are logged to stderr.
- [x] 1.2 Also chmod `prebuilds/*/pty.node` to `0o755` defensively (some installers strip modes on any binary, not just the helper).
- [x] 1.3 Add a `"postinstall": "node packages/server/scripts/fix-pty-permissions.cjs"` entry to the workspace-root `package.json`. Leave the existing `packages/server/package.json` postinstall in place (idempotent).
- [x] 1.4 Run `npm install` at the repo root and verify `ls -la node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper` shows the `x` bit set.

## 2. Narrow browser-gateway exception swallowing

- [x] 2.1 In `packages/server/src/browser-gateway.ts`, split the existing `ws.on("message", ...)` try/catch into two try blocks: one around `JSON.parse` (silent drop on failure, preserving current behavior), one around the message-type `switch` whose catch logs `[browser-gw] handler error type=${msg.type}: ${err}` via `console.error`.
- [x] 2.2 Ensure the connection is NOT closed on handler errors (the WebSocket must remain open for subsequent messages).
- [x] 2.3 Verify by code-reading that no other try/catch around the switch path re-swallows the error before it reaches the logger.

## 3. Regression tests

- [x] 3.1 Add `packages/server/src/__tests__/fix-pty-permissions.test.ts` (or `.cjs` equivalent) that:
  - Skips on `process.platform === "win32"`.
  - Resolves `node-pty/package.json`, finds `prebuilds/<current-platform>/spawn-helper`.
  - Asserts the file exists and `fs.statSync(...).mode & 0o111 !== 0`.
- [x] 3.2 Add a vitest test for the browser-gateway exception path:
  - Stub a `terminalManager` whose `spawn` throws `new Error("posix_spawnp failed.")`.
  - Drive a minimal browser-gateway context and invoke the dispatcher with a `create_terminal` message.
  - Spy on `console.error` and assert it is called with a string containing `[browser-gw] handler error` and `type=create_terminal`.
  - Assert the stub-backed `broadcast` is NOT called with a `terminal_added` message.
- [x] 3.3 Add a vitest test that a malformed JSON frame (e.g. `"{not json"`) is dropped without invoking `console.error` with the handler-error prefix.

## 4. Validate and document

- [x] 4.1 Run `npm test` — the three new tests pass under targeted vitest run (`npx vitest run packages/server/src/__tests__/fix-pty-permissions.test.ts packages/server/src/__tests__/browser-gateway-handler-errors.test.ts`: 3/3 pass). Full `npm test` run skipped at user's request (the full suite kills the agent session).
- [x] 4.2 Validated against the running server: `chmod -x` on both `darwin-arm64` and `darwin-x64` `spawn-helper`, then `node packages/server/scripts/fix-pty-permissions.cjs` restored `-rwxr-xr-x` on both, simulating the postinstall path on a fresh install.
- [x] 4.3 Covered by automated regression test `browser-gateway-handler-errors.test.ts > logs handler exceptions with type and error`, which drives a thrown `posix_spawnp failed.` through the dispatcher and asserts the `[browser-gw] handler error type=create_terminal` log line.
- [x] 4.4 Update `AGENTS.md` entry for `scripts/fix-pty-permissions.cjs` to reflect the new hoist-aware resolution and the root-level postinstall wiring.
- [x] 4.5 Update `docs/architecture.md` if it documents the browser-gateway error handling; note that handler exceptions are now logged.
