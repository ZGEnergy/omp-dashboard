# Design — InvoiceBot REST plugin (self-contained, engine-port boundary)

> **Client-developer API reference:** [`api-contract.md`](./api-contract.md) — every endpoint, `cwd` handling, all selector variants, parameters, request/response shapes, session linkage, and a TypeScript client skeleton. Complete enough to build a client without reading source.
>
> **Open gaps (client integration):** [`gaps.md`](./gaps.md) — four gaps (`G1`–`G4`) surfaced wiring the client: summary-only surface (G1), narrative-only explain (G2), deferred blob bytes (G3), no Ask-session endpoint (G4). Board (01) fully covered. (OAuth-on-WS is intended design, not a gap — see `api-contract.md` §8.)


## Context

- InvoiceBot logic = four pi tools (`ib_query`/`ib_review`/`ib_setup`/`ib_rules`) in `@blackbelt-technology/invoicebot` (`extensions/invoicebot/index.ts`). They run only inside a pi session.
- Data is **directory-scoped**: `<cwd>/.pi/flows/invoicebot-state/` (DB, blobs, rules.db, evaluator, config JSON, connectors). Store is **open-per-call** (`withDb`, WAL, `busy_timeout=5000`) → one process can serve any workspace **if cwd is per-call**.
- **Monorepo reality:** workspaces = `packages/*`. Existing plugins (`automation-plugin`, `flows-plugin`) depend **only on in-monorepo packages** — none import an external sibling repo. `@blackbelt-technology/invoicebot` is `private: true` and **unpublished**, so no npm version range exists yet. Interim mechanism (below): a `file:../pi-invoice-bot` link, explicitly marked release-blocking.
- Dashboard plugin idiom (`automation-plugin`): client sends `?cwd=`; plugin forwards cwd. `ServerPluginContext` gives one shared `fastify` + `logger` + `sessionManager.listAll()` — no ambient workspace cwd.
- Browser/bridge WS protocol is **prompt-streaming only** — no synchronous tool-call RPC. Hence REST for data.

## Decision 0 — Self-contained plugin behind an `InvoiceEngine` port (build now, decide engine-home later)

The plugin is a normal monorepo package with the same dep set as the other plugins. It codes against a port, not against the invoice repo:

```ts
// packages/invoicebot-plugin/src/server/engine/port.ts
export interface InvoiceEngine {
  query(cwd: string, args: { view: string; [k: string]: unknown }): Promise<unknown>;
  review(cwd: string, args: { action: string; [k: string]: unknown }): Promise<unknown>; // pure actions only
  setup(cwd: string, args: { action: string; [k: string]: unknown }): Promise<unknown>;
  rules(cwd: string, args: { action: string; [k: string]: unknown }): Promise<unknown>;  // approve/reject/move/archive
}
```

- **`RealInvoiceEngine`** (default) imports the engine facade over the interim `file:` link (Decision 0b).
- **`FakeInvoiceEngine`** (fixtures, mirrors the HTML-mock data) backs unit tests / CI, where the `file:` sibling is absent.

Why a port: it decouples "build the plugin" from "where the engine ultimately lives," so retiring the `file:` link later (publish or vendor) touches only the adapter binding, not the routes. It also mirrors the client contract's swap-a-Fake-for-Real strategy on the server side.

## Decision 0b — Interim engine binding: direct `file:` link, marked MUST-CHANGE

`@blackbelt-technology/invoicebot` is unpublished, so the plugin depends on it via `"@blackbelt-technology/invoicebot": "file:../pi-invoice-bot"`. This is a **temporary, release-blocking shortcut**:

- It is a **relative path to a sibling git repo**. It resolves for local dev (the sibling sits at `../pi-invoice-bot`) but **NOT in CI / `release-cut`** (no sibling checkout) — so those builds bind `FakeInvoiceEngine`.
- Every occurrence carries a marker: `TODO(release): unpublished — replace file: link with a published npm range or a vendored in-monorepo package`.
- **Exit before release** (own follow-up): either **publish** `@blackbelt-technology/invoicebot` (drop `private`, real version range) **or** **vendor** the engine into a `packages/*` package. The port makes either a drop-in swap.

## Decision 1 — Transport: 4 POST endpoints, cwd per request

`/api/plugins/invoicebot/{query|review|setup|rules}`, each requiring `cwd` + its selector (`view`/`action`), forwarding `{selector, ...args}` to the matching port method and returning the result verbatim. Mirrors automation-plugin's `?cwd=` idiom. Missing `cwd` or selector → `400`, no side effect.

## Decision 2 — Two op classes

| Class | Ops | How served |
|---|---|---|
| Pure DB/file | all `ib_query` views; `note/cash/reconcile/assign`; `connector/authorize/cadence/handoff_target/config/intake`; `rules approve/reject/move/archive`; `handoff` (DB-prep + confirm) | `InvoiceEngine` port, keyed by `cwd` |
| Flow-triggering | `approve`, `repair`, `submit`, `partner-confirm`, `rules-request` | port does the DB side effect, THEN plugin dispatches `flow:run` into workspace W's session |

The 5 flow-triggering ops advance the invoice through the pi-flows engine (approve→resume `invoicebot:process`; repair→re-run; submit→process ref; partner-confirm→resume; rules-request→`invoicebot:add-rule`). A headless dashboard process has no session bus; `flows-plugin/src/server/automation-actions.ts:118` already runs invoice flows by emitting `flow:run` **into the workspace's running session**. The plugin's `dispatchFlow({cwd, flowName, task|inputs})` reuses that path. This is **dashboard-side and engine-source-independent** — it works under the Fake engine too (Fake records the DB intent; the flow dispatch is real).

## Decision 2b — Request-scoped state dir + engine facade (invoice-bot change, in scope)

The in-process `RealInvoiceEngine` needs the store to resolve its state dir **per request** from `cwd`. Today `_store.ts` reads a module-const once at import. Replace it with a resolver:

```ts
// _store.ts
export const ibContext = new AsyncLocalStorage<{ cwd: string }>();
export function stateDir(): string {
  if (process.env.IB_STATE_DIR) return resolve(process.env.IB_STATE_DIR);
  return resolve(ibContext.getStore()?.cwd ?? process.cwd(), ".pi/flows/invoicebot-state"); // default = in-session behavior
}
```

- 6 import sites (`_config, _intake, _rules, _handoff, parse-document, parse-statement`) switch `STATE_DIR` → `stateDir()`.
- The `RealInvoiceEngine` wraps each op in `ibContext.run({ cwd }, () => facade.query(...))`.
- Add engine facade `extensions/invoicebot/engine.ts` exporting `{ ibContext, query, review, setup, rules }` (thin wrappers over the same logic the tools call) + `exports` in `package.json`; the dashboard imports the facade only.

**ALS safety:** the store is synchronous (`node:sqlite` `DatabaseSync`, sync `withDb`) — no `await` between `ibContext.run(...)` and the `stateDir()`/DB read, so concurrent requests cannot cross-contaminate. Documented invariant: any future async pure op must still read `stateDir()` within the same ALS callback.

## Decision 2c — Read surface = the current 9 ib_query views (partners etc. deferred)

The REST `/query` endpoint wraps `ib_query` verbatim, so its read surface is exactly the 9 views: `pending`, `surface`, `list`, `status`, `explain`, `finance`, `rules`, `diagram`, `search`. Invoices are fully covered (`list` + `pending` + `search` + `surface`).

**Known gap (deferred):** the store exposes `listPartners()`, `listNotes()`, `listVouchers()`, `listBankAccounts()`, `listBankTransactions()`, `listCashPayments()`, `listDecisions()`, `listInvoiceEvents()`, but **no `ib_query` view surfaces them** — so neither the pi tools nor REST can read them today. The plugin SHALL NOT reach into these store functions directly (that re-implements logic + bypasses the tool contract). To expose any of them, add an `ib_query` view upstream in invoice-bot (`view:"partners"`, …); the REST plane inherits it with no plugin change. Out of scope here per explicit decision.

## Decision 3 — Flow-triggering ops: reuse a session when `sessionId` is given, else spawn; always return `sessionId` (seam is REAL)

Each flow-triggering op runs its flow in a pi session and surfaces that session's `sessionId`, so the board card (invoice) connects to the chat (session). The host exposes **`ctx.emitEventToSession(sessionId, { eventType, data })`** (emit a pi event into a RUNNING session) alongside `ctx.spawnSession` — so reuse is a first-class path.

**Reuse branch (preferred when a live `sessionId` is available):**
1. `sessionId` arrives as a request parameter, OR the plugin's `invoice_id ↔ sessionId` map already holds a live one.
2. Validate: `ctx.sessionManager.getSession(sessionId)` exists, its `cwd` equals the request `cwd`, and it is an invoicebot session (never inject `flow:run` into an unrelated user session — security gate).
3. `ctx.emitEventToSession(sessionId, { eventType: "flow:run", data: { flowName, task|inputs } })`. No spawn.
4. Return the same `sessionId`.

**Spawn branch (no live session to reuse):**
1. Generate a `runId`; `ctx.spawnSession({ cwd, automationRun: { runId, visibility }, model? })` — host runs a fresh session in `W`, stamps it `automationRun.runId` on `session_register`, returns a `spawnToken`.
2. Deliver `flow:run` into the spawned session.
3. `ctx.onEvent((sessionId, ev) => …)`: capture `sessionId` when the registering session's stamped `automationRun.runId` matches. **Correlate strictly by `runId`, NEVER by cwd** (documented footgun in `automation-plugin`: a cwd-FIFO bind targets the wrong session).
4. Persist the `invoice_id ↔ sessionId` link. Return `sessionId` (once bound) or the `runId`/`spawnToken` to poll.

`resolveSessionId(invoiceId)` returns the linked `sessionId` from the map (**real, not a stub**), falling back to a `ctx.sessionManager.listAll()` scan (sessions in `W` running `invoicebot:process`) for intake-spawned sessions.

**Notes:**
- *Stale `sessionId`.* If the provided/mapped `sessionId` is dead or fails validation, fall through to the spawn branch — reuse never strands the op.
- *Link persistence.* In-memory per dashboard boot suffices; persist only to survive a restart.
- *Trust gate.* `spawnSession`/`emitEventToSession` are gated to first-party/trusted plugins — confirm the invoicebot plugin qualifies (mirrors `automation-plugin`).

## Deferred — retire the interim `file:` link before release (follow-up change)

The interim binding is **C (`file:../pi-invoice-bot`)**. It MUST be replaced before release with one of:

| Exit | Shape | Consequence |
|---|---|---|
| **A. Vendor** | port `flows/invoicebot/process/*` + facade into `packages/invoicebot-engine/` (or into the plugin) | fully self-contained like other plugins; needs a "where does the engine now live" story vs the pi-invoice-bot repo (avoid duplication) |
| **B. Publish** | drop `private`, publish `@blackbelt-technology/invoicebot`, plugin deps the registry range | self-contained via registry; couples release cadence; single engine source |

Either is a **drop-in swap behind the port** — only `package.json` (the dep line) and the `RealInvoiceEngine` import path change; routes and the ALS/facade seam (Decision 2b, already in scope) stay put. Until then: `release-cut` and CI must not ship the `file:` link (they bind `FakeInvoiceEngine`); the marker `TODO(release): …` gates the exit.

## Risks / open items

1. **Port fidelity** — the port must cover exactly what the 4 tools return so the Real adapter is drop-in. Derive it from the tool bodies (`extensions/invoicebot/index.ts`), not guessed. `doubt-driven-review` before it stands.
2. **Fake drift** — Fake fixtures must match the real tool result shapes (states, field names) or the client silently diverges. Pin fixtures to the tool's `details` payloads.
3. **Engine events not on REST** — pure ops emit `ib:*` on the session bus, absent in-process; REST is request/response, client refetches. State in the contract; no caller expects REST streaming.
4. **Deferred packaging spike** — whether the in-process Real adapter resolves invoice-bot under the dashboard's jiti loader (A/B) is a follow-up spike, not a blocker now.
5. **Consequential-action gate** — `approve/reject/repair/rule-approve/handoff` + any setup/rules write are consequential; the contract marks them so the client gates behind confirm. Server validates `cwd`, rejects blob path traversal.
