# invoicebot-plugin/src/server

Server entry, routes, session-linkage seam. Engine bindings under `engine/`.

| File | Purpose |
|------|---------|
| `index.ts` | `registerPlugin(ctx)`: `selectEngine()` (await; loader awaits before listen), build `createSessionLink` from ctx (spawnSession/emitEventToSession/getSession/listAll/onEvent — trust-gated first-party), `mountInvoiceBotRoutes`. Logs engine binding. |
| `routes.ts` | `mountInvoiceBotRoutes(fastify, {engine, dispatchFlow})`. 4 POST routes. `badCwd()` (existing dir, no NUL → 400). `normalize()` → `{ok,text,data,sessionId?,consequential?}`. `isConsequential()` per api-contract §10. Flow-triggering results (`.flow`) → `dispatchFlow` → attach `sessionId`. |
| `session-link.ts` | `createSessionLink(deps) → {dispatchFlow, resolveSessionId, links, dispose}`. Reuse a live cwd-matched invoicebot session via `emitEventToSession`, else spawn + correlate by stamped `automationRun.runId` (NEVER cwd — footgun); deliver-on-register. `isInvoicebotSession` gate (cwd match + `automationRun.name` starts `invoicebot`). `invoice_id ↔ sessionId` map. `resolveSessionId` → link, else `listAll` scan, else null. |
| `__tests__/engine.test.ts` | Fake per-selector `details` shapes + flow-vs-pure classification (§3.5). |
| `__tests__/routes.test.ts` | Forwarding, 400s (missing cwd/selector/bad dir), cwd isolation (concurrent A/B), flow dispatch + sessionId, consequential flags (§4.5, §5.5). Fastify `inject` + recording stub engine. |
| `__tests__/session-link.test.ts` | Reuse; spawn+runId correlation (same-cwd decoy not mis-bound); stale/unrelated sessionId → spawn, never injected; bind-timeout → spawnToken; resolveSessionId link/scan/null (§5.5, §6.1). |
