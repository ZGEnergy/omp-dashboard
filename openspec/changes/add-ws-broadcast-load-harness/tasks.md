# Tasks

## 1. Preconditions

- [ ] 1.1 Read `packages/server/src/browser-gateway.ts` `fanout` / `broadcast` / `broadcastOpenSpecUpdateImpl` and confirm the `readyState`/`MAX_WS_BUFFER` guard shape the harness must exercise (lines ~265–305).
- [ ] 1.2 Read `packages/server/src/__tests__/browser-gateway-broadcast-serialize-once.test.ts` and confirm the `makeFakeWs` + `wss.emit("connection", ...)` + `attach` drain pattern the harness will extend.
- [ ] 1.3 Read `packages/server/src/session-bootstrap.ts:60-114` to confirm the poll-tick callback and the cold-boot `Promise.all` burst (scenario D).
- [ ] 1.4 Read `packages/shared/src/config.ts:118` (`pollIntervalSeconds: 60`) and confirm the validator clamp range (scenario E).
- [ ] 1.5 Confirm `OpenSpecData` type shape from `packages/shared` for `makeOpenSpecPayload` (valid synthetic payloads).
- [ ] 1.6 Run `npm test 2>&1 | tee /tmp/ws-load-baseline.log` and capture the green baseline.

## 2. Draining fake socket (the only real new primitive)

- [ ] 2.1 Create `packages/server/src/__tests__/helpers/draining-ws.ts` exporting `createDrainingWs({ drainRateBytesPerMs, readyState? })`.
- [ ] 2.2 Implement `send(frame)`: `bufferedAmount += byteLength(frame)`; push `{ seq, enqueuedAt, bytesAtEnqueue, type, cwd?, sessionId? }` (parse `type`/`cwd`/`sessionId` from the JSON frame, best-effort).
- [ ] 2.3 Implement `advance(ms)`: `drained += drainRateBytesPerMs * ms`; `bufferedAmount = max(0, bufferedAmount - drainRateBytesPerMs * ms)`; advance virtual `now`.
- [ ] 2.4 Implement `timeToFlush(predicate)`: locate the recorded frame; return virtual ms from its `enqueuedAt` until cumulative drain ≥ its `bytesAtEnqueue`. Pure function over the recorded log + drain rate.
- [ ] 2.5 Preserve the `EventEmitter` + `OPEN`/`readyState`/`bufferedAmount`/`send`/`close` surface so it is a drop-in for `makeFakeWs`.
- [ ] 2.6 Unit-test the primitive itself in `packages/server/src/__tests__/draining-ws.test.ts`: byte accounting, clamp-at-0 drain, FIFO `timeToFlush` (a frame behind a big frame flushes later), readyState skip.

## 3. Load fixtures

- [ ] 3.1 Create `packages/server/src/__tests__/helpers/load-fixtures.ts`.
- [ ] 3.2 `seedSessions({ focusedCwd, idleCwds, perCwd })` → populate a `MemorySessionManager` with running sessions across cwds.
- [ ] 3.3 `makeOpenSpecPayload(sizeBytes)` → valid `OpenSpecData` padded so `JSON.stringify(...).length ≈ sizeBytes`.
- [ ] 3.4 `attachClients(gateway, n, wsOpts)` → emit `connection` for N draining sockets, drain bootstrap sends, return the socket handles.
- [ ] 3.5 Export `DRAIN_FAST` / `DRAIN_SLOW` named presets with an "illustrative, not calibrated" comment.

## 4. Scenario matrix test

- [ ] 4.1 Create `packages/server/src/__tests__/browser-gateway-load.test.ts` with budget constants block at top (`REGRESSION TARGET` comments per Decision 5).
- [ ] 4.2 Scenario A — 1 focused session, no openspec: assert focused-event `timeToFlush` < baseline budget at FAST and SLOW.
- [ ] 4.3 Scenario B — 1 focused + N idle cwds each firing `openspec_update`: assert focused-event `timeToFlush` and assert `wastedBytes(focusedSocket) > 0` (proves the cross-cwd leak). Run across FAST/SLOW.
- [ ] 4.4 Scenario C — B + large per-cwd payload via `makeOpenSpecPayload`: assert latency grows with payload size; record peak `bufferedAmount`.
- [ ] 4.5 Scenario D — cold-boot connect burst: drive the `broadcastToAll`-per-dir pattern at connect; assert dropped-frame count (sends skipped by `MAX_WS_BUFFER`) and connect-time focused-snapshot latency.
- [ ] 4.6 Scenario E — B with poll interval 60 s→10 s (simulate 6× tick density over a fixed virtual window): assert the periodic latency-spike signature (latency pulses align with tick boundaries).
- [ ] 4.7 Add a "signature" assertion helper that classifies a latency-over-time series as `periodic` vs `flat` so the test encodes the "openspec vs upstream" decision rule.

## 5. Docs

- [ ] 5.1 Delegate to a docs subagent (caveman style, verbatim rule) to create `docs/perf-ws-broadcast-load.md`: harness model, drain-rate caveat, scenario matrix, metric definitions, periodic-vs-flat reading guide.
- [ ] 5.2 Delegate adding a row for each new file to the matching `docs/file-index-server.md` split (path-alphabetical).

## 6. Verification

- [ ] 6.1 `npm test 2>&1 | tee /tmp/ws-load.log`; `grep -nE 'FAIL|✗|Error' /tmp/ws-load.log` returns nothing.
- [ ] 6.2 Confirm the new tests run deterministically: run the suite 3× and confirm identical pass + identical recorded latency numbers (no clock flakiness).
- [ ] 6.3 `node_modules/.bin/openspec validate add-ws-broadcast-load-harness` passes.
- [ ] 6.4 Capture scenario B/E output and confirm it produces a readable periodic-vs-flat verdict for the original lag report.
