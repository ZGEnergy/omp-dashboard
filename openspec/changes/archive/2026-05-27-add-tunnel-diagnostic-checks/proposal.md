# Add tunnel diagnostic checks to Doctor

## Why

When the zrok tunnel button "doesn't connect," the failure mode is invisible to the user. Real session evidence from `~/.pi/dashboard/server.log`:

```
zrok reserve failed: Command failed: zrok reserve public http://localhost:8000 --json-output
[ERROR]: unable to create share (error getting zrok client: ... dial tcp: lookup api-v1.zrok.io: no such host)
zrok process exited before producing URL (code 1)
```

The user sees only a spinning button. Settings ▸ Tools shows `zrok ✓ system /opt/homebrew/bin/zrok where ok` — so the binary check passes, which **misleads** the user into thinking it's a PATH problem. The actual cause was a transient DNS failure during `zrok reserve`, fully invisible to every existing diagnostic surface.

The existing **tunnel watchdog** (`packages/server/src/tunnel-watchdog.ts`) is structurally unable to surface this class of failure. It is a *post-creation* liveness probe — it only fires when `getUrl()` returns a non-null URL. Creation-time failures (DNS, missing enrollment, orphan processes, stale reserved shares) never reach it. Its status (`getTunnelWatchdogStatus()`) is rich and accurate **for a running tunnel** but silent on everything else.

Meanwhile, the doctor system (`packages/shared/src/doctor-core.ts` + `GET /api/doctor` + Settings ▸ Diagnostics + Electron Doctor window) is the right surface for this: shared, sectioned, auth-gated, copyable as Markdown, already wired into both the web and Electron UIs. It currently has zero coverage of the tunnel.

## What Changes

**Reuse the watchdog as one input, add pre-creation checks for the rest.**

- **NEW checks in `runSharedChecks`** (`packages/shared/src/doctor-core.ts`):
  1. `zrok binary` — resolve via the same `ToolResolver.which("zrok")` the tunnel runtime uses, so diagnostic and runtime agree on which binary will be invoked. `ok` if found; `warning` (with install suggestion) if missing.
  2. `zrok environment` — check `~/.zrok2/environment.json` ∨ `~/.zrok/environment.json` for valid JSON with `zrok_token` present. `ok` if enrolled; `warning` (with `zrok invite` + `zrok enable <token>` suggestion) if missing or malformed.
  3. `zrok API reachable` — `dns.promises.lookup("api-v1.zrok.io")` with a 3000 ms timeout. `ok` on resolve; `warning` on NXDOMAIN / `EAI_AGAIN` / timeout with a "check network / DNS / VPN" suggestion. **This is the check that would have caught the reported case.**
  4. `tunnel runtime` — wraps `getTunnelWatchdogStatus()` (passed in via a new `SharedChecksDeps` field). Three branches: no tunnel running ⇒ `ok` with detail "no tunnel active"; tunnel up and `lastSuccessAt` within `intervalMs × 3` ⇒ `ok` with detail showing url + recycleCount; tunnel up but `consecutiveFailures > 0` or `lastSuccessAt` stale ⇒ `warning` with `lastFailureReason` in detail and "click 🌐 Tunnel button to re-create" suggestion.

- **NEW `SUGGESTIONS` entries** for each of the four check names. Pattern matches existing entries (template string with concrete next step, no "contact support").

- **NEW `SECTION_OF` entries** routing all four to a new `tunnel` section.

- **EXTEND `DoctorSection` union** to add `"tunnel"`. Update the `Section ordering is stable` scenario in the doctor-diagnostic spec to insert `tunnel` after `server` and before `setup`.

- **EXTEND `SharedChecksDeps`** with two optional fields:
  - `getTunnelWatchdogStatus?: () => TunnelWatchdogStatus | null` (injected by server only; Electron passes undefined ⇒ the runtime check resolves to `ok` "no tunnel data available" and skips the watchdog branch entirely).
  - `dnsLookup?: (host: string) => Promise<void>` (test seam; defaults to `dns.promises.lookup`).

- **NO behavior change to the tunnel itself.** No new routes, no protocol changes, no migration. Pure observability layered on existing data + three new probes.

- **Optional follow-up (NOT in this change)**: extend `TunnelWatchdogStatus` with cumulative `totalProbes` / `totalFailures` counters for a richer health row. Deferred — current snapshot is enough for v1.

## Capabilities

### Modified Capabilities

- `doctor-diagnostic`:
  - **Modify** `Section taxonomy on every check` requirement: `DoctorSection` adds `"tunnel"`; add a scenario mapping the four new check names (`zrok binary`, `zrok environment`, `zrok API reachable`, `tunnel runtime`) to `section: "tunnel"`.
  - **Modify** `Markdown export of the doctor report` requirement: update the `Section ordering is stable` scenario to insert `tunnel` after `server` and before `setup` (final order: runtime, pi-tooling, server, tunnel, setup, diagnostics).
  - **Modify** `Web UI renders the doctor report in Settings → Diagnostics` requirement: same section-order update.
  - **Add** `Tunnel diagnostic checks` requirement bundling the four checks, their failure classifications (binary missing / env missing / DNS failure / watchdog stale), the test-seam contract (`dnsLookup` + `getTunnelWatchdogStatus` injection), and the no-watchdog-data fallback rule.

### Affected Specs (read-only references, no change)

- `zrok-tunnel` — unchanged; the diagnostic reads its environment file and binary in a read-only manner identical to existing detection helpers.

## Impact

- **Code**: ~120 LOC in `packages/shared/src/doctor-core.ts` (4 checks + 4 suggestions + 4 section entries + union widening + 2 deps fields). ~5 LOC in `packages/server/src/server.ts` to inject `getTunnelWatchdogStatus`. ~60 LOC of tests in `packages/shared/src/__tests__/doctor-core.test.ts` (ok / warn / error path per check, with mocked deps).
- **No behavior change to `runtime`, `tunnel.ts`, or `tunnel-watchdog.ts`.** The watchdog status accessor is consumed; the watchdog itself is untouched.
- **API surface**: `GET /api/doctor` response gains four rows in a new `tunnel` section. Existing clients are unaffected — the renderer iterates whatever sections come back.
- **Auth**: unchanged; the new checks ride the existing `/api/doctor` auth gate.
- **Network**: one DNS lookup per `/api/doctor` invocation (~1 ms cached, ~30–100 ms cold). Bounded by the 3 s timeout. No outbound HTTP.
- **Rollback**: revert the doctor-core changes. The `tunnel` section disappears from the response; no migration, no persisted state.
- **Cross-platform**: macOS / Linux / Windows identical — `dns.promises.lookup` is Node built-in; `ToolResolver` already handles the `where` strategy on Windows; environment files use `os.homedir()`.
