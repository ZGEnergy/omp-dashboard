# Test Plan — provision-openspec-cli-in-sessions

Stage: design   Generated: 2026-07-20

Gaps resolved at the hard gate: CLI pinned to **1.6.0** (skill-generator parity);
provisioning failure surfaces **both** (always log + dashboard `missingTool` signal
on hard failure).

---

## Scenarios

### Edge-case

| id | requirement | technique | level | disposition | input | trigger | expected observable |
|----|-------------|-----------|-------|-------------|-------|---------|---------------------|
| E1 | R1 resolvable in-session | state / process-spawn | L1 | automated | a child env whose `PATH` contains no `openspec` | run the provision helper, then spawn `sh -c "openspec --version"` with the resulting `PATH` | exit 0 AND stdout contains `1.6.0` |
| E2 | R2 idempotent prepend | state-transition (re-run) | L1 | automated | `process.env.PATH` after one provision call | call the provision helper a second time (simulated `/reload`) | the canonical shim dir appears exactly once in `PATH` |
| E3 | R2 re-point on init | state-transition (upgrade) | L1 | automated | an existing shim file targeting an OLD resolved bin path | run provision with a CHANGED resolved bin path | shim file content targets the NEW `bin/openspec.js`; write was temp+rename (no partial file observed) |
| E4 | R2 non-destructive | invariant | L1 | automated | `PATH` seeded with a fake global `openspec` dir BEFORE provision | run provision | the fake global dir is still present and its relative order preserved (prepend-only) |

### Error-handling

| id | requirement | technique | level | disposition | fault | trigger | expected observable |
|----|-------------|-----------|-------|-------------|-------|---------|---------------------|
| X1 | R4 fail-soft + surface | fault-injection (resolve throws) | L1 | automated | `require.resolve` for the pinned CLI stubbed to throw | bridge provision runs at init | init returns without throwing; `PATH` unchanged; a diagnostic is logged AND the `missingTool`-style emit is invoked (spy asserts both) |
| X2 | R1 + F3 stripped PATH | fault-injection (no node on PATH) | L1 | automated | a child env whose `PATH` lacks `node` | invoke the shim `openspec --version` | exit 0 — resolves `node` via absolute `process.execPath`, not `PATH` |

### Frontend-quirk

_None — this change touches the bridge/process layer only; the Apply button and all rendered UI are unchanged (no L3 scenario)._

### Performance

_None — provisioning is a one-time, negligible init step; no latency/throughput threshold in scope._

---

## Coverage summary

- Requirements covered: 4/4 (R1 resolvable, R2 idempotent+non-destructive+re-point, R3 cross-platform, R4 fail-soft+surface)
- Scenarios by class: edge 4 · perf 0 · frontend 0 · error 2 · cross-platform 1 (C1 below)
- Scenarios by level: L1 6 · L2 1 · L3 0
- Scenarios by disposition: automated 7 · manual-only 0

### Cross-platform

| id | requirement | technique | level | disposition | input | trigger | expected observable |
|----|-------------|-----------|-------|-------------|-------|---------|---------------------|
| C1 | R3 cross-platform via Git Bash | multi-OS runtime | L2 | automated | a Windows session; `openspec` NOT on the pre-existing PATH; `node` NOT required on PATH | bash tool runs `openspec --version` via `bash.exe -c` after provision | the extensionless shim resolves; exit 0; prints `1.6.0` |

## New infra needed

- none — L1 reuses `packages/extension/src/__tests__/` (vitest); L2 reuses `qa/tests/*.ps1`.
