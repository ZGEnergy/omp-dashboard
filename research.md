# Research: OMP extension-load startup cost (#113)

## Objective

Map dashboard bridge startup imports and isolate smallest safe measurement/change target.

## Affected files

- `packages/extension/src/bridge.ts` — extension entry. Static-imports `discoverDashboard`; factory activates provider/role managers, registers core `ask`, then calls `initBridge`. `initBridge` synchronously calls `ensureConfig()` then `loadConfig()`.
- `packages/shared/src/mdns-discovery.ts` — static-imports `Bonjour` from `bonjour-service`. It constructs `Bonjour` only from `getBonjour`, `discoverDashboard`, or `createBrowser`; `discoverDashboard` defaults to 2,000 ms and runs only when called.
- `packages/extension/src/server-auto-start.ts` — owns discovery → health check → launch. `autoStartServer` awaits injected `discoverDashboard(2000)` unless `PI_DASHBOARD_NO_MDNS` is `1`, `true`, or `yes`.
- `packages/extension/src/role-manager.ts` — factory activation calls `loadRoleConfig`, which synchronously reads/parses OMP `config.yml`; it statically imports `yaml`.
- `packages/shared/src/config.ts` — `ensureConfig` synchronously creates missing `~/.pi/dashboard/config.json`; `loadConfig` synchronously reads and JSON-parses it when present.
- `packages/extension/src/__tests__/bridge-ask-registration.test.ts` — locks factory-time registration of `ask`, plus `ask_user` for dashboard-spawned sessions.
- `packages/extension/src/__tests__/server-auto-start.test.ts` — locks mDNS selection, health fallback, launch, post-launch rediscovery, and `PI_DASHBOARD_NO_MDNS` opt-out.
- `packages/shared/src/__tests__/mdns-discovery.test.ts` — covers local-service, hostname, and health fallback; no import-timing test.
- `packages/shared/package.json`, `packages/extension/package.json`, `package-lock.json` — dependency declarations/resolutions.

## Import/startup graph

```text
bridge.ts module evaluation
  -> shared/mdns-discovery.ts module evaluation
     -> bonjour-service@1.4.2
        -> multicast-dns@7.2.5
           -> dns-packet@5.6.1
  -> role-manager.ts module evaluation
     -> yaml@2.9.0

bridge default factory
  -> activateRoleManager(pi) -> loadRoleConfig() -> sync config.yml read + YAML parse
  -> registerAskTool(pi) [must remain factory-time]
  -> initBridge(pi) -> ensureConfig() + loadConfig() [sync config.json I/O/parse]

bridge session_start
  -> autoStartServer(config, { discoverDashboard, ... }) [not awaited by handler]
     -> discoverDashboard(2000) unless PI_DASHBOARD_NO_MDNS
     -> Bonjour construction/browse only here
```

`mdns-discovery.ts` is also a runtime dependency of `packages/server/src/server.ts` (advertise/browser) and `packages/server/src/cli.ts` (discovery); those uses must retain its public API. `packages/server/src/routes/known-servers-routes.ts` and its test import only `DiscoveredServer` as a type.

## Key interfaces/contracts

- `discoverDashboard(timeout?: number): Promise<DiscoveredServer[]>`; `DiscoveredServer` includes `host`, `port`, `piPort`, `version`, `pid`, `isLocal`, and `source`.
- `autoStartServer(config, deps): Promise<AutoStartResult>` receives `deps.discoverDashboard`; it returns selected local mDNS server first, otherwise health result, otherwise launches when `autoStart` permits.
- Bridge calls `autoStartServer` in `session_start` without awaiting it. It still updates WebSocket URL if returned `piPort` differs from config.
- Factory-time `registerAskTool(pi)` is required because pi snapshots registered tools before `session_start`; dashboard-spawned `registerAskUserTool(pi)` has same timing requirement.
- `activateRoleManager(pi)` registers role event handlers and immediately loads model roles. `lookupRole` re-reads config later.

## Risks

1. Deferring entire bridge/factory until `session_start` breaks tool-registration timing covered by `bridge-ask-registration.test.ts`.
2. Deferring `mdns-discovery` must preserve `autoStartServer` behavior: normal runs browse before health fallback; `PI_DASHBOARD_NO_MDNS` skips both pre- and post-launch browse.
3. Moving only bridge import leaves server advertising/discovery imports unchanged; this targets OMP extension-load path, not server-process startup evaluation.
4. Role-manager YAML work is factory-time, synchronous, and independent of Bonjour. A Bonjour-only change cannot prove or eliminate that cost.
5. Issue benchmark disables seven extensions together. Repository code cannot allocate measured extension delta among them.

## Dependencies

- Declared: shared `bonjour-service: ^1.3.0`; extension `yaml: ^2.9.0`.
- Locked: `bonjour-service@1.4.2` → `multicast-dns@7.2.5` → `dns-packet@5.6.1`; root `yaml@2.9.0`.
- `docs/service-bootstrap.md` records Pi TUI → bridge → server and same mDNS → health → launch chain. `docs/architecture.md` records server mDNS advertisement/browser.

## Recommendations

Smallest candidate: remove bridge.ts's static value import of `discoverDashboard`; dynamically import it only when `session_start` auto-start path needs mDNS, then pass resolved function into unchanged `autoStartServer`. Keep `mdns-discovery.ts`, server callers, `autoStartServer` contract, and factory-time ask-tool registration unchanged. Do not defer all `initBridge`.

Measurement plan before implementation:

1. Establish per-extension attribution: repeated timed `omp -p` runs with normal seven-module set, then disable only dashboard bridge while retaining other six; report medians and spread for first MCP child and first TUI render. Answers question 1.
2. Establish bridge-import attribution with temporary measurement branch: compare current bridge against equivalent bridge with only mDNS value import deferred; separately time minimal module importing `bridge.ts`, `mdns-discovery.ts`, `config.ts`, and `role-manager.ts` under same Bun/OMP runtime. Record module-evaluation boundary and clean baseline. Distinguishes question 2 without claiming pre-measurement shares.
3. Inspect `omp --help`/wrapper source and launch environment for inspector or module-load-trace forwarding; if none, invoke Bun directly only with same entry/options needed to reproduce. Capture command, runtime version, and whether output gives per-module evaluation time. Resolves question 3 empirically.
4. After candidate change, repeat step 1; run focused bridge factory, auto-start, and mDNS tests. Verify session startup still begins discovery asynchronously and retains mDNS/health/launch outcomes.

## Open questions status

1. **Bridge vs six other extensions:** code proves bridge is one extension entry and all seven were disabled by issue control. It does not prove bridge share. Timed one-module isolation remains required.
2. **Bonjour vs config/role/YAML/remaining imports:** code proves eager `bridge.ts` → `mdns-discovery.ts` → `bonjour-service` evaluation, and factory-time synchronous config/role work. It does not measure any component. Timed import/isolation experiment remains required.
3. **Bun/V8 inspector or module-load trace through `omp`:** issue evidence says wrapper did not expose inspector flags; this repository contains dashboard code, not OMP wrapper. No repository file proves availability. Wrapper/runtime help/source experiment remains required.
