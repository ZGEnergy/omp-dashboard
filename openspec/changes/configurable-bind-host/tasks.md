## 1. Config plumbing (shared)

- [ ] 1.1 In `packages/shared/src/config.ts`, add `bindHost: string` to `DashboardConfig`, set `DEFAULTS.bindHost = "127.0.0.1"`, and read `bindHost: parsed.bindHost ?? defaults.bindHost` in `loadConfig()`.
- [ ] 1.2 Add a unit test asserting `loadConfig()` returns `bindHost === "127.0.0.1"` when the field is absent and preserves an explicit value.

## 2. Resolution chain (cli)

- [ ] 2.1 In `packages/server/src/cli.ts`, add `host` to `ServerConfig`.
- [ ] 2.2 In `parseArgs()`, parse `--host <ip>` into `flags.host`.
- [ ] 2.3 In `buildConfig()`, add `host: flags.host ?? (process.env.PI_DASHBOARD_HOST || null) ?? fileConfig.bindHost` (mirroring the `port` line).
- [ ] 2.4 Tests: `--host` flag wins over env; `PI_DASHBOARD_HOST` wins over config; config wins over default; default is `127.0.0.1`.

## 3. Bind the listeners (server)

- [ ] 3.1 In `packages/server/src/server.ts`, change `fastify.listen({ port: config.port, host: "0.0.0.0" })` to `host: config.host`.
- [ ] 3.2 In `packages/server/src/pi-gateway.ts`, change `start(port)` to accept `host` and pass `new WebSocketServer({ port, host })`; update the `PiGateway` interface/type.
- [ ] 3.3 In `server.ts`, pass `config.host` to `piGateway.start(config.piPort, config.host)`.
- [ ] 3.4 Leave the model-proxy second-port bind as `127.0.0.1` (no change).
- [ ] 3.5 Test: server started with `host: "127.0.0.1"` is not reachable on a non-loopback interface; started with `0.0.0.0` is. (Or assert the value passed to `listen`/`WebSocketServer` via a spy.)

## 4. Restart-required wiring

- [ ] 4.1 In `packages/server/src/config-api.ts`, add `"bindHost"` to `RESTART_FIELDS`.
- [ ] 4.2 Test: `writeConfigPartial({ bindHost })` reports `restartRequired`.

## 5. Settings UI (client, General tab)

- [ ] 5.1 Add a listen-interface picker: Local only (`127.0.0.1`) / All interfaces (`0.0.0.0`) / Specific interface (NIC dropdown from `GET /api/network-interfaces`), bound to `bindHost`.
- [ ] 5.2 Show the existing restart-required banner when `bindHost` changes.
- [ ] 5.3 Show an advisory exposure warning when All interfaces is selected and neither `auth.providers` nor trusted networks are configured.
- [ ] 5.4 Component test for the three options + warning visibility logic.

## 6. Docker + remote

- [ ] 6.1 Set `PI_DASHBOARD_HOST=0.0.0.0` in `docker/compose.yml` and `docker/.env.example`.
- [ ] 6.2 Confirm the docker test harness (`docker/test-up.sh`) `/api/health` probe still passes (container reachable).

## 7. Docs (delegate each `docs/` write to a subagent, caveman style)

- [ ] 7.1 `docs/architecture.md`: document the bind model (loopback default, resolution chain, one host for HTTP + pi gateway, model-proxy stays loopback).
- [ ] 7.2 `docs/file-index-server.md`: rows for `server.ts`, `pi-gateway.ts`, `cli.ts`, `config-api.ts` (note `bindHost`, `See change: configurable-bind-host`).
- [ ] 7.3 `docs/file-index-shared.md`: `config.ts` row (`bindHost` field + default).
- [ ] 7.4 `docs/faq.md`: "How do I expose the dashboard on my LAN?" → set `PI_DASHBOARD_HOST=0.0.0.0` or Settings → All interfaces.

## 8. Verify

- [ ] 8.1 `npm test 2>&1 | tee /tmp/pi-test.log` — no failures.
- [ ] 8.2 Manual: start native (loopback) → confirm not reachable from another host; set env `0.0.0.0` → confirm reachable; flip Settings picker → confirm restart banner + rebind.
- [ ] 8.3 `openspec validate configurable-bind-host` passes.
