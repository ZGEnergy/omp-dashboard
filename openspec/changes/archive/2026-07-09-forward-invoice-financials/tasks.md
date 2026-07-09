## 1. Fake fixtures reflect the financial shape

- [x] 1.1 In `src/server/engine/fake.ts`, add `net` and `vat` to `SURFACE_A.summary`; include a zero-VAT case (either on `SURFACE_A` or a second surface fixture).
- [x] 1.2 Add `cost: { total, currency }` to at least one list/row fixture (`ROW_A`), and leave at least one (`ROW_B`) without `cost`.
- [x] 1.3 Ensure the `list` grouped and `state:"all"` flat responses both surface the `cost` field on the rows that carry it.

## 2. Pass-through guarantee

- [x] 2.1 Add a `RealInvoiceEngine` test with a stub `InvoiceFacade` whose `query` returns `details.summary` with `net`/`vat` and rows with `cost`; assert the adapter returns them unchanged.

## 3. Endpoint coverage

- [x] 3.1 Extend `src/server/__tests__/engine.test.ts` / `routes.test.ts`: `query { view:"surface" }` exposes net/vat; `query { view:"list" }` exposes cost on the fixtured row and omits it on the other.

## 4. Contract doc

- [x] 4.1 Update `openspec/changes/add-invoicebot-rest-plugin/api-contract.md`: document `summary.net`, `summary.vat`, and row `cost: { total, currency }` in the `query` view responses (per the base change's living-contract rule).

## 5. Verify

- [x] 5.1 Plugin tests green (the invoicebot-plugin vitest project).
- [x] 5.2 Confirm no change was needed in `real.ts` (pass-through) — the pass-through test is the evidence.
- [x] 5.3 Note in the change that non-zero values depend on the engine change `expose-financials-and-cost` landing.
