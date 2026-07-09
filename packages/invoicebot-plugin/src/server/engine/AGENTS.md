# invoicebot-plugin/src/server/engine

The `InvoiceEngine` port + its two bindings. Routes depend ONLY on the port —
swapping a binding needs no route change.

| File | Purpose |
|------|---------|
| `port.ts` | `InvoiceEngine` interface (`query/review/setup/rules(cwd, args)`). `EngineResult = {content, details, flow?}` — `flow: FlowRunSpec` present only for the 5 flow-triggering ops. `BoundEngine = {engine, binding:"real"\|"fake"}`. |
| `fake.ts` | `FakeInvoiceEngine` — static fixtures matching real tool `details` shapes (api-contract §6–§9); sets `flow` for approve/repair/partner-confirm/submit/rules-request. CI/worktree/release binding. cwd accepted + ignored. |
| `real.ts` | `RealInvoiceEngine(facade)` — thin pass-through to `@blackbelt-technology/invoicebot/engine` (facade wraps ops in `ibContext.run({cwd})`). `loadRealEngine()` dynamic-imports the facade guarded → null when absent. ⚠️ `TODO(release)`: `file:` link resolves local-dev only. |
| `select.ts` | `selectEngine(log)` → Real when `loadRealEngine()` resolves, else Fake. Logs active binding at load. |
