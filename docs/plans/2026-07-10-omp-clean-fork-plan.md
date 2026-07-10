# Clean OMP Fork — Native Implementation Plan

**Branch / worktree:** `omp-grok45` @ `/home/coury/repos/worktrees/omp-dashboard/omp-grok45`  
**Base:** BlackBelt `upstream/develop` (`4afd81dd` and tip-tracked)  
**Date:** 2026-07-10  
**Exit path:** Native implementation plan (not `/decompose-plan`)

---

## Goal

Port pi-agent-dashboard to Oh My Pi with a **minimal forever-delta** so ZGEnergy can regularly merge BlackBelt upstream.

oldschoola/omp-agent-dashboard is a **compatibility checklist only**, never a base.

Success: dashboard on current upstream tip can **resolve OMP, start server, discover/spawn/attach one session, stream a prompt/events**, with forever-delta **≤15 non-test files / ≤800 non-test LOC** of host surface.

---

## Context (locked research + debate)

### Assessment (oldschoola)

| Metric | Value |
|---|---|
| Fork-only commits vs upstream | 2 |
| Files in adaptation commit | 256 (~9.9k / 8.6k) |
| Upstream commits missing | ~477 (~32 days lag as of research) |
| Incomplete renames leftover | ~219 non-test hits |

Vast bulk = renames + marketing/UI. Real OMP logic pockets: path names, package scopes, CLI (`omp`), manifest key `omp`, package-manager rewrite, auth sqlite (`agent.db`), bridge entry resolution.

### Debated decisions (locked)

| Decision | Choice |
|---|---|
| Host profile shape | Single `packages/shared/src/host-profile.ts` (pure data/helpers) |
| Path consolidation | Core **shared + server** only (electron/plugins later) |
| Adapter order | **Verify OMP first**, then implement ONLY required adapters |
| Forever-delta budget | ≤15 forever files / ≤800 non-test LOC |
| Smoke gate | Core session loop (binary + package resolve, dashboard, spawn/attach, stream) |
| Dual pi+OMP product | Non-goal |
| UI / Electron rebrand | Deferred |

### Registry facade policy

- Keep internal tool registry name `"pi"` **only as resolution hub key** during v1 (reduces churn in `resolveExecutor("pi")` call sites).
- Underneath, strategies resolve OMP package scopes + `omp` binary from host profile.
- User-facing tips/docs that must say OMP can land later; identity of packages/peers is always `@oh-my-pi/*` after Phase 2.
- Exit criteria: if facade causes more conflicts than aliases, rename tool key to `"omp"` in a single follow-up with mechanical updates.

---

## Approach

1. **Host profile (constants + pure path helpers)** in shared.
2. **Reroute shared + server runtime path/package/CLI/auth call sites** onto profile (no new raw joins in those packages).
3. **Tool-registry / binary-lookup** reads package scopes + binary names from profile.
4. **Extension peer/import scopes** → `@oh-my-pi/*` for load path.
5. **After OMP verification**, implement only diverging adapters:
   - `PackageManagerHost` if OMP is not DefaultPackageManager-compatible
   - `AuthStorageHost` if OMP is not `auth.json`-only
6. Smoke core session loop; enforce forever-delta budget.

oldschoola is consulted as a ~~diff checklist~~, not cherry-picked wholesale.

### Contemplated forever host surface (budget)

Target ≤15 files of durable host delta (illustrative):

1. `packages/shared/src/host-profile.ts` **(new)**
2. `packages/shared/src/managed-paths.ts`
3. `packages/shared/src/dashboard-paths.ts`
4. `packages/shared/src/platform/binary-lookup.ts`
5. `packages/shared/src/tool-registry/definitions.ts`
6. `packages/shared/src/bridge-register.ts`
7. `packages/server/src/package-manager-wrapper.ts` *(or host adapter behind it)*
8. `packages/server/src/provider-auth-storage.ts` *(or host adapter)*
9. `packages/server/src/pi-resource-scanner.ts`
10. `packages/extension/package.json`
11. root `package.json` (peers/keywords/manifest)
12. `packages/extension/src/bridge.ts` (imports/env)
13. optional consolidated path consumers moved *into* helpers (prefer zero net new if possible)

Server consolidation rewrites of *call sites* that become pure `getDashboardConfigDir()` etc. count against budget only if they remain OMP-specific permanently; prefer generic helpers so merge with upstream stays clean.

---

## Phase 0 — Verify live OMP contracts (no product code)

**Do this before rewriting package/auth adapters.**

### 0.1 Inspect installed OMP (or consume team truth)

Document into `docs/plans/omp-host-contract.md` (this branch):

| Contract | What to record |
|---|---|
| CLI | binary name (`omp`?), form (bun native vs node cli.js), path resolution |
| Packages | scopes (`@oh-my-pi/*` versions), whether `dist/cli.js` exists |
| Homes | agent home (`~/.omp/agent`?), sessions dir, settings path |
| Project-local | `.omp/` vs `.pi/` layout (skills/extensions/prompts) |
| Settings schema | `extensions[]` vs `packages[]`; enable flags |
| Auth | `agent.db` vs `auth.json` vs other; providers.json location |
| Plugins/packages | `~/.omp/plugins` + bun vs npm DefaultPackageManager |
| Manifest | `package.json#omp` fields vs `pi` |
| Env | any `OMP_*` / `PI_*` still honored |

### 0.2 Map checklist from oldschoola (reference only)

Use research clone `/tmp/omp-dashboard-research/omp-agent-dashboard` as checklist of *topics*, not patches.

### 0.3 Accept / stop rule

- If contracts fit profile + small adapters → proceed.
- If OMP requires rewrite of house-sized surfaces (Electron, session protocol, flows) → stop and re-scope; **do not** absorb oldschoola's 256-file spray.
- Dual runtime support remains a non-goal.

**Verify:** contract doc complete; fewer open unknowns than star-items above.

---

## Phase 1 — Host profile module + shared path hub wiring

### 1.1 Add `packages/shared/src/host-profile.ts`

Pure data + pure functions. No I/O, no package manager, no auth.

Suggested surface (adjust names from Phase 0 findings):

```ts
export type HostProfile = {
  agentRootName: string;           // ".omp" | ".pi"
  agentDirName: string;            // "agent"
  dashboardConfigDirName: string;  // "dashboard"
  managedInstallDirName: string;   // ".omp-dashboard" | ".pi-dashboard"
  projectLocalRootName: string;    // ".omp" | ".pi"
  cliBinaryName: string;           // "omp" | "pi"
  codingAgentPackageScopes: readonly string[];
  aiPackageScopes: readonly string[];
  tuiPackageScopes: readonly string[];
  packageKeywords: readonly string[];
  manifestKey: "omp" | "pi";
  envPrefix: string;               // "OMP" | "PI"
  // env var names for sessions if OMP differs
  sessionDirEnv?: string;
  agentDirEnv?: string;
};

export function getHostProfile(): HostProfile; // omp constants for this fork
export function getAgentHome(env?: { homedir?: string }): string;
export function getProjectLocalDir(cwd: string): string;
// thin re-exports / shared path building only
```

OMP fork soft-codes OMP constants **in this one module**. No dual-host toggle.

### 1.2 Wire existing hubs

- `managed-paths.ts`: `getManagedDir`, `getPiSettingsPath` (keep export name or alias) read from host profile.
- `dashboard-paths.ts`: config dir, sessions default fallback use profile.

### 1.3 Shared call sites already using helpers

Leave as-is if they already call getters. Add unit tests for profile path math with `homedir` injection.

**Verify:** unit tests for host-profile + managed/dashboard-paths with fake homedir.

---

## Phase 2 — Server path consolidation (shared + full server package)

### 2.1 Rewrite raw joins in `packages/server/**` (runtime, non-test first)

Replace `path.join(os.homedir(), ".pi", ...)` / `.pi-dashboard` with:

- `getDashboardConfigDir()`
- `getManagedDir()` / `getManagedBin()`
- `getPiSettingsPath()` / agent-home helpers from host-profile
- project-local: `getProjectLocalDir(cwd)`

Priority files (from research scan; re-grep after Phase 1):

- `cli.ts`, `config-api.ts`, `server-pid.ts`, `home-lock.ts`, `tunnel.ts`
- `provider-auth-storage.ts`, `provider-routes.ts`, `provider-probe.ts`
- `package-manager-wrapper.ts` (paths only this phase)
- `pi-resource-scanner.ts`, `routes/recommended-routes.ts`, `routes/plugin-*.ts`
- `rpc-keeper/keeper-manager.ts`, `spawn-failure-log.ts`, editor/headless registries
- `git-operations.ts` / `worktree-init.ts` (project-local settings)

Rule: **no new raw home-path joins** in `packages/shared` or `packages/server` after this phase.

### 2.2 Explicit out of scope

- `packages/electron/**` raw joins
- plugin packages (`kb-*`, `flows-*`, etc.) project-local `.pi` paths unless they block core session loop
- product string rebrand / CSS / SessionList UX

**Verify:** `rg` over `packages/shared` + `packages/server` (excluding tests/docs) shows zero literal `".pi"` home segments outside host-profile + migration comments.

---

## Phase 3 — Tool registry, binary lookup, extension peers

### 3.1 Package scopes from profile

Update:

- `packages/shared/src/platform/binary-lookup.ts` — `MANAGED_PI_PACKAGES` (and jiti package list if OMP drops `@mariozechner/jiti`)
- `packages/shared/src/tool-registry/definitions.ts` — `piExecutorDef` aliases, `moduleDefWithAliases` entries for `pi-coding-agent` / `pi-ai` / tui
- related skew/core-checker package lists in server if they duplicate constants (**prefer import from profile**)

### 3.2 Executor strategy vs OMP binary form

From Phase 0:

- If OMP is node `dist/cli.js` like pi: keep `makeNodeScriptToArgv` + package strategy chain with OMP scopes.
- If OMP is native/bun `omp` binary: add/adapt strategies to `managedBinStrategy(cliBinaryName)` + `whereStrategy(cliBinaryName)`; keep registry tool key `"pi"` if facade still wanted.

### 3.3 Extension package wiring

- root + extension `package.json`: peerDeps / devDeps / keywords / `omp` (or dual-read) manifest
- extension import type scopes: `@oh-my-pi/pi-coding-agent`, `@oh-my-pi/pi-tui` where runtime import/`import type` matter
- `bridge-register.ts`: read manifest key from profile (`omp` then fallback `pi` if useful for legacy packages)
- env: accept `OMP_DASHBOARD_*` and optionally fall back to `PI_DASHBOARD_*` during transition

**Verify:** unit/registry tests that resolve coding-agent package + CLI with mocked paths; extension package builds/typechecks against OMP peers if present in env.

---

## Phase 4 — OMP-only adapters (only if Phase 0 requires)

### 4.1 Package manager

If OMP still exposes DefaultPackageManager-compatible API: keep current wrapper; only change module resolution scopes.

If not (oldschoola proved muddy here): replace internals of `package-manager-wrapper.ts` behind **stable external interface** (`listInstalled`, `run`, `move`, `checkUpdates`) so routes/UI stay.

Do **not** copy oldschoola wholesale; re-implement against verified OMP layout (e.g. `~/.omp/plugins` + bun only if Phase 0 confirms).

### 4.2 Auth storage

If `auth.json` remains valid → path-only changes.

If OMP primary is `agent.db` (or other): implement adapter in `provider-auth-storage.ts` with same exported read/write surface used by routes/UI. Prefer small, well-tested I/O module over scattering SQL.

### 4.3 Resource scanner / recommended routes

Manifest preference `omp ?? pi`; packet install roots from profile.

**Verify:** focused vitests for package-manager + auth adapters with temp HOME; no dependency on live network.

---

## Phase 5 — Smoke (core session loop)

### Must pass

1. Host-profile unit tests green.
2. Focused shared/server vitest for path hubs + registry aliases green.
3. Live (or hermetic with real OMP install on the host):
   - resolve coding-agent module + CLI via registry
   - start dashboard CLI/server with config under profile dashboard dir
   - discover or pin a folder with OMP sessions and/or spawn new session
   - attach / stream at least one user prompt and one assistant/event update
4. Forever-delta budget check:
   ```bash
   # vs upstream/develop, non-test host surface
   git diff --stat upstream/develop...HEAD -- \
     ':(exclude)**/__tests__/**' ':(exclude)**/*test*' ':(exclude)**/*.md' ':(exclude)*lock*'
   ```
   Target: ≤15 forever files materially owned by host delta, ≤800 non-test LOC of host surface (play fair: consolidations that stay generic don't count as OMP forever-delta if they're upstreamable).

### Explicitly not required for acceptance

- Electron installer / wizard cosmetics
- Package UI polish beyond "does not crash"
- Full e2e Playwright suite
- Dual pi+OMP
- oldschoola features (honcho, jj, SessionList UX)

---

## Implementation order (executable checklist)

1. Phase 0 contract doc in worktree (`docs/plans/omp-host-contract.md`).
2. Add `host-profile.ts` + tests; wire `managed-paths` / `dashboard-paths`.
3. Server/shared consolidation of path joins + tests.
4. Binary/registry/peers wiring to profile.
5. Conditional package/auth adapters from contract.
6. Smoke + budget gate.
7. Optional later (non-goal for this plan): Electron path hub reuse, UI rebrand, plugin package path cleanup, upstreamable consolidation PRs back to BlackBelt if desired.

---

## Risks

| Risk | Mitigation |
|---|---|
| Phase 0 shows hard OMP divergence larger than budget | Stop and re-scope; do not spray renames |
| `"pi"` facade confuses package identity | Peers/scopes always OMP; facade only registry key; revisit after smoke |
| Half-port via skipped electron/plugins paths | Document; wait to main path; smoke server/cli only until Electron phase |
| Adapters explode beyond 800 LOC | Cap: package.cache fixed public API; refuse UX refrigerating |
| Reverting to oldschoola base under time pressure | Reject — lag + hybrid paths are the failure mode |

---

## Deferred Ideas (explicit non-goals)

- UI rebrand, CSS, folder chrome from oldschoola
- Electron marketing renames / installer naming
- Dual-host compile switch
- Adopting oldschoola incomplete renames
- honcho-plugin / jj-plugin
- FAQ / marketing site
- Upstream PRs for consolidation (nice-to-have later)

---

## Debate summary (1 round)

- Round 1: requirements + architecture critics.
- HIGHs fixed: verify OMP before adapter rewrite; numeric forever-delta budget; concrete smoke definition.
- MED left accepted: electron/plugins path delay; temporary registry-key facade with exit criteria.
- Strengths retained: checklist-not-base fork, single host profile, deferred branding.

---

## Next step

Implement on `omp-grok45` starting with **Phase 0 OMP contract documentation**, then Phases 1–5 in order. No other agent branches.
