## Why

The InvoiceBot React app (Board / Opened-invoice / Ask / Settings surfaces) has no backend. Every screen calls a typed `InvoiceBotClient` whose methods are stubs. InvoiceBot's logic already exists as four role-scoped pi tools (`ib_query`, `ib_review`, `ib_setup`, `ib_rules`) in the `@blackbelt-technology/invoicebot` package, but those tools only run **inside a pi session** — the React app cannot reach them over request/response.

The invoice **data** is **directory-scoped, not session-scoped**: it lives under `<cwd>/.pi/flows/invoicebot-state/`. The store opens its connection **per-call** (WAL + `busy_timeout`, "multi-process writers safe"). So a single long-lived process can serve every workspace **as long as `cwd` is supplied per request** — the same idiom `automation-plugin` already uses (`?cwd=`).

We build the dashboard integration as a **self-contained monorepo plugin package**, like `automation-plugin`/`flows-plugin`. It codes against an `InvoiceEngine` **port** so the engine source stays swappable. **Interim dependency reality:** `@blackbelt-technology/invoicebot` is `private: true` and **not published to npm**, so it cannot be a normal version range yet. This change wires it via a **direct file link** (`file:../pi-invoice-bot`) — a **temporary, release-blocking shortcut that MUST change** before release (to a published npm range **or** a vendored in-monorepo package). Every place it appears is marked.

## What Changes

- **New plugin** `packages/invoicebot-plugin/`, mirroring `automation-plugin`'s structure. In-monorepo deps (`dashboard-plugin-runtime`, `pi-dashboard-shared`, `pi-dashboard-client-utils`) **plus one interim `file:../pi-invoice-bot` dependency** carrying a `TODO(release): unpublished — replace file: link with a published npm range or vendored package` marker.
- **Engine port at the plugin boundary.** The plugin defines `InvoiceEngine` (the ~26 pure ops) + a `dispatchFlow` capability and codes only against it.
  - **`RealInvoiceEngine`** binds to the engine facade imported over the `file:` link — the **default** binding.
  - **`FakeInvoiceEngine`** (fixtures) backs unit tests / CI, where the `file:` sibling is absent.
- **One bounded change in `@blackbelt-technology/invoicebot`** (prerequisite for the in-process real adapter, now in scope): replace the module-const `STATE_DIR` (read once from `process.cwd()`) with a `stateDir()` resolver backed by `AsyncLocalStorage`, and add a small **engine-facade export** (`exports` in `package.json`) so the dashboard imports a supported surface, not `flows/invoicebot/process/*` internals. Existing in-session behavior is unchanged (`stateDir()` defaults to `process.cwd()`).
- **Two op classes, one plane:**
  - **~26 pure DB/file ops** → `RealInvoiceEngine`, keyed by `cwd` (wrapped in `ibContext.run({cwd})`).
  - **5 flow-triggering ops** (`approve`, `repair`, `submit`, `partner-confirm`, `rules-request`) → port-side DB effect THEN dispatch `flow:run`. **If a live `sessionId` is supplied (request param) or already linked, REUSE it** via `ctx.emitEventToSession(sessionId, flow:run)` — no spawn; otherwise `ctx.spawnSession` a fresh session and correlate its `sessionId` by `runId`. Each op **returns the `sessionId` used** and records the `invoice_id ↔ sessionId` link — so the board card connects to its conversation.
- **Seam is real:** `resolveSessionId(invoiceId)` returns the linked `sessionId` (from the recorded map; falls back to a `sessionManager` scan for intake-spawned sessions). Live conversation streaming (Surface 02/03) still rides the existing WebSocket protocol — out of scope, but the `sessionId` it needs is now supplied.

## Capabilities

### New Capabilities

- `invoicebot-rest-api`: A dashboard REST plugin exposing the four `ib_*` selectors over `/api/plugins/invoicebot/*`, keyed by `cwd`, behind an `InvoiceEngine` port, bound to the real engine via an interim `file:` link, with the pure/flow-triggering op split and a stubbed session seam.

### Modified Capabilities

_(none)_

## Impact

- **Dashboard code**: new `packages/invoicebot-plugin/` (manifest + `src/server/{index,routes}.ts` + `src/server/engine/{port,real,fake}.ts`), mirroring `packages/automation-plugin`.
- **⚠️ Interim dependency (MUST CHANGE before release)**: `packages/invoicebot-plugin/package.json` depends on `"@blackbelt-technology/invoicebot": "file:../pi-invoice-bot"`. This is a **relative path to a sibling repo** — it does **not** resolve in CI/`release-cut` (the sibling isn't checked out there), so **CI/integration builds bind `FakeInvoiceEngine`** and the real path is dev/local only until the dep is published or vendored. Tracked in tasks §7.
- **invoice-bot code**: `flows/invoicebot/process/_store.ts` (`STATE_DIR` const → `stateDir()` + `AsyncLocalStorage`), 6 import sites (`_config, _intake, _rules, _handoff, parse-document, parse-statement`) switch `STATE_DIR` → `stateDir()`, plus an engine-facade export + `package.json` `exports`.
- **Flow seam reuse**: the 5 flow-triggering ops dispatch through the flows-plugin `flow:run`-into-session path — dashboard-side, no new bridge protocol.
- **Session linkage**: reuse via `ctx.emitEventToSession(sessionId, flow:run)` when a validated live session exists (cwd match + invoicebot session); else `ctx.spawnSession({ cwd, automationRun:{ runId } })` + `ctx.onEvent` runId-correlation (never cwd). Stale `sessionId` falls through to spawn. `emitEventToSession`/`spawnSession` are trust-gated — confirm the plugin qualifies (mirrors `automation-plugin`).
- **Deferred**: publish-vs-vendor decision that retires the `file:` link; WS conversation plane; original-doc delivery; Ask-session provisioning.
- **Behavioral note**: REST is request/response only. Engine `ib:*` events are **not** pushed over REST; the client refetches after a mutation. Live updates ride the WS plane.
- **Living API contract (keep in sync)**: [`api-contract.md`](./api-contract.md) is the source of truth the client is built against. It **MUST be updated in the same commit** whenever the API changes during implementation — new/renamed endpoint or selector (`view`/`action`), changed request args, changed response `data`/envelope shape, a new state value, a consequential-action change, or a gap (`G1`–`G4`) opening/closing. A route change that does not update `api-contract.md` (+ `gaps.md` when a gap moves) is incomplete. Verified at the code-review gate.

## Discipline Skills

- `doubt-driven-review` — the interim `file:` link + the `AsyncLocalStorage` request-scoping seam are cross-boundary, release-affecting calls; stress-test the port contract + the tech-debt exit before they stand.
- `security-hardening` — REST exposes invoice data and consequential writes (approve/repair/handoff/rule-approve); validate `cwd`, gate consequential actions, avoid path traversal in blob delivery.
