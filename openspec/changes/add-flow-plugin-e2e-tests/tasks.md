## 1. L1 unit gaps (no new deps — land first)

- [x] 1.1 Extend `packages/flows-anthropic-bridge-plugin/src/__tests__/peer-probe.test.ts`: scoped-name-before-legacy order; scoped-only resolves; legacy-only resolves via fallback; neither → `ok:false` with reason.
- [x] 1.2 Add tier-1-miss + tier-2-hit (`resolvePiPackage` entry path) and pi-flows `flow:register-agent-extension` listener-fallback cases to the probe test. (Verified ALREADY covered by existing peer-probe.test.ts — not duplicated.)
- [x] 1.3 Add/extend flows-plugin `flow-reducer` unit test: missing-start event → null state; start-then-progression → status advances, agents reach terminal. (New file `flow-reducer-seed-on-start.test.ts`.)
- [x] 1.4 Add a `sourcesMatch` / `parseSourceKey` unit case covering npm↔git↔local equivalence for a scoped peer (rename-aware). (Verified ALREADY covered by existing source-matching.test.ts `pi-anthropic-messages` git↔npm↔local cases — not duplicated.)
- [x] 1.5 Run `npm test`; verify 1.1–1.4 fail before the assertions exist (TDD) then pass. (19 tests pass across the two files.)

## 2. L2 contract-pinned bridge-forward + reducer (hermetic, NO dep) — amended per design D2

- [x] 2.1 Import `FLOW_EVENT_MAP` into a new flows-plugin test via relative `../../../extension/src/flow-event-wiring.js` (vitest maps `.js`→`.ts`); NO pi-flows dependency added. (New file `flow-reducer-bridge-contract.test.ts`.)
- [x] 2.2 Build a representative lifecycle sequence whose event types are taken from `FLOW_EVENT_MAP` VALUES (started → agent-started → agent-complete → complete), not hand-typed literals.
- [x] 2.3 Reduce the sequence from a null start through the flows-plugin `flow-reducer`; assert flow status reaches `success` and the agent reaches `complete`.
- [x] 2.4 Assert the reducer never throws on ANY mapped `flow_*` value (default passthrough; `flow_summary_started` verified unchanged).
- [x] 2.5 Assert the CORE lifecycle values each produce an observable `FlowState` mutation — the contract pin against silent drops.
- [x] 2.6 Run tests; L2 is hermetic (no browser/network/LLM/dep) and green (5 tests pass).

## 3. Faux scenario family + role-preset

- [ ] 3.1 Extend `qa/fixtures/faux-scenarios.ts` with a flow/subagent scenario family (per-agent branching by `context.systemPrompt`), keeping `script` as pure data + factories.
- [ ] 3.2 Add a faux role-preset (all roles → `faux/faux-1`) consumable by the harness so flow agents resolve to faux without per-spec wiring.
- [ ] 3.3 Decide + implement preset delivery (image-baked vs session-spawn-helper-injected per Open Question); document the choice.

## 4. Docker harness peer-presence variants

- [ ] 4.1 Add `PI_TEST_PEERS` selector to `docker/test-up.sh` (`both` | `no-am` | `legacy` | `bad-registration`); install/register peers accordingly.
- [ ] 4.2 Verify `both` yields `/api/health` `flows-anthropic-bridge` `bridgeLoadedFrom: "packages[]"` + status `active`.
- [ ] 4.3 Verify `no-am` yields `waiting_peers` with the missing scoped peer named in the peers report.
- [ ] 4.4 Verify `legacy` (peer under legacy name only) still reaches `active` via fallback (rename-skew guard).
- [ ] 4.5 Verify `bad-registration` (bridge only in `dashboardPluginBridges`) is detectable as not loaded from `packages[]`.

## 5. L3 full-stack render + activation e2e

- [ ] 5.1 Add `tests/e2e/flow-roundtrip.spec.ts`: spawn fresh session, launch the synthetic flow via the run-flow launcher, assert availability gate open + `FlowAgentCard` visible + flow completes.
- [ ] 5.2 Add `tests/e2e/anthropic-bridge-activation.spec.ts`: assert bridge `active` + `bridgeLoadedFrom` under `PI_TEST_PEERS=both`; assert `waiting_peers` under `no-am`.
- [ ] 5.3 Add `tests/e2e/subagent-inspector.spec.ts`: drive subagent activity (faux family or real spawn), assert the subagents inspector surface mounts.
- [ ] 5.4 Add a real-flow L3 regression (e.g. invoicebot) after the synthetic flow is green (per D5).
- [ ] 5.5 Run `npm run test:e2e`; confirm L3 specs pass against the Docker harness.

## 6. Wiring, docs, and gates

- [ ] 6.1 Add per-file rows for new test/fixture/harness files to the nearest directory `AGENTS.md` (tests/e2e, packages/*/__tests__, docker, qa/fixtures) per the Documentation Update Protocol.
- [ ] 6.2 Ensure the L2 dev-dep + L3 harness variants run in CI (extend the relevant workflow, or document opt-in) without breaking the vitest-only `npm test`.
- [ ] 6.3 Run the code-review + code-quality gates on the diff; fix Critical/Warning; confirm `npm run quality:changed` and `npm test` green before commit.
