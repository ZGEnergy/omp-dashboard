# @blackbelt-technology/pi-dashboard-invoicebot-plugin

InvoiceBot REST plugin for pi-dashboard. Exposes the four `ib_*` selectors over
four `POST /api/plugins/invoicebot/*` endpoints (`query` / `review` / `setup` /
`rules`), keyed by `cwd`, behind an `InvoiceEngine` **port**. One process serves
every workspace; each request supplies its `cwd` (mirrors `automation-plugin`'s
`?cwd=` idiom).

Client contract: `openspec/changes/add-invoicebot-rest-plugin/api-contract.md`.

## Engine binding (port)

Routes depend only on the `InvoiceEngine` port (`src/server/engine/port.ts`).
Two bindings, selected at load (`src/server/engine/select.ts`):

- **`RealInvoiceEngine`** — imports the invoice-bot engine facade
  (`@blackbelt-technology/invoicebot/engine`) and wraps each op in
  `ibContext.run({ cwd })`. Bound when the facade resolves (local dev with the
  sibling repo present).
- **`FakeInvoiceEngine`** — fixtures matching the real tool `details` shapes.
  Bound when the facade is absent (CI, `release-cut`, git worktrees).

The two op classes:

- **Pure ops** (all `query` views; `review` note/cash/reconcile/assign/handoff;
  all `setup`; `rules` approve/reject/move/archive) — served straight through the
  port.
- **Flow-triggering ops** (`review` approve/repair/submit/partner-confirm,
  `rules` request) — the port does the DB effect, then the plugin dispatches
  `flow:run` into the workspace session (reuse a live `sessionId` or spawn), and
  returns the `sessionId`.

## ⚠️ Interim dependency (MUST CHANGE before release)

> **`TODO(release)`: unpublished — replace the `file:` link with a published npm
> range or a vendored in-monorepo package.**

`@blackbelt-technology/invoicebot` is `private: true` and **not published**. It is
declared as an **`optionalDependency`** `file:../../../pi-invoice-bot` so the
monorepo install succeeds even where the sibling is absent (CI / `release-cut` /
worktrees) — those environments bind `FakeInvoiceEngine`. Before release, retire
the `file:` link (publish or vendor); the port makes it a drop-in swap. Tracked
in `openspec/changes/add-invoicebot-rest-plugin/tasks.md` §8.
