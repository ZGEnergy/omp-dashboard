# Tasks

## 1. Preconditions

- [x] 1.1 Read `packages/automation-plugin/{package.json,src/server/index.ts,src/server/routes.ts}` + its manifest — confirm the self-contained package shape, dep set, and `ctx.fastify` route-mount to mirror.
- [x] 1.2 Read `packages/flows-plugin/src/server/automation-actions.ts:118-142` — confirm the `flow:run`-into-session dispatch (payload shape, cwd→running-session mapping) the flow-triggering ops reuse.
- [x] 1.3 Read `extensions/invoicebot/index.ts` in pi-invoice-bot — enumerate each selector's args + result `details` shape, to derive the `InvoiceEngine` port + Fake fixtures faithfully (source of truth for Decision 0).
- [x] 1.4 `npm test` baseline green; capture log. _(Baseline: 22 failed / 9538 passed — all pre-existing, unrelated. Log: /tmp/ib-baseline-test.log.)_

## 2. Plugin package scaffold (+ interim file: dep)

- [x] 2.1 Created `packages/invoicebot-plugin/` (package.json, manifest, tsconfig, vitest.config, README, AGENTS tree) mirroring `automation-plugin`. Server-only (no client — WS plane deferred), so deps = `dashboard-plugin-runtime` + `pi-dashboard-shared` (client-utils is a client dep, omitted — nothing server-side imports it).
- [x] 2.2 ⚠️ Added interim dep as an **`optionalDependency`** `"@blackbelt-technology/invoicebot": "file:../../../pi-invoice-bot"` (corrected path per user decision — resolves to the sibling from the package dir in the main repo). `TODO(release)` marker in the `//optionalDependencies` JSON key + README + AGENTS row. Optional so CI/release/worktree `npm install` succeeds without the sibling (binds Fake).
- [x] 2.3 Added to the `packages/*` workspace; `npm install` clean. Main repo `file:../../../pi-invoice-bot` → `/Users/robson/Project/pi-invoice-bot` (Real binds); this worktree → `.worktrees/pi-invoice-bot` (dangling → optional skip → Fake), the designed CI/worktree behavior.
- [x] 2.4 Auto-discovered by `discoverPlugins()` (scans `packages/*` for the `pi-dashboard-plugin` manifest) + enabled by default (`pluginCfg.enabled !== false`). No allowlist edit needed.

## 3. Engine port + Real (file link) + Fake

- [x] 3.1 `src/server/engine/port.ts`: `InvoiceEngine` (`query/review/setup/rules(cwd, args)`) + `EngineResult = {content, details, flow?}` (flow present only for the 5 flow-triggering ops) + `BoundEngine`.
- [x] 3.2 `src/server/engine/real.ts`: `RealInvoiceEngine` (thin pass-through to the facade, which wraps each op in `ibContext.run({cwd})`) + `loadRealEngine()` guarded dynamic import (→ null when the optional dep is absent).
- [x] 3.3 `src/server/engine/fake.ts`: `FakeInvoiceEngine` fixtures matching the tool `details` shapes (api-contract §6–§9); sets `flow` for the 5 flow-triggering ops.
- [x] 3.4 `src/server/engine/select.ts`: Real when `loadRealEngine()` resolves, else Fake; logs the active binding at load.
- [x] 3.5 `__tests__/engine.test.ts`: each selector's documented shape + flow-vs-pure classification. Routes import only the port.

## 4. Routes — pure ops (via port)

- [x] 4.1 `POST /query`: requires `cwd` + `view`; `engine.query(cwd, args)`; normalized envelope. 400 on missing cwd/view/bad dir.
- [x] 4.2 `POST /setup`: requires `cwd` + `action`; pure; `consequential` on `config` w/ consent.
- [x] 4.3 `POST /rules`: requires `cwd` + `action`; pure `approve/reject/move/archive`; `request` flow-triggering (§5).
- [x] 4.4 `POST /review`: requires `cwd` + `action`; pure `note/cash/reconcile/assign` + `handoff` (prep/confirm); flow-triggering approve/repair/submit/partner-confirm (§5).
- [x] 4.5 `__tests__/routes.test.ts`: forwarding w/ right cwd/args; missing cwd/selector/bad-dir → 400 (no engine call); concurrent A/B never cross cwd.

## 5. Routes — flow-triggering ops (dispatch into workspace session)

- [x] 5.1 `createSessionLink(deps).dispatchFlow({cwd, flow, sessionId?, invoiceId?})` — reuse via `emitEventToSession` when live+cwd-matched+invoicebot session; else spawn. Plugin is first-party → passes the trust gate. Original spec:
  - **Reuse**: if `sessionId` (param or linked) is live, cwd-matched, and an invoicebot session → `ctx.emitEventToSession(sessionId, { eventType:"flow:run", data:{ flowName, task|inputs } })`; no spawn; return that `sessionId`.
  - **Spawn**: else generate a `runId`; `ctx.spawnSession({ cwd, automationRun:{ runId, visibility }, model? })`; deliver `flow:run` into the spawned session.
  Confirm the plugin passes the `emitEventToSession`/`spawnSession` trust gate.
- [x] 5.2 `onEvent` correlation binds `sessionId` when the registering session's stamped `automationRun.runId` matches a pending spawn (deliver-on-register), NEVER by cwd. Reuse target validated (live + cwd match + `automationRun.name` starts `invoicebot`); stale/invalid falls through to spawn. `invoice_id ↔ sessionId` map maintained.
- [x] 5.3 Wired: the ENGINE (facade/Fake) does the DB effect + returns the captured `flow` spec; the route calls `dispatchFlow` and attaches `sessionId`. No re-implementation — the engine emits the exact `flow:run` the in-session tool would.
- [x] 5.4 Wired `rules request`: engine returns `flow: invoicebot:add-rule` (JSON task); route dispatches; `request` stages only (approve/reject are separate pure ops).
- [x] 5.5 `__tests__/session-link.test.ts`: reuse emits into the supplied live session (no spawn) + returns it; spawn binds by `runId` (same-cwd decoy NOT mis-bound); unrelated/wrong-cwd/non-invoicebot `sessionId` → spawn, never injected; bind-timeout → spawnToken; `request` carries only the add-rule flow.

## 5b. invoice-bot: request-scoped state dir + facade (prerequisite for RealInvoiceEngine)

- [x] 5b.1 In `flows/invoicebot/process/_store.ts`: added `ibContext = new AsyncLocalStorage<{cwd:string}>()` + `stateDir()` (order `IB_STATE_DIR` → `ibContext.getStore()?.cwd` → `process.cwd()`) + `blobDir()`/`dbPath()`. _(Kept back-compat `STATE_DIR`/`BLOB_DIR` value exports for the in-session test harness — tests set `IB_STATE_DIR` before import so they equal the functions. Production paths use the functions.)_
- [x] 5b.2 Switched import sites (`_config/_intake/_rules/_handoff/parse-document/parse-statement` + `intake.ts` `BLOB_DIR`) → `stateDir()`/`blobDir()`. `_rules.ts` + `_handoff.ts` top-level consts (`DB_PATH/MMD_PATH/EVAL_PATH/CANDIDATE_DIR/OUT_DIR`) → lazy functions (a const freezes the path before ALS is set).
- [x] 5b.3 Extracted shared selector logic to `extensions/invoicebot/engine-core.ts` (single source; index.ts tools + facade both use it). Added facade `extensions/invoicebot/engine.ts` exporting `{ ibContext, query, review, setup, rules }` (flow-triggering ops CAPTURE the `flow:run` spec + return it as `.flow`) + `package.json` `exports` (`./engine`).
- [~] 5b.4 Verified via jiti smoke — `stateDir()` per `ibContext.run({cwd})`, defaults to `process.cwd()`, isolated per-cwd DBs, facade `query`/`review` work, `submit` captures the flow spec, `note` writes without a flow. ⚠️ invoice-bot vitest CANNOT run here (pre-existing `@earendil-works/pi-ai` `./providers/faux` export breakage — fails identically on a clean tree). Added `tests/state-dir-scoping.test.ts` (runs once pi-ai env is fixed).

## 6. Session seam + security gates

- [x] 6.1 `resolveSessionId(invoiceId, cwd?)` (in `session-link.ts`): returns the recorded link; falls back to a `listAll()` scan for a workspace invoicebot session; returns `null` (never throws). Tests: recorded link / intake-session fallback / unknown → null.
- [x] 6.2 `badCwd()` validates an existing directory (rejects NUL / non-dir / non-abs → 400). Consequential ops (`review` approve/reject/repair/handoff-confirm; `rules` approve/archive/request-consent; `setup` config-consent) flagged `consequential:true` in the envelope (api-contract §10 + §3 synced).
- [x] 6.3 security-hardening: cwd validated (no traversal), flow:run gated behind `isInvoicebotSession` (never injected into an unrelated user session), consequential ops flagged for client confirm, blob-byte delivery deferred (G3, no path exposure). doubt-driven-review: the port bodies are EXTRACTED from the tool source (engine-core, single source) — not guessed — so Real is a genuine drop-in; the captured-`flow` seam preserves the exact in-session `flow:run` shape.

## 7. Docs & closeout

- [x] 7.1 `packages/invoicebot-plugin/AGENTS.md` + `src/server/AGENTS.md` + `src/server/engine/AGENTS.md` per-file rows written. `docs/architecture.md` pointer delegated to a subagent (Rule 6, caveman).
- [x] 7.2 Full `npm test` green: 2 failed / 9604 passed — both re-run green in isolation (publish-allowlist fixed by adding the pkg to `publish.yml` PACKAGES; recovery-offer is a known flaky 5.5s timing test, unrelated). Plugin 41/41. code-quality gate: `biome check --error-on-warnings` + `tsc --noEmit` clean. code-review (CodeRabbit) advisory — run at ship.
- [x] 7.4 Synced `api-contract.md`: added the server-set `consequential` response flag to §3 (matches routes `normalize()` + §10). Routes/selectors/args otherwise match §6–§9 (built to the contract). No gap moved (`gaps.md` unchanged — G1–G4 remain deferred).
- [x] 7.3 `grep -rn 'TODO(release)' packages/invoicebot-plugin` returns 6 markers (package.json `//optionalDependencies`, README, AGENTS, real.ts, select.ts, engine/AGENTS.md). Gates §8 until the link is retired.

## 8. Deferred — retire the interim `file:` link before release (separate follow-up)

- [ ] 8.1 ⚠️ Decide the exit: **A** (vendor engine into a `packages/*` package) or **B** (publish `@blackbelt-technology/invoicebot`, drop `private`). Replace the `file:` dep with the chosen source; delete the `TODO(release)` markers.
- [ ] 8.2 Verify `release-cut` / CI now bind `RealInvoiceEngine` (no more Fake fallback in shipped builds).
- [ ] 8.3 Spike (carry from 5b): Real adapter resolves under the dashboard jiti loader; `node:sqlite` present; graceful-fail if absent.

## 9. Deferred — conversation plane & delivery (separate follow-up)

- [ ] 9.1 WebSocket conversation plane (Surface 02/03), consuming the `sessionId` this change already surfaces: subscribe/event_replay → `adaptEventToEntry` → `MinimalChatEntry`; `send_prompt`/`abort`.

- [ ] 9.3 **[G3]** Original-document delivery (`getOriginalDocUrl`) — blob proxy endpoint serving `stateDir()/blobs/<handle>` for the request `cwd`, path-traversal-guarded. bytes vs signed URL vs proxied path.
- [ ] 9.4 **[G4]** Ask-session provisioning (lazy vs pre-provisioned vs `/api/sessions` resolve).
- [ ] 9.5 **[G1]** Richer invoice detail view upstream (buyer party, line items, VAT breakdown) — extend `surface` or add `view:"detail"`; plus other read views (`partners`, `notes`, `bank`, `decisions`) as needed; REST `/query` inherits each. (Current scope: the 9 existing views only — invoices covered, partners not.)
- [ ] 9.6 **[G2, optional]** Structured `stages[]` on `explain` (else client derives from `state` via `stagesForState()`).

> Client-integration gaps `G1`–`G4` are tracked in [`gaps.md`](./gaps.md). (OAuth-on-WS is intended design, documented in `api-contract.md` §8 — not a gap.)
