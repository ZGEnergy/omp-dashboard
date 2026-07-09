# Tasks

## 1. Preconditions

- [ ] 1.1 Read `packages/automation-plugin/{package.json,src/server/index.ts,src/server/routes.ts}` + its manifest — confirm the self-contained package shape, dep set, and `ctx.fastify` route-mount to mirror.
- [ ] 1.2 Read `packages/flows-plugin/src/server/automation-actions.ts:118-142` — confirm the `flow:run`-into-session dispatch (payload shape, cwd→running-session mapping) the flow-triggering ops reuse.
- [ ] 1.3 Read `extensions/invoicebot/index.ts` in pi-invoice-bot — enumerate each selector's args + result `details` shape, to derive the `InvoiceEngine` port + Fake fixtures faithfully (source of truth for Decision 0).
- [ ] 1.4 `npm test` baseline green; capture log.

## 2. Plugin package scaffold (+ interim file: dep)

- [ ] 2.1 Create `packages/invoicebot-plugin/` (package.json, manifest, tsconfig, vitest.config, AGENTS.md) mirroring `automation-plugin`. In-monorepo deps (`dashboard-plugin-runtime`, `pi-dashboard-shared`, `pi-dashboard-client-utils`).
- [ ] 2.2 ⚠️ Add interim dep `"@blackbelt-technology/invoicebot": "file:../pi-invoice-bot"` with an inline `TODO(release): unpublished — replace file: link with a published npm range or a vendored in-monorepo package` marker. Mirror the marker in the package README + AGENTS row.
- [ ] 2.3 Add `packages/invoicebot-plugin` under the `packages/*` workspace; `npm install`; verify the `file:` link resolves locally.
- [ ] 2.4 Register the plugin in the dashboard plugin loader / manifest list.

## 3. Engine port + Real (file link) + Fake

- [ ] 3.1 `src/server/engine/port.ts`: `InvoiceEngine` interface — `query/review/setup/rules(cwd, args)` covering the pure ops, typed from §1.3.
- [ ] 3.2 `src/server/engine/real.ts`: `RealInvoiceEngine` importing the invoice-bot engine facade over the `file:` link; wraps each op in `ibContext.run({ cwd }, ...)` (needs §5b).
- [ ] 3.3 `src/server/engine/fake.ts`: `FakeInvoiceEngine` returning fixtures matching the real tool `details` shapes; fixtures mirror the HTML-mock data.
- [ ] 3.4 Binding selection: use `RealInvoiceEngine` when the facade resolves (sibling present), else `FakeInvoiceEngine` (CI / `release-cut`). Log which binding is active at plugin load.
- [ ] 3.5 Tests (Fake-backed, no sibling needed): each selector returns the documented shapes; routes import only the port.

## 4. Routes — pure ops (via port)

- [ ] 4.1 `POST /query`: require `cwd` + `view`; call `engine.query(cwd, args)`; return verbatim. 400 on missing cwd/view.
- [ ] 4.2 `POST /setup`: require `cwd` + `action`; pure `connector/authorize/cadence/handoff_target/config/intake`.
- [ ] 4.3 `POST /rules`: require `cwd` + `action`; pure `approve/reject/move/archive`; `request` in §5.
- [ ] 4.4 `POST /review`: require `cwd` + `action`; pure `note/cash/reconcile/assign` + `handoff` (prep + confirm).
- [ ] 4.5 Tests: each pure path forwards with the right cwd/args and returns the result; missing cwd/selector → 400; concurrent A/B requests never cross `cwd`.

## 5. Routes — flow-triggering ops (dispatch into workspace session)

- [ ] 5.1 `dispatchFlow({cwd, flowName, task|inputs, sessionId?})` with two branches:
  - **Reuse**: if `sessionId` (param or linked) is live, cwd-matched, and an invoicebot session → `ctx.emitEventToSession(sessionId, { eventType:"flow:run", data:{ flowName, task|inputs } })`; no spawn; return that `sessionId`.
  - **Spawn**: else generate a `runId`; `ctx.spawnSession({ cwd, automationRun:{ runId, visibility }, model? })`; deliver `flow:run` into the spawned session.
  Confirm the plugin passes the `emitEventToSession`/`spawnSession` trust gate.
- [ ] 5.2 Spawn correlation: in `ctx.onEvent`, bind `sessionId` when the registering session's stamped `automationRun.runId` matches. **Correlate by `runId`, never cwd** (documented footgun). Validate reuse target (live + cwd match + invoicebot session); stale/invalid `sessionId` falls through to spawn. Maintain an `invoice_id ↔ sessionId` map.
- [ ] 5.3 Wire `review` `approve` / `repair` / `submit` / `partner op:confirm`: port-side DB effect THEN `dispatchFlow(invoicebot:process)`; return `sessionId` (or `runId`/`spawnToken`) and record the link.
- [ ] 5.4 Wire `rules` `request`: `dispatchFlow(invoicebot:add-rule)` with the JSON task; stages only, no live ruleset change.
- [ ] 5.5 Tests: reuse branch emits into the supplied live session (no spawn) and returns it; spawn branch binds `sessionId` by `runId` (a same-cwd decoy session is NOT mis-bound); an unrelated/stale `sessionId` falls through to spawn and is never injected into; `request` does not alter the live ruleset.

## 5b. invoice-bot: request-scoped state dir + facade (prerequisite for RealInvoiceEngine)

- [ ] 5b.1 In `flows/invoicebot/process/_store.ts`: add `ibContext = new AsyncLocalStorage<{cwd:string}>()`; replace the `STATE_DIR` const with `stateDir()` (order `IB_STATE_DIR` → `ibContext.getStore()?.cwd` → `process.cwd()`); derive `BLOB_DIR`/`DB_PATH` from `stateDir()`.
- [ ] 5b.2 Switch the 6 import sites (`_config/_intake/_rules/_handoff/parse-document/parse-statement`) `STATE_DIR` → `stateDir()`.
- [ ] 5b.3 Add engine facade `extensions/invoicebot/engine.ts` exporting `{ ibContext, query, review, setup, rules }` (share the tool bodies' logic, DRY) + `exports` in `package.json`.
- [ ] 5b.4 Tests (invoice-bot): `stateDir()` resolves per `ibContext.run({cwd})`; defaults to `process.cwd()`; `IB_STATE_DIR` wins; two scopes read isolated DBs. Existing in-session tests still pass.

## 6. Session seam + security gates

- [ ] 6.1 `resolveSessionId(invoiceId): Promise<string|null>`: return the recorded `invoice_id ↔ sessionId` link; fall back to a `ctx.sessionManager.listAll()` scan for sessions in the workspace running `invoicebot:process`; return `null` (never throw) when none matches. Tests: recorded link returns it; fallback resolves an intake session; unknown → null.
- [ ] 6.2 Validate `cwd` (existing directory; reject traversal). Mark consequential ops (`approve/reject/repair/rule-approve/handoff` + setup/rules writes) in the response contract so the client gates behind confirm.
- [ ] 6.3 `security-hardening` checkpoint over routes; `doubt-driven-review` on the port contract (drop-in fidelity for the future Real adapter).

## 7. Docs & closeout

- [ ] 7.1 `packages/invoicebot-plugin/AGENTS.md` per-file rows; pointer in `docs/architecture.md` for the REST plane + port boundary + pure/flow-triggering split (delegate docs writes per Rule 6).
- [ ] 7.2 `npm test` green; code-review + code-quality gates before commit.
- [ ] 7.4 **Sync the living API contract**: every route/selector/arg/response/state/gap change lands in `api-contract.md` (+ `gaps.md` when a gap moves) in the SAME commit. At the code-review gate, diff the routes against `api-contract.md` §§6–9 + §14; a mismatch blocks the commit.
- [ ] 7.3 ⚠️ File a release-blocker tracking item (issue or `TODO(release)` grep target) for the `file:../pi-invoice-bot` link so §8 cannot be forgotten. `grep -rn 'TODO(release)' packages/invoicebot-plugin` must return the marker until §8 lands.

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
