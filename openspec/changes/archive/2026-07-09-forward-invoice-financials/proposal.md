## Why

The invoice-bot engine change `expose-financials-and-cost` adds net/VAT to the
`approval`/`surface` view summary and a per-invoice processing `cost` to `list` rows.
`RealInvoiceEngine` is a pass-through, so those fields already reach the dashboard
client at runtime with no adapter code. But two things must still be done on the
dashboard side for the contract to hold and CI to exercise it:

1. **`FakeInvoiceEngine` fixtures do not carry the new fields.** They hardcode `gross`
   only on `SURFACE_A.summary` and on the `list` rows — so unit tests / CI (where the
   `file:` sibling is absent and the Fake is bound) cannot cover the net/VAT/cost
   shape the client now consumes.
2. **The pass-through guarantee is untested.** Nothing asserts that
   `RealInvoiceEngine` forwards arbitrary engine `details` fields verbatim, so a future
   reshaping regression would go unnoticed.

## What Changes

- **Extend the Fake fixtures** to mirror the real engine's new shape: add `net` and
  `vat` to `SURFACE_A.summary` (including a zero-VAT case), and add `cost:
  { total, currency }` to the `list`/row fixtures — with at least one row left without
  cost to represent the not-recorded case.
- **Add a pass-through assertion** that `RealInvoiceEngine.query` forwards engine
  `details` (summary/rows) unchanged, so net/VAT/cost reach the client without the
  adapter dropping unknown fields.
- **Update the living API contract** (`api-contract.md`) to document `summary.net`,
  `summary.vat`, and row `cost` as part of the `query` view responses.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `invoicebot-rest-api`: the REST plane SHALL convey the engine's net/VAT (on the
  `surface` summary) and per-invoice processing cost (on `list` rows) to the client,
  and its Fake binding SHALL reflect that shape for CI.

## Impact

- **Plugin code**: `packages/invoicebot-plugin/src/server/engine/fake.ts` (fixtures
  only — `SURFACE_A.summary`, `ROW_A`/`ROW_B`, list responses). `real.ts` is unchanged
  (pass-through).
- **Tests**: `packages/invoicebot-plugin/src/server/__tests__/engine.test.ts` /
  `routes.test.ts` — assert net/VAT/cost surface through both bindings; add the
  `RealInvoiceEngine` pass-through test with a stub facade.
- **Contract doc**: `packages/invoicebot-plugin/openspec/changes/add-invoicebot-rest-plugin/api-contract.md`
  — add the new response fields (kept in sync per that change's living-contract rule).
- **Upstream dependency**: values are non-zero only once the engine change
  `expose-financials-and-cost` lands and (for cost) records tokens; against the real
  engine before that, cost is `0`/absent and the client degrades gracefully. This
  change is safe to land independently (fixtures + test only).

## Discipline Skills

- `doubt-driven-review` — the pass-through guarantee is the load-bearing assumption
  that lets the engine fields reach the client with zero adapter code; assert it
  explicitly so it cannot silently regress.
