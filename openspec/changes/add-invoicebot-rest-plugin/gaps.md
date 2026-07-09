# Open gaps — client integration vs REST contract

Surfaced while wiring `InvoiceBotClient` to the contract (`api-contract.md`).
Board (Surface 01) is fully covered; these gaps block parts of Surfaces
02/03/04. Each is annotated `G1`–`G4` inline in the client code so it can't be
lost. None blocks rendering screens on `FakeInvoiceBotClient` (the fake fills
the shapes); they block the **real** adapter.

> G5 (OAuth `authorizeUrl` on WS, not REST) is **not tracked as a gap** — it is
> the intended design; the 3-step OAuth dance is documented in `api-contract.md`
> §8 as normal behavior.

| Gap | Surface | Issue | Client consequence | Resolution direction |
|---|---|---|---|---|
| **G1** | 02 Opened invoice | `surface.summary` is summary-only — no buyer party, no line-item array, no VAT breakdown | Full "Számla adatok" table cannot be fully populated | Add a richer upstream `ib_query` view (e.g. `detail`) or extend `surface`; REST inherits it. Interim: accept summary-only. (Same shape as design Decision 2c: read surface = existing views; new views are upstream.) |
| **G2** | 02 header progress | `explain` returns narrative **text**, not per-stage statuses | Progress track (read→classify→extract→supplier→approve→reconcile→handoff) must be derived, not read | Client derives from `state` via `stagesForState()` (stub). Optional upstream: add a structured `stages[]` field to `explain`. |
| **G3** | 02 doc lightbox | `surface.original` is a **pointer** (`blob_handle`/`path`); byte delivery deferred | PDF/PNG lightbox blocked; treat `available:false` as "no preview" | Add a blob proxy endpoint serving `stateDir()/blobs/<handle>` for the request `cwd` (path-traversal-guarded). Tracked in tasks §9.3. |
| **G4** | 03 Ask | No endpoint returns the persistent "Ask" session | `getAskSessionId()` has nothing REST-backed to call | Decide: pre-provision one Ask session per workspace vs lazy-spawn on first visit vs resolve via `/api/sessions`. Tracked in tasks §9.4. |

## Signature corrections the contract already exposed (fixed in client)

- `blockPartner` is keyed by `partner_id` + `by` (NOT `invoice_id`).
- `handoff` is **two-step**: prepare (no `confirm`) → deliver (`confirm:true`).

## Ownership

G1, G2 (optional half), G3, G4 need decisions from whoever owns
`add-invoicebot-rest-plugin`. G2 (primary) is resolved client-side. G3 and G4
already have deferred tasks (§9.3, §9.4); G1 is a new upstream `ib_query` view
question (design Decision 2c family).
