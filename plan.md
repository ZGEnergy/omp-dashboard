# Implementation Plan: OMP Startup Extension Load Optimization (#113)

## Objective

Address OMP extension load latency issue (#113) by removing the eager static import of `discoverDashboard` from `packages/extension/src/bridge.ts`. `discoverDashboard` statically pulls `@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js`, which transitively imports `bonjour-service`, `multicast-dns`, and `dns-packet` during extension module evaluation on OMP boot.

The change defers importing `mdns-discovery.js` to runtime inside the `session_start` event handler right before calling `autoStartServer`. The plan includes:
1. Landing the deferred import of `discoverDashboard` in `bridge.ts`.
2. Adding a unit test in `packages/extension/src/__tests__/bridge-import-timing.test.ts` asserting that evaluating `bridge.ts` does not statically import `bonjour-service`.
3. Adding a measurement script (`scripts/measure-module-eval.js`) and recording per-module evaluation timings in `docs/research-113-findings.md`, addressing #113's 3 open questions.
4. Updating documentation indexes (`docs/AGENTS.md`).

## Files to Modify

1. `packages/extension/src/bridge.ts`
   - Remove static value import of `discoverDashboard` from `@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js`.
   - Dynamically import `discoverDashboard` inside the `session_start` event handler immediately prior to calling `autoStartServer`.
2. `docs/AGENTS.md`
   - Register new findings document `docs/research-113-findings.md`.

## Files to Create

1. `packages/extension/src/__tests__/bridge-import-timing.test.ts`
   - Unit test verifying module graph import properties (e.g. checking module dependencies or loaded module cache after importing `bridge.ts` in isolation to confirm `bonjour-service` is not loaded statically).
2. `scripts/measure-module-eval.js`
   - Measurement script timing isolated module evaluation for `bridge.ts`, `bonjour-service`, `yaml`, `config.ts`, and `role-manager.ts` under Node/Bun.
3. `docs/research-113-findings.md`
   - Documented findings answering #113's 3 open questions based on module timing data and static import analysis, explicitly recording environment boundary notes for interactive PTY benchmarks.

## Implementation Steps

### Step 1: Defer `discoverDashboard` Import in `bridge.ts`
- Edit `packages/extension/src/bridge.ts`:
  - Delete static import: `import { discoverDashboard } from "@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js";`.
  - In `session_start` handler (around line 2789), insert dynamic import:
    ```ts
    const { discoverDashboard } = await import(
      "@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js"
    );
    ```
  - Pass the dynamically resolved `discoverDashboard` to `autoStartServer(config, { discoverDashboard, ... })`.

### Step 2: Create Import Timing Unit Test
- Create `packages/extension/src/__tests__/bridge-import-timing.test.ts`:
  - Mock external dependencies (`provider-register.js`, `role-manager.js`) if needed.
  - Dynamically import `../bridge.js`.
  - Assert that `bonjour-service` is absent from `require.cache` / module registries prior to `session_start`.

### Step 3: Create Measurement Script
- Create `scripts/measure-module-eval.js`:
  - Use `performance.now()` to record import duration for:
    - `@blackbelt-technology/pi-dashboard-shared/mdns-discovery.js` (and `bonjour-service`)
    - `yaml`
    - `@blackbelt-technology/pi-dashboard-shared/config.js`
    - `packages/extension/src/bridge.ts` (before and after deferral)
  - Output structured JSON and human-readable timing table.

### Step 4: Run Measurements & Document Findings
- Run `node scripts/measure-module-eval.js`.
- Create `docs/research-113-findings.md` with:
  - **Question 1 (Bridge vs 6 other extensions):** Recorded module evaluation share of bridge; note that multi-extension interactive PTY benchmarking is constrained in headless subagent environments.
  - **Question 2 (Bonjour vs config/role/YAML/remaining imports):** Detailed breakdown of `bonjour-service` evaluation time vs `yaml` / config IO time.
  - **Question 3 (Inspector / module trace capabilities):** Analysis of Node/Bun `--trace-warnings`, `--cpu-prof`, and V8 inspector availability through wrapper environments.

### Step 5: Update AGENTS Documentation Index
- Add entry to `docs/AGENTS.md` for `docs/research-113-findings.md`.

### Step 6: Verify Test Suite
- Run `npx vitest run packages/extension/src/__tests__/bridge-import-timing.test.ts`.
- Run `npx vitest run packages/extension/src/__tests__/bridge-ask-registration.test.ts`.
- Run `npx vitest run packages/extension/src/__tests__/server-auto-start.test.ts`.
- Run `npx vitest run packages/shared/src/__tests__/mdns-discovery.test.ts`.

## Test Plan

- **Bridge Import Timing Test:** `npx vitest run packages/extension/src/__tests__/bridge-import-timing.test.ts` to confirm static import deferral.
- **Ask Registration Timing Test:** `npx vitest run packages/extension/src/__tests__/bridge-ask-registration.test.ts` to ensure factory-time `ask`/`ask_user` tool registration remains unaffected.
- **Server Auto-Start Test:** `npx vitest run packages/extension/src/__tests__/server-auto-start.test.ts` to ensure mDNS discovery and auto-start logic behavior remain unbroken.
- **mDNS Discovery Test:** `npx vitest run packages/shared/src/__tests__/mdns-discovery.test.ts` to verify mDNS shared module functions.
- **Measurement Script Verification:** `node scripts/measure-module-eval.js` to ensure timing script executes without errors.

## Acceptance Criteria

1. `packages/extension/src/bridge.ts` no longer statically imports `discoverDashboard`.
2. `discoverDashboard` is dynamically imported inside `session_start` prior to calling `autoStartServer`.
3. `packages/extension/src/__tests__/bridge-import-timing.test.ts` passes and asserts deferral.
4. Existing bridge registration and auto-start vitests pass.
5. `scripts/measure-module-eval.js` and `docs/research-113-findings.md` exist and provide empirical timing evidence answering #113's 3 open questions.
6. `docs/AGENTS.md` is updated with `docs/research-113-findings.md`.
