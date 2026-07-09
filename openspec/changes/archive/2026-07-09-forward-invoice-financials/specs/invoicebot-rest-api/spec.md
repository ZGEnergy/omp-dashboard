## ADDED Requirements

### Requirement: REST plane conveys net and VAT on the surface

The `query` endpoint SHALL convey the engine's `approval`/`surface` summary `net` and
`vat` fields to the client unchanged when the engine provides them, and omit them when
the engine does. The `RealInvoiceEngine` binding SHALL forward engine `details`
verbatim (no field allow-listing that would drop `net`/`vat`).

#### Scenario: Surface net and VAT reach the client

- **WHEN** the engine `surface` response summary includes `net` and `vat`
- **THEN** the `POST /api/plugins/invoicebot/query` response carries the same `net`
  and `vat` in `details.summary`

#### Scenario: Real binding forwards unknown summary fields

- **WHEN** `RealInvoiceEngine.query` receives a facade result whose `details.summary`
  contains `net`/`vat`
- **THEN** it returns those fields unchanged (pass-through, no reshaping)

### Requirement: REST plane conveys processing cost on list rows

The `query` endpoint SHALL convey the engine's per-invoice `cost` field on `list`
rows to the client unchanged when present, in both grouped and flat shapes, and omit
it when the engine omits it.

#### Scenario: List cost reaches the client

- **WHEN** the engine `list` response rows include `cost: { total, currency }`
- **THEN** the `query` response rows carry the same `cost`

### Requirement: Fake binding reflects the financial shape

The `FakeInvoiceEngine` fixtures SHALL include `net` and `vat` on the surface summary
(with a zero-VAT case) and `cost` on at least one list row, leaving at least one row
without `cost`, so tests and CI exercise the full shape the client consumes.

#### Scenario: Fake surface carries net and VAT

- **WHEN** the Fake `surface` view is queried
- **THEN** the returned summary includes `net` and `vat`

#### Scenario: Fake list carries cost on some rows

- **WHEN** the Fake `list` view is queried
- **THEN** at least one row includes `cost` and at least one row omits it
