# InvoiceBot REST API — client-developer contract

Complete reference for building a client against the InvoiceBot dashboard plugin.
Everything a client needs — endpoints, `cwd` handling, every selector variant,
parameters, request/response shapes, session linkage, error handling — is here.

> Status: this documents the contract the plugin **MUST** implement (change
> `add-invoicebot-rest-plugin`). Response `data` bodies are the underlying
> `ib_*` tool `details` payloads, verified against the engine source.

---

## 1. Two planes (what REST does and does NOT cover)

| Plane | Transport | This document | Used for |
|---|---|---|---|
| **Data** | REST `POST /api/plugins/invoicebot/*` | ✅ **yes** | invoices, decisions, config, rules |
| **Conversation** | Dashboard WebSocket (`browser-protocol`) | ❌ pointer only (§11) | the live chat timeline of an invoice's pi session |

REST is **request/response only**. It does **not** stream engine events; after a
mutation the client **refetches**. Live conversation streaming rides the WS plane
(§11), keyed by the `sessionId` that flow-triggering REST ops return (§5).

---

## 2. Transport basics

- **Base URL:** the dashboard server origin, e.g. `http://localhost:8000`.
- **Endpoints (4):** all `POST`, all under `/api/plugins/invoicebot/`.
  | Endpoint | Wraps tool | Selector field |
  |---|---|---|
  | `POST /api/plugins/invoicebot/query`  | `ib_query`  | `view`  (read-only) |
  | `POST /api/plugins/invoicebot/review` | `ib_review` | `action` (operational writes) |
  | `POST /api/plugins/invoicebot/setup`  | `ib_setup`  | `action` (editor config) |
  | `POST /api/plugins/invoicebot/rules`  | `ib_rules`  | `action` (rule authoring) |
- **Content-Type:** `application/json` (request and response).
- **Auth:** inherited from the dashboard's `onRequest` hook (same auth as every
  other `/api/*` route). No plugin-specific token.
- **Body:** JSON object. Always includes `cwd` (§4) and the selector. Extra args
  per variant (§6–§9). Unknown args are ignored by the tool.

---

## 3. Common envelope

### Request
```jsonc
{
  "cwd": "/abs/path/to/workspace",   // REQUIRED on every call (see §4)
  "view":  "...",                     // /query only — the selector
  "action":"...",                     // /review /setup /rules — the selector
  "sessionId": "…",                   // OPTIONAL, flow-triggering ops only (§5)
  // …variant-specific args…
}
```

### Response (normalized by the plugin)
The underlying tool returns `{ content: [{ type:"text", text }], details }`. The
plugin normalizes this to a flat JSON envelope:
```jsonc
{
  "ok": true,                 // false when the tool reported an error (details.ok === false)
  "text": "…human summary…",  // tool's content[0].text (Hungarian; UI may ignore)
  "data": { /* … */ },        // the tool's `details` payload — the machine-readable body
  "sessionId": "…"            // present only on flow-triggering ops (§5)
}
```
- **`data`** is the payload each variant below documents.
- **`text`** is a Hungarian one-line summary meant for humans; clients should
  render from `data`, not parse `text`.

### HTTP status codes
| Code | When |
|---|---|
| `200` | Request reached the tool. Business-level failures still return `200` with `{ ok:false, text }`. |
| `400` | Plugin-level validation: missing `cwd`, missing selector (`view`/`action`), or `cwd` not an existing directory. No tool call happened. |
| `401`/`403` | Dashboard auth rejected the request (before the plugin). |
| `500` | Unhandled server error. |

Clients should branch on **both** the HTTP status and the `ok` field.

---

## 4. CWD semantics (the workspace key)

- **`cwd` is REQUIRED on every request.** It is the absolute path of the invoice
  **workspace** whose data the call targets. The invoice DB lives at
  `<cwd>/.pi/flows/invoicebot-state/invoicebot.db`.
- The dashboard plugin server is **one process serving all workspaces**; `cwd`
  selects which workspace's data to read/write. Mirrors `automation-plugin`'s
  `?cwd=` idiom.
- The plugin validates `cwd` is an existing directory (else `400`) and rejects
  path traversal.
- To enumerate candidate workspaces, use the dashboard's session list
  (`GET /api/sessions`) — the `cwd` values there are valid targets.

---

## 5. Session linkage (`sessionId`) — flow-triggering ops only

Five write ops advance the invoice through the pi-flows engine and therefore run
in a pi **session**: `review:approve`, `review:repair`, `review:submit`,
`review:partner op=confirm`, `rules:request`. For these:

- **Request** MAY include `sessionId`. If it is a **live** session in the same
  `cwd` and is an invoicebot session, the op **reuses** it (no new session
  spawned). Otherwise the plugin **spawns** a fresh session.
- **Response** ALWAYS includes `sessionId` (the session the flow ran in). The
  client uses it to open the conversation (§11).
- A stale/invalid `sessionId` never errors — the plugin falls back to spawning.

All other ops (reads, pure writes) ignore `sessionId` and do not return one.

> `resolveSessionId(invoiceId)`: the plugin also links `invoice_id ↔ sessionId`
> internally. Read responses (`pending`, `list`, `surface`) MAY include a
> `sessionId` field on an invoice when one is linked, so the client seldom needs
> a separate lookup.

### 5.1 Recipe — invoice NUMBER → chat session

The human invoice number (e.g. `INV-2024-001`) is **not** a first-class key;
everything is keyed by the internal `invoice_id` (a content-hash). Resolve in
three hops:

```
invoice number ──/query {view:"search"}──▶ invoice_id ──/query {view:"surface"}──▶ sessionId ──WS subscribe──▶ chat
```

1. **number → `invoice_id`** — the number is indexed in the search body
   (alongside supplier, dates, currency):
   ```jsonc
   POST /api/plugins/invoicebot/query
   { "cwd": "/work/acme", "view": "search", "query": "INV-2024-001" }
   // → { ok:true, data:{ ids: ["a1b2c3d4", …] } }
   ```
   Search is a **content match**, so it MAY return several ids or partial hits.
   Confirm the exact one via `surface`/`list` and compare `summary.invoiceNumber`.
2. **`invoice_id` → `sessionId`** — read the surface (or `pending`/`list`); the
   record carries a `sessionId` field **when a session is linked**:
   ```jsonc
   POST /api/plugins/invoicebot/query
   { "cwd": "/work/acme", "view": "surface", "invoice_id": "a1b2c3d4" }
   // → { ok:true, data:{ invoice_id, reference, summary:{ invoiceNumber, … }, sessionId? } }
   ```
3. **`sessionId` → chat** — open the conversation over the WS plane (§11):
   `{ type:"subscribe", sessionId }`.

**Reliability of the link (read carefully):**
- ✅ **Guaranteed** for any invoice acted on through a flow-triggering REST op
  (`approve`/`repair`/`submit`/`partner-confirm`) — those record
  `invoice_id ↔ sessionId`, and the op response also returns `sessionId` directly.
- ⚠️ **Best-effort** for an invoice processed **only** by the intake automation
  (no REST op yet): `sessionId` MAY be absent. The plugin then falls back to a
  `sessionManager` scan of sessions running `invoicebot:process` in that `cwd`,
  which cannot always pin one invoice number to one session until the
  invoice↔session link is stamped at intake (deferred; see tasks §9 / open
  question in `design.md` Decision 3). Treat a `null`/absent `sessionId` as
  “no chat session yet” and hide the chat affordance.

### 5.2 Recipe — query result → chat session (“no session yet” is normal)

You already have an invoice from a `list` / `pending` / `search`→`surface` result;
its `id` is the `invoice_id`. There is **no dedicated “get session” endpoint** —
the `sessionId` arrives as a field on the record (or from a flow-op response),
and it is **often absent**. Absent is a valid, expected state, not an error.

```
query result (row.id) ──/query {view:"surface"}──▶ data.sessionId ?
                                   │
            present ──────────────┤─────────────── absent / null
                                   ▼                     ▼
                     WS subscribe {sessionId}     NO CHAT YET
                       ──▶ chat view              (hide the chat affordance)
```

1. From the row, take `invoice_id = row.id`.
2. Read `sessionId`: it MAY already be on the `list`/`pending` row; otherwise call
   `surface` and read `data.sessionId`:
   ```jsonc
   POST /api/plugins/invoicebot/query
   { "cwd": "/work/acme", "view": "surface", "invoice_id": "a1b2c3d4" }
   // → { ok:true, data:{ …, sessionId?: "sess-77" } }
   ```
3. **Branch on presence — do NOT spawn or force a session:**
   - `sessionId` present → open the chat over the WS plane (§11):
     `{ type:"subscribe", sessionId }`.
   - `sessionId` absent/`null` → **“no chat session yet”**: render the invoice
     without a chat panel (or a disabled “chat unavailable” state). A session may
     appear later, once the invoice is acted on through a flow-triggering REST op
     (§5) — which returns `sessionId` directly and links it for future reads.

```ts
// client helper
async function chatSessionForRow(cwd: string, row: { id: string; sessionId?: string }) {
  if (row.sessionId) return row.sessionId;                       // already enriched
  const s = await ib("query", { cwd, view: "surface", invoice_id: row.id });
  return (s.data as { sessionId?: string }).sessionId ?? null;   // null ⇒ no chat yet
}
```

> The client SHALL NOT treat a missing `sessionId` as a failure and SHALL NOT try
> to create one just to view chat. Chat is available only when a session already
> exists for the invoice.

---

## 6. `POST /api/plugins/invoicebot/query` — reads (`view`)

Read-only. Never mutates. Nine `view` values.

| `view` | Extra args | `data` shape |
|---|---|---|
| `pending` | — | `{ items: PendingItem[] }` |
| `list` | `state?` (a state name, or `"all"`) | grouped or flat (below) |
| `search` | `query` (required) | `{ ids: string[] }` |
| `surface` | `invoice_id` (required) | `ApprovalSurface` |
| `explain` | `invoice_id` (required) | `DecisionExplain` |
| `status` | — | `SetupStatus` |
| `finance` | — | `FinanceView` |
| `rules` | — | `{ effective: RuleEntry[], all: RuleEntry[] }` |
| `diagram` | — | `{ mermaid: string }` |

**Types**

```ts
type InvoiceState =
  | "partner_pending" | "pending_approval" | "parked"   // held (awaiting human)
  | "partner_ok" | "approved" | "exported";             // advanced

interface PendingItem {          // view:"pending"
  id: string; state: InvoiceState;
  reason?: string;               // hold_reason
  partner?: string;              // partner_id
  gross?: number;                // total_gross
  reference?: string;            // approval_reference
}

interface InvoiceRow {           // view:"list" items
  id: string; state: InvoiceState;
  supplier: string | null;       // canonical.supplier.name ?? partner.name
  partner: string | null;        // partner_id
  gross: number | null;          // total_gross
  settlement: string | null;     // settlement_status ("settled" | …)
}

interface ApprovalSurface {      // view:"surface"
  invoice_id: string; reference: string; state: InvoiceState;
  awaiting: boolean;             // true only while it needs an approver
  summary: {
    supplier?: string; invoiceNumber?: string;
    issueDate?: string; dueDate?: string;
    currency?: string; gross?: number; lineCount?: number;
  };
  original: { blob_handle?: string; path?: string; available: boolean }; // retained original doc
  actions: ["approve","reject"];
  decisions: ApproverDecision[]; // who decided, when
}

interface DecisionExplain {      // view:"explain"
  found: boolean; text: string;  // Hungarian narrative
  trace?: string; outcome?: string; repairs?: unknown[];
}

interface SetupStatus {          // view:"status"
  intake_ready: boolean; handoff_configured: boolean; setup_complete: boolean;
  missing: string[];             // e.g. ["arrival","hand-off"]
  pending: number;               // count awaiting a human
  intake_reason?: string; intake_paused?: boolean;
  cadence: { process: string | null; pull: string | null }; // 5-field cron or null
}

interface FinanceView {          // view:"finance"
  settled: InvoiceRow[]; outstanding: InvoiceRow[];
  totals: { settled: number; outstanding: number };
}

interface RuleEntry { /* engine-defined: id, seq, description, status, … */ }
interface ApproverDecision { /* engine-defined: actor, at, outcome, … */ }
```

**`view:"list"` response variants**
- No `state`: grouped —
  `{ total: number, groups: { [state]: { count: number, items: InvoiceRow[] } } }`
- `state: "<name>"`: `{ state: string, items: InvoiceRow[] }`
- `state: "all"`: `{ items: InvoiceRow[] }`

> **`list` is the enumeration endpoint for invoices.** There is **no partners /
> notes / bank / decisions list view** today (the store has the data but no
> `ib_query` view surfaces it). To add one, a new upstream `ib_query` view is
> required; REST inherits it automatically. See design Decision 2c.

**Examples**
```bash
curl -sX POST $BASE/api/plugins/invoicebot/query \
  -H 'content-type: application/json' \
  -d '{"cwd":"/work/acme","view":"list","state":"approved"}'

curl -sX POST $BASE/api/plugins/invoicebot/query \
  -d '{"cwd":"/work/acme","view":"surface","invoice_id":"a1b2c3d4"}'
```

---

## 7. `POST /api/plugins/invoicebot/review` — operational writes (`action`)

Daily decisions. Several are **consequential** (§10) — confirm in the UI first.
`⚑` = flow-triggering (returns `sessionId`, accepts optional `sessionId`, §5).

| `action` | Required args | Optional | `data` shape | Notes |
|---|---|---|---|---|
| `approve` ⚑ | `invoice_id` | `approved_by` | `{ decisions: ApproverDecision[] }` | consequential; records + resumes processing |
| `reject` | `invoice_id` | `approved_by`, `reason` | `{ decisions: ApproverDecision[] }` | consequential; held for review |
| `repair` ⚑ | `invoice_id`, `patch` | `repaired_by` | `{ invoice_id, patch }` | consequential; re-runs from repaired data |
| `partner` | `op` (+ per-op) | — | see below | — |
| `note` | `target_kind`, `target_id`, `author`, `text` | — | `{ note }` | — |
| `cash` | `invoice_id`, `amount` | `colleague`, `note` | cash-payment record | records házipénztár payment |
| `reconcile` | `invoice_id`, `transaction_id`, `amount` | `counterparty_account` | `{ settlement }` | confirm bank match |
| `assign` | `invoice_id`, `colleague` | — | — | — |
| `submit` ⚑ | `ref` **or** `invoice_id` | — | `{ task }` | low-priority manual process of one file/id |
| `handoff` | `target_id` | `period_from`, `period_to`, `confirm` | `HandoffResult` | consequential; data leaves — see below |

**`partner` sub-ops (`op`)**
| `op` | Required | Optional | `data` |
|---|---|---|---|
| `confirm` ⚑ | `invoice_id` | `approved_by` | `{ partner_id }` — confirms unknown supplier + resumes |
| `block` | `partner_id`, `by` | `reason` | `{ partner }` |
| `role` | `partner_id`, `role` | `on` (bool, default `true`) | `{ partner }` |

**`repair` patch keys** (all optional; supply what you correct):
`supplier`, `buyer`, `invoiceNumber`, `issueDate`, `dueDate`, `fulfillmentDate`,
`currency`, `paymentMethod`, `lines`, `totals`.

**`handoff` two-step** (data leaves the system):
1. Call **without** `confirm` → `data.status = "prepared"`, `data.count = N`.
   Show the operator "send N invoices?"
2. Call again with `confirm: true` → `data.status = "sent"` (delivered).

```ts
interface HandoffResult { status: "prepared" | "sent" | string; count: number; /* … */ }
```

**Examples**
```bash
# approve, reusing the invoice's existing conversation session
curl -sX POST $BASE/api/plugins/invoicebot/review \
  -d '{"cwd":"/work/acme","action":"approve","invoice_id":"a1b2","approved_by":"anna","sessionId":"sess-77"}'
# → { ok:true, data:{decisions:[…]}, sessionId:"sess-77" }

# confirm an unknown supplier
curl -sX POST $BASE/api/plugins/invoicebot/review \
  -d '{"cwd":"/work/acme","action":"partner","op":"confirm","invoice_id":"a1b2"}'

# repair a held invoice
curl -sX POST $BASE/api/plugins/invoicebot/review \
  -d '{"cwd":"/work/acme","action":"repair","invoice_id":"a1b2","patch":{"currency":"HUF","totals":{"gross":19050}}}'

# hand-off: prepare then deliver
curl -sX POST $BASE/api/plugins/invoicebot/review -d '{"cwd":"/work/acme","action":"handoff","target_id":"book1"}'
curl -sX POST $BASE/api/plugins/invoicebot/review -d '{"cwd":"/work/acme","action":"handoff","target_id":"book1","confirm":true}'
```

---

## 8. `POST /api/plugins/invoicebot/setup` — editor config (`action`)

| `action` | Required args | Optional | `data` shape | Notes |
|---|---|---|---|---|
| `connector` | `id`, `kind` | `config` (object or string), `reachable` | `{ connector: Connector, automation?: string[] }` | folder `kind` validates `config.path` exists |
| `authorize` | `id`, `refresh_token` | `extra` | `{ connector: Connector }` | completes OAuth for a `needs-auth` connector |
| `cadence` | `which` (`process`\|`pull`), `cron` (5-field) | — | `{ which, cron }` | arrival must already exist |
| `handoff_target` | `id`, `format`, `destination` | `channel`, `auto_send` | `{ target: HandoffTarget }` | bookkeeper delivery target |
| `config` | `name` | `value`, `consent` | `{ applied: boolean, diff, reason? }` | consequential when it changes fields (needs `consent:true`) |
| `intake` | `op` (`pause`\|`resume`\|`poll`) | — | see below | — |

```ts
type ConnectorKind = "folder" | "imap" | "gdrive" | "graph" | string;
type ConnectorStatus = "active" | "needs-auth" | "error";
interface Connector {
  id: string; kind: ConnectorKind; direction: "inbound"; enabled: boolean;
  status: ConnectorStatus; reachable?: boolean; config: Record<string, unknown>;
}
interface HandoffTarget {
  id: string; format: string; destination: string;
  channel?: string; autoSend?: boolean;
}
```

- **`connector` config**: object, or a string. A bare string is treated as
  `{ path: "<string>" }`; a `{…}` string is parsed as JSON. For `kind:"folder"`,
  `config.path` must be an existing directory (resolved to absolute) or the call
  errors (`ok:false`).
- **OAuth kinds** (`gdrive`, `graph`) — **3-step dance, NOT a single REST call.**
  There is **no `startOAuth` endpoint**; the `authorizeUrl` is not a
  REST return value — it arrives over the **WebSocket** plane:
  1. `POST /setup {action:"connector", id, kind:"gdrive"|"graph", config}` → the
     connector is created `status:"needs-auth"`.
  2. The server emits `ib:connector-needs-auth` over the WS (§11) carrying the
     `authorizeUrl`. The client **watches the WS** for it and sends the user there.
  3. After consent, `POST /setup {action:"authorize", id, refresh_token}` →
     `status:"active"`.
  So the client's `startOAuth(kind) → { authorizeUrl }` shape is **not** REST-backed;
  model it as connector-create + WS-listen.
- **`intake` op results**: `pause`/`resume` → `{ intake_paused: boolean }`;
  `poll` → `{ found, landed, skipped, errors }`.

**Examples**
```bash
# where invoices arrive from (folder)
curl -sX POST $BASE/api/plugins/invoicebot/setup \
  -d '{"cwd":"/work/acme","action":"connector","id":"drop","kind":"folder","config":{"path":"/work/acme/inbox"}}'

# how often the drop folder is drained
curl -sX POST $BASE/api/plugins/invoicebot/setup \
  -d '{"cwd":"/work/acme","action":"cadence","which":"process","cron":"*/2 * * * *"}'

# bookkeeper target
curl -sX POST $BASE/api/plugins/invoicebot/setup \
  -d '{"cwd":"/work/acme","action":"handoff_target","id":"book1","format":"csv","destination":"/work/acme/handoff"}'
```

---

## 9. `POST /api/plugins/invoicebot/rules` — rule authoring (`action`)

| `action` | Required args | Optional | `data` shape | Notes |
|---|---|---|---|---|
| `request` ⚑ | `description`, `id`, `seq` | `consent` | `{ flowName, task }` | authors + back-tests + **stages** a rule; changes nothing live |
| `approve` | `id` | — | `{ approved: true }` | consequential; promotes staged rule to LIVE (can change past invoices) |
| `reject` | `id` | — | `{ rejected: true }` | discard a staged rule |
| `move` | `id`, `seq` | — | — | reprioritize |
| `archive` | `id` | `consent` | — | deactivate an active rule (consent required) |

- **Authoring is two-phase.** `request` stages only (returns immediately; the
  actual code write/back-test runs in the spawned/reused flow session — watch it
  via the conversation plane, §11). Then `approve` (consequential) or `reject`.
- To **list** rules use `POST /query {view:"rules"}` (there is no `rules:list`).
- `consent: true` on `request` allows a rule that would change existing decisions.

```bash
curl -sX POST $BASE/api/plugins/invoicebot/rules \
  -d '{"cwd":"/work/acme","action":"request","id":"r2","seq":20,"description":"auto-approve known partners under 20000 HUF"}'
# → { ok:true, data:{flowName:"invoicebot:add-rule",task:"…"}, sessionId:"sess-91" }

curl -sX POST $BASE/api/plugins/invoicebot/rules -d '{"cwd":"/work/acme","action":"approve","id":"r2"}'
```

---

## 10. Consequential actions (client must confirm first)

Per InvoiceBot conduct: anything that **changes past decisions** or **sends data
out** MUST be confirmed by the operator before firing. The client SHALL gate
these behind an explicit confirm step:

- `review:approve`, `review:reject`, `review:repair`
- `review:handoff` (with `confirm:true` — the delivery step)
- `rules:approve`, `rules:request` with `consent:true`, `rules:archive`
- `setup:config` when it changes fields (`consent:true`)

Reads (`/query`) and the conversation stream are free (no confirm).

---

## 11. Conversation plane (WS) — for a complete client

The chat timeline of an invoice's pi session is **not** REST. Use the dashboard
WebSocket (`packages/shared/src/browser-protocol.ts`), keyed by the `sessionId`
from §5:

- **Subscribe / read:** send `{ type:"subscribe", sessionId, lastSeq? }` → receive
  `event_replay` (history; `isLast` marks the end) then live `event` messages.
  Map each `DashboardEvent { eventType, timestamp, data }` to a view entry;
  drop engine-internal events so the finance surface stays clean.
- **Send a message:** `{ type:"send_prompt", sessionId, text, delivery? }`.
- **Interrupt:** `{ type:"abort", sessionId }`.
- **Presence:** `{ type:"session_view" | "session_unview", sessionId }` on
  open/close (re-send on every reconnect).
- **Card status/metadata:** `session_added` / `session_updated` / `session_removed`
  carry `DashboardSession` (status, currentTool, lastActivityAt, token counts).

The seam: board is keyed by `invoice_id` (REST), chat by `sessionId` (WS); the
flow-triggering REST responses (§5) bridge the two. To go from a human invoice
**number** to the chat session, follow the three-hop recipe in **§5.1**.

**Original document** (`surface.original`): `blob_handle` + `path` point at the
retained file under `<cwd>/.pi/flows/invoicebot-state/blobs/`. Delivery of the
bytes (proxy endpoint vs path) is not yet finalized — treat `available:false` as
"no preview". (Gap **G3** — see §14 / tasks §9.3.)

---

## 12. Client method → endpoint map (reference `InvoiceBotClient`)

```ts
// Data plane — every method is a thin POST to one {endpoint, selector} pair.
listPending(cwd)                          → /query  {view:"pending"}
listInvoices(cwd, {state?})               → /query  {view:"list", state?}
searchInvoices(cwd, query)                → /query  {view:"search", query}
getInvoice(cwd, invoiceId)                → /query  {view:"surface", invoice_id}
explainInvoice(cwd, invoiceId)            → /query  {view:"explain", invoice_id}
getStatus(cwd)                            → /query  {view:"status"}
getFinance(cwd)                           → /query  {view:"finance"}
listRules(cwd)                            → /query  {view:"rules"}
getRulesDiagram(cwd)                      → /query  {view:"diagram"}

confirmPartner(cwd, invoiceId)            → /review {action:"partner", op:"confirm", invoice_id}      [⚑ sessionId]
blockPartner(cwd, partnerId, by)          → /review {action:"partner", op:"block", partner_id, by}
approveInvoice(cwd, invoiceId, by?)       → /review {action:"approve", invoice_id, approved_by?}      [⚑ consequential]
rejectInvoice(cwd, invoiceId, reason?)    → /review {action:"reject", invoice_id, reason?}            [consequential]
repairInvoice(cwd, invoiceId, patch)      → /review {action:"repair", invoice_id, patch}              [⚑ consequential]
submitInvoice(cwd, {ref|invoiceId})       → /review {action:"submit", ref?|invoice_id?}               [⚑]
addNote(cwd, {target_kind,target_id,author,text}) → /review {action:"note", …}
recordCash(cwd, invoiceId, amount, …)     → /review {action:"cash", invoice_id, amount, …}
reconcile(cwd, invoiceId, txId, amount, …)→ /review {action:"reconcile", …}
assign(cwd, invoiceId, colleague)         → /review {action:"assign", invoice_id, colleague}
handoff(cwd, targetId, confirm)           → /review {action:"handoff", target_id, confirm}            [consequential when confirm]

setConnector(cwd, {id,kind,config})       → /setup  {action:"connector", …}
startOAuth(kind)                          → NOT REST-backed: setConnector(needs-auth) + watch WS ib:connector-needs-auth for authorizeUrl
authorizeOAuth(cwd, {id,refresh_token})   → /setup  {action:"authorize", …}
setCadence(cwd, which, cron)              → /setup  {action:"cadence", which, cron}
setHandoffTarget(cwd, {id,format,dest})   → /setup  {action:"handoff_target", …}
setConfig(cwd, name, value, consent?)     → /setup  {action:"config", name, value?, consent?}         [consequential]
pauseIntake(cwd)/resumeIntake(cwd)/pollIntake(cwd) → /setup {action:"intake", op:…}

requestRule(cwd, {id,seq,description,consent?}) → /rules {action:"request", …}                        [⚑]
approveRule(cwd, id)                       → /rules {action:"approve", id}                             [consequential]
rejectRule(cwd, id)                        → /rules {action:"reject", id}
moveRule(cwd, id, seq)                     → /rules {action:"move", id, seq}
archiveRule(cwd, id, consent)              → /rules {action:"archive", id, consent}

resolveSessionId(cwd, invoiceId)          → linked sessionId, or null = “no chat session yet” (recipe §5.2)
chatSessionForRow(cwd, row)               → row.sessionId ?? surface.sessionId ?? null  (recipe §5.2; null ⇒ hide chat)
sessionIdForInvoiceNumber(cwd, number)    → search(number)→invoice_id→surface.sessionId  (recipe §5.1; may be null)
```

## 13. Minimal TypeScript client skeleton

```ts
const BASE = "http://localhost:8000";

async function ib(endpoint: "query"|"review"|"setup"|"rules", body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/api/plugins/invoicebot/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 400) throw new Error(`bad request: ${(await res.json()).error ?? res.statusText}`);
  if (!res.ok) throw new Error(`http ${res.status}`);
  const out = await res.json() as { ok: boolean; text: string; data: unknown; sessionId?: string };
  if (!out.ok) throw new Error(out.text);        // business-level failure
  return out;
}

// examples
const pending = (cwd: string) => ib("query", { cwd, view: "pending" });
const list    = (cwd: string, state?: string) => ib("query", { cwd, view: "list", ...(state ? { state } : {}) });
const approve = (cwd: string, invoice_id: string, sessionId?: string) =>
  ib("review", { cwd, action: "approve", invoice_id, ...(sessionId ? { sessionId } : {}) });
```

---

## 14. Known gaps & limitations (client-facing)

What the REST surface does **not** give you yet. Board (Surface 01) is fully
covered; these constrain Surfaces 02/03. A client renders around them; none is an
error state. Full tracking in [`gaps.md`](./gaps.md).

| # | Where | Limitation | Client workaround |
|---|---|---|---|
| **G1** | `query:surface` (02) | `summary` is summary-only — **no buyer party, no line-item array, no VAT breakdown**. The full „Számla adatok” table cannot be fully populated. | Render from `summary` (supplier, invoiceNumber, dates, currency, gross, lineCount). Full line/VAT detail awaits a richer upstream view (tasks §9.5). |
| **G2** | `query:explain` (02) | Returns **narrative `text`**, not per-stage statuses. The header progress track (read→classify→extract→supplier→approve→reconcile→handoff) is not machine-readable. | **Derive stages from `state`** via a client `stagesForState()` map. Show `text` as the reason line. |
| **G3** | `surface.original` (02) | A **pointer** (`blob_handle`/`path`), not bytes. No endpoint streams the file. | PDF/PNG lightbox: treat `available:false` (or any absent-bytes case) as **“no preview”**. Byte delivery awaits a blob proxy endpoint (tasks §9.3). |
| **G4** | Ask session (03) | **No endpoint** returns the persistent “Ask” session over the whole invoice DB. | `getAskSessionId()` has no REST source yet — resolve via `/api/sessions` or spawn (open; tasks §9.4). |

**Not a gap (intended design):**
- **OAuth** — no `startOAuth` REST endpoint; `authorizeUrl` arrives on the WS
  (`ib:connector-needs-auth`). The 3-step dance is documented in §8.
- **No partners/notes/bank/decisions list** — only invoices are enumerable
  (`view:"list"`); adding others is an upstream `ib_query` view (design Decision 2c).
- **REST does not stream events** — request/response only; refetch after a
  mutation; live updates ride the WS plane (§1, §11).

**Signature notes** (easy to get wrong): `blockPartner` is keyed by
`partner_id` + `by` (NOT `invoice_id`); `handoff` is two-step (prepare →
`confirm:true`).
