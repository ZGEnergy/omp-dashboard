# Tasks

## 1. Doctor-core shape changes (TDD)

- [x] 1.1 Add failing tests in `packages/shared/src/__tests__/doctor-core.test.ts` asserting `DoctorSection` accepts `"tunnel"` and that `SECTION_OF` maps the four new names.
- [x] 1.2 Widen `DoctorSection` union to include `"tunnel"`; add the four `SECTION_OF` entries; add the four `SUGGESTIONS` entries.
- [x] 1.3 Extend `SharedChecksDeps` with optional `getTunnelWatchdogStatus` and `dnsLookup`; default `dnsLookup` to `dns.promises.lookup`.

## 2. Per-check implementation (TDD per check)

- [x] 2.1 `zrok binary` — test: missing → `warning` with `suggestion`; found → `ok` with resolved path in `detail`. Wired via `getDefaultRegistry().resolve("zrok")` in `doctor-routes.ts` (same registry Settings ▸ Tools uses), so diagnostic and runtime agree.
- [x] 2.2 `zrok environment` — test: neither file exists → `warning`; v2 valid → `ok`; v1 valid → `ok` (with note); malformed JSON → `warning` (does not throw). Factored `readZrokEnvironment({homedir,fs})` into `packages/shared/src/zrok-env.ts`; consumed by both `tunnel.ts#loadZrokEnv` and the doctor's `zrok environment` check.
- [x] 2.3 `zrok API reachable` — test: lookup resolves → `ok`; `EAI_AGAIN` / `ENOTFOUND` → `warning` with reason in `detail`; timeout (3 s) → `warning` with "timeout 3000 ms" in `detail`. Uses the injected `dnsLookup` seam; default `defaultDnsLookup` wraps `dns.promises.lookup` with a 3 s timeout.
- [x] 2.4 `tunnel runtime` — four branches covered: no watchdog dep → `ok` "no tunnel data available"; `getTunnelWatchdogStatus()` returns null → `ok` "no tunnel active"; healthy (consecutiveFailures===0 + fresh lastSuccessAt) → `ok` with recycleCount in `detail`; degraded (consecutiveFailures>0 or stale lastSuccessAt) → `warning` with lastFailureReason in `detail`.

## 3. Server wiring

- [x] 3.1 Injected in `packages/server/src/routes/doctor-routes.ts` (the actual `runSharedChecks` callsite for `/api/doctor`): `resolveZrokBinary` delegates to `getDefaultRegistry().resolve("zrok")`; `getTunnelWatchdogStatus` imported from `../tunnel-watchdog.js`. Electron's invocation site untouched.
- [x] 3.2 Existing `doctor-route.test.ts > every check has a section` updated to include `"tunnel"` in the allowed-sections set. Auth gate test unchanged. Live `/api/doctor` confirmed to return 4 tunnel checks (verified end-to-end with running server).

## 4. Spec updates

- [x] 4.1 Spec delta at `openspec/changes/add-tunnel-diagnostic-checks/specs/doctor-diagnostic/spec.md` carries 3 MODIFIED requirements (section taxonomy, Markdown ordering, Web UI ordering) + 1 ADDED requirement (`Tunnel diagnostic checks`) with 12 scenarios. `openspec validate --strict` passes.

## 5. Verification

- [x] 5.1 `openspec validate add-tunnel-diagnostic-checks --strict` passes (verified at apply time).
- [x] 5.2 `npm test` green: 6390 tests passing, 0 failures attributable to this change. `doctor-tunnel-checks.test.ts` covers 16 scenarios (4 checks × ok/warning branches, including the watchdog-runtime four-branch matrix and a stamping integration test).
- [x] 5.3 Equivalent coverage via the `dnsLookup` test seam in `doctor-tunnel-checks.test.ts`: `ENOTFOUND`-style and `timeout 3000ms` failures both exercised end-to-end through `runSharedChecks`. Skipped the `/etc/hosts` mutation step (requires sudo + global system state change); the seam injects the same error envelope `dns.promises.lookup` would raise.
- [x] 5.4 Auto-flows from shared core by construction: the Electron Doctor window calls `runSharedChecks` from the same `doctor-core.ts` and renders whatever sections come back. Since the Electron callsite omits `getTunnelWatchdogStatus`/`resolveZrokBinary`, the `tunnel runtime` row resolves to `ok` "no tunnel data available" and the `zrok binary` row is suppressed — by design (no server, no tunnel to monitor). The `zrok environment` and `zrok API reachable` rows render identically on both surfaces.
