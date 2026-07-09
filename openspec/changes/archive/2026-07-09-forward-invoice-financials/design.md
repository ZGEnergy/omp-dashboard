## Context

The invoicebot-plugin exposes the four `ib_*` selectors over REST behind an
`InvoiceEngine` port with two bindings:

- `RealInvoiceEngine` (`src/server/engine/real.ts`) — a thin pass-through to the
  invoice-bot facade; `query()` returns `facade.query()` verbatim.
- `FakeInvoiceEngine` (`src/server/engine/fake.ts`) — hand-written fixtures, bound in
  CI / worktrees where the `file:` sibling is absent. Today `SURFACE_A.summary` and
  the `ROW_*` fixtures carry `gross` only.

The engine change `expose-financials-and-cost` adds `net`/`vat` to the surface summary
and `cost` to list rows. Because Real is pass-through, those reach the client for free
at runtime — but the Fake (what CI runs against) and the pass-through guarantee itself
are the two things this change nails down.

## Goals / Non-Goals

**Goals:**

- Fake fixtures mirror the real engine's new financial shape (net/vat on surface;
  cost on rows) including the edge cases the client branches on (zero VAT; a row with
  no cost).
- An explicit test that `RealInvoiceEngine` forwards arbitrary `details` fields, so
  net/vat/cost cannot be silently dropped by a future refactor.
- The living `api-contract.md` documents the new response fields.

**Non-Goals:**

- Any change to `real.ts` — pass-through is the design; we assert it, not alter it.
- Producing real (non-zero) values — that is upstream in the engine change.
- New endpoints, selectors, or reshaping of the response envelope.

## Decisions

- **Fixtures over adapters.** The correct fix is fixture parity, not an adapter that
  injects fields — the Real path already forwards them, so the Fake must simply match.
  This keeps Real and Fake behaviourally aligned (the port's whole point).
- **Pin the pass-through with a stub-facade test.** Construct `RealInvoiceEngine` with
  a stub `InvoiceFacade` whose `query` returns a `details` object containing `net`/`vat`
  and `cost`, and assert the adapter returns them unchanged. This is the guardrail that
  makes "engine fields reach the client with zero adapter code" a tested contract, not
  a hope.
- **Zero-VAT and no-cost fixtures are deliberate.** `SURFACE_A` gets a real `vat`
  value; add or adjust a second surface/row for `vat: 0`. One list row keeps `cost`
  omitted so the client's "hide when absent" path is covered.
- **Contract doc stays in the base change's file.** `api-contract.md` lives under
  `add-invoicebot-rest-plugin`; per that change's living-contract rule it is updated in
  the same commit that changes the API shape — so this change edits it there rather
  than duplicating a contract.

## Risks / Trade-offs

- **Contract doc ownership.** Editing the base change's `api-contract.md` from a
  different change couples the two. Accepted: the file is explicitly a living contract
  meant to track API shape regardless of which change moves it; the alternative
  (a second contract file) would fragment the source of truth.
- **Fixture drift.** Hand-written fixtures can diverge from the real engine's actual
  field names. Mitigated by mirroring the exact keys from the engine change's delta
  spec (`summary.net`, `summary.vat`, row `cost.{total,currency}`) and cross-checking
  against `expose-financials-and-cost`.
