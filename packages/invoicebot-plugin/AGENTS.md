# invoicebot-plugin

InvoiceBot REST plane. Wraps the four `ib_*` selectors over
`POST /api/plugins/invoicebot/{query,review,setup,rules}`, keyed by `cwd`, behind
an `InvoiceEngine` port. Pure ops → port; five flow-triggering ops → port DB
effect + dispatch `flow:run` into the workspace session. Server-only (no client;
WS conversation plane deferred). See change: add-invoicebot-rest-plugin.

Client contract: `openspec/changes/add-invoicebot-rest-plugin/api-contract.md`.

| File | Purpose |
|------|---------|
| `package.json` | Manifest `pi-dashboard-plugin` (id `invoicebot`, server-only, `server: ./src/server/index.ts`). Deps: dashboard-plugin-runtime, pi-dashboard-shared. ⚠️ `optionalDependencies["@blackbelt-technology/invoicebot"] = file:../../../pi-invoice-bot` — `TODO(release)` in `//optionalDependencies` key. Optional so CI/release/worktree install clean + bind Fake. |
| `README.md` | Package overview: port binding (Real/Fake), pure vs flow-triggering split, ⚠️ interim `file:` link + exit. |
| `tsconfig.json` | Extends root base. `jsx: react-jsx` + DOM libs (transitive runtime `.tsx`). `noEmit`. |
| `vitest.config.ts` | node env, `src/**/__tests__/**/*.test.ts`, shared setup-home globalSetup. Registered in root `vitest.config.ts` projects. |
