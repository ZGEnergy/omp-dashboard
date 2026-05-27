## 1. Tests first (TDD)

- [ ] 1.1 Add `packages/extension/src/__tests__/bridge-hasui-flip.test.ts` with a fixture that builds a fake `ctx` (`hasUI: false`, minimal `ui` stub) and a fake `pi`, drives the bridge's `session_start` path, then asserts: `ctx.hasUI === true` after the handler completes AND the bridge's `cachedHasUI` (exposed via the existing test-export pattern or via a returned snapshot) is still `false`
- [ ] 1.2 Add a sibling scenario with `hasUI: true` (tmux-like fixture) asserting the flip is a no-op (`ctx.hasUI === true` before AND after, `cachedHasUI === true`)
- [ ] 1.3 Add a `defineProperty(ctx, "hasUI", { get: () => false })` (non-writable) scenario asserting the bridge logs `[dashboard] failed to flip ctx.hasUI` exactly once via a spied `console.warn` AND does not throw
- [ ] 1.4 Run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm the three new tests FAIL with the pre-change bridge (red phase)

## 2. Implementation

- [ ] 2.1 In `packages/extension/src/bridge.ts`, locate the end of the `ctx.ui.*` PromptBus patching block (just after the `(ctx.ui as any).notify = ...` assignment, ~line 1521) inside `session_start`
- [ ] 2.2 Add a try/catch block: `try { (ctx as any).hasUI = true; } catch (err) { console.warn("[dashboard] failed to flip ctx.hasUI", err); }`
- [ ] 2.3 Verify the assignment is below the existing `cachedHasUI = ctx.hasUI` line (~line 1287) so `cachedHasUI` retains the pre-flip value
- [ ] 2.4 No other code touched; the change is one localized try/catch

## 3. Green phase

- [ ] 3.1 Re-run `npm test 2>&1 | tee /tmp/pi-test.log` and confirm all new tests PASS
- [ ] 3.2 `grep -nE 'FAIL|✗|Error' /tmp/pi-test.log` returns no regressions

## 4. Manual verification

- [ ] 4.1 `npm run build` to rebuild the client
- [ ] 4.2 `curl -X POST http://localhost:8000/api/restart` to restart the server
- [ ] 4.3 `npm run reload` to push the new bridge code to active sessions
- [ ] 4.4 Spawn a new dashboard session (headless RPC), type `/ctx-stats` in chat — verify the "context-mode stats (Pi)" card renders below the green "completed" pill
- [ ] 4.5 Repeat with `/ctx-doctor` — verify the "ctx-doctor (Pi)" card renders
- [ ] 4.6 (Optional) install a missing `agent-browser` binary scenario: trigger any pi-agent-browser tool call in a dashboard session and confirm the install-confirm dialog appears instead of silently failing
- [ ] 4.7 (Optional) trigger a `web_search` via pi-web-access and confirm the curator window opens (documenting the side effect from design.md Decision 4)

## 5. Docs

- [ ] 5.1 Add an FAQ row to `docs/faq.md` under "Q: My `/ctx-stats` / `/ctx-doctor` output isn't showing — only a green pill" pointing at this change
- [ ] 5.2 Add a release-note line for the pi-web-access workflow default behavior change (`workflow: "none"` opt-out)
- [ ] 5.3 Update `docs/file-index-extension.md` row for `packages/extension/src/bridge.ts` if its "See change:" annotation is touched (caveman style; delegate to subagent per Documentation Update Protocol)

## 6. Verify + archive (post-merge)

- [ ] 6.1 Run `./node_modules/.bin/openspec validate fix-bridge-hasui-for-headless-rpc --strict` — expect clean
- [ ] 6.2 After landing, archive the change via `openspec-archive-change` skill
