# Porting pi-agent-dashboard → Oh My Pi: Assessment & Plan

**Branch:** `omp-opus48` · **Base:** `4afd81dd` (= `upstream/develop` = `fork/main`, pristine)
**Author model:** claude-opus-4-8 · **Date:** 2026-07-10

This document answers two questions:

1. Is `oldschoola/omp-agent-dashboard` a good template? What is **vital** vs
   **excessive**?
2. How do we build our own **minimal** omp fork that stays close to upstream
   (`BlackBeltTechnology/pi-agent-dashboard`) so we can track it with small,
   mechanical merges?

Every structural claim below is grounded in a read of the actual code/docs
(upstream tree, the `oldschoola` diff, and the `omp://` harness docs). Where a
statement is a design recommendation rather than an observed fact it is marked
**[PROPOSED]**.

---

## 1. TL;DR

- **`oldschoola` is not "hundreds of commits" of divergence.** It is **2 commits**
  on a base that is **477 commits behind** upstream, but those commits touch
  **256 files (+9,866 / −8,570)**. The size comes from four avoidable sources, not
  from the port being intrinsically large.
- **The true port surface is small.** The dashboard core (session mirroring, chat,
  spawn, diff, OpenSpec) is **already decoupled from the pi SDK** — it parses
  session JSONL directly. The only hard SDK coupling is a **dynamic**
  `resolveModule("pi-coding-agent")` in **two files**, and both already **fail
  safe** against a non-pi runtime.
- **Recommendation:** fork from the **current upstream tip** (this branch already
  is), keep the diff **minimal and mostly mechanical**, quarantine every pi→omp
  delta behind **one constants module + a handful of adapter points**, and
  **drop** the Electron app, the standalone bundled-Node installer, the managed
  package-manager rework, and the version/update-check banner. Keep the dashboard
  **server on Node** (maximum parity, native deps keep working); only the **bridge
  extension** runs inside omp (Bun), and it ports in ~40 lines.
- Result: a fork whose human-authored diff is on the order of **dozens** of lines
  of real logic (plus mechanical scope/path substitutions), re-mergeable with
  `git merge upstream/develop` + a re-runnable codemod.

---

## 2. What the dashboard is (upstream architecture)

Three components (`docs/architecture.md`):

```
┌─────────────┐   WebSocket    ┌──────────────┐   WebSocket   ┌────────────┐
│   Bridge    │ ◄────────────► │  Dashboard   │ ◄───────────► │ Web Client │
│  Extension  │   (port 9999)  │   Server     │   (port 8000) │  (React)   │
│  (per agent)│                │  (Node.js)   │               │ (Browser)  │
└─────────────┘                └──────────────┘               └────────────┘
```

1. **Bridge extension** (`packages/extension`) — loaded into *every* agent
   session. Forwards agent events to the server over WS, relays commands back,
   routes `ctx.ui` dialogs through a PromptBus. This is the only component that
   runs **inside** the agent process.
2. **Dashboard server** (`packages/server`) — Node + Fastify + `ws`. Accepts
   bridge connections (9999) and browser connections (8000), keeps an in-memory
   session/event registry, discovers historical sessions from disk, polls the
   OpenSpec CLI, serves the built client, spawns new sessions, runs the
   integrated PTY terminal.
3. **Web client** (`packages/client`) — React SPA.

Plus `packages/shared` (protocol types, tool-registry, launcher), `packages/electron`
(desktop shell), and ~20 optional plugin packages.

### How tightly is the server coupled to pi?

**Much less than expected.** Verified by grep of `packages/server/src`:

| Concern | Reality in upstream |
|---|---|
| List/read historical sessions | `session-discovery.ts` + `session-file-reader.ts` — *"standalone JSONL reader… **no pi-coding-agent dependency**"*. |
| Session registry / event store | `memory-session-manager.ts` / `memory-event-store.ts` — pure in-memory, *"replaces the SQLite-backed"* versions. |
| The `@earendil-works/pi-coding-agent` import | Appears **only in test mocks** and **two runtime files**, both via **dynamic** `ToolRegistry.resolveModule("pi-coding-agent")` (never a static top-level import): `pi-resource-activation.ts` (reads pi's `DefaultPackageManager`/`SettingsManager` for the Settings "resolved tools" table + plugin toggles) and `package-manager-wrapper.ts` (in-dashboard package install). |
| Failure behavior against non-pi | `pi-resource-activation` wraps the load in `try/catch → null`; `package-manager-wrapper` throws a *handled* "does not export DefaultPackageManager". **Neither crashes the server.** |
| Runtime | Node ≥22.19, launched via pi's `jiti` loader; deps: `fastify`, `ws`, `node-pty`, `jiti`, `tsx`, `@fission-ai/openspec`, `diff`, `bonjour-service`. No `better-sqlite3` (removed in favor of in-memory stores). |

**Implication:** the server needs almost nothing from the omp SDK. If we *don't*
load the omp SDK from the Node server (i.e. drop/stub those two features), the
server has **zero** exposure to omp's Bun-only APIs (`bun:sqlite`) and can keep
running on Node unchanged.

---

## 3. The pi → omp contract (from `omp://` harness docs)

What actually differs between pi (`@earendil-works/*` / `@mariozechner/*`) and omp
(`@oh-my-pi/*`), scoped to what the dashboard touches:

| Area | pi (upstream) | omp | Source |
|---|---|---|---|
| **Package scope** | `@earendil-works/pi-*`, `@mariozechner/pi-*` (e.g. `pi-ai@0.75`) | `@oh-my-pi/pi-*` (e.g. `pi-ai@15.10`) | `porting-from-pi-mono.md` §3 |
| **Runtime** | Node + jiti/tsx | **Bun** (`bun:sqlite`, native `import()`, `bun` shebangs) | porting §4, §7 |
| **Extension load** | jiti | Native Bun `import()`; loader **auto-rewrites** `@mariozechner/*`, `@earendil-works/*`, `@sinclair/typebox` specifiers onto host copies at load | `extension-loading.md` |
| **Manifest key** | `pkg.pi.{extensions,skills}` | `pkg.omp.*` **preferred**, `pkg.pi.*` **still accepted** | `extension-loading.md`, porting §15 |
| **Sessions on disk** | `~/.pi/agent/sessions/<enc>/<ts>_<id>.jsonl` | `~/.omp/agent/sessions/…` — **same JSONL format** (v3) | `session.md` |
| **Global settings** | `~/.pi/agent/settings.json` | `~/.omp/agent/config.yml` (**YAML**); legacy `~/.omp/agent/settings.json` **still read** | `settings.md` |
| **Extension registration** | write `packages[]`/`extensions[]` into `~/.pi/agent/settings.json` | `extensions:` in `config.yml`, or native discovery in `~/.omp/agent/extensions/` + `<cwd>/.omp/extensions/`; legacy `settings.json#extensions` still read | `extension-loading.md` |
| **Auth storage** | `proper-lockfile` + `auth.json` | `agent.db` (**bun:sqlite**), multi-credential | porting §15 |
| **Agent-dir relocation** | — | `PI_CODING_AGENT_DIR` moves the whole `~/.omp/agent` base | `settings.md` |
| **CLI** | `pi` | `omp` | README |
| **Extension API** | `ExtensionAPI` from the SDK; `StringEnum` from `pi-ai` | same shape; `StringEnum`→`Type.Enum`/`pi.zod`; `formatSize`→`formatBytes`; capability discovery replaces `DefaultPackageManager`/`SettingsManager` | `extensions.md`, porting §15 |

Two omp behaviors dramatically shrink the port:

- The extension loader **auto-rewrites legacy pi scopes at load time**, so a
  bridge that still imported `@earendil-works/pi-coding-agent` would likely load
  under omp anyway. We still swap scopes for a clean build/typecheck.
- omp **still reads `pkg.pi` manifests and legacy `settings.json`**, so the
  manifest-key and register-target changes are "nice to have," not strictly
  required for a first boot.

---

## 4. Assessment of `oldschoola/omp-agent-dashboard`

### 4.1 Why it *looks* massive (and why that's misleading)

`git merge-base oldschoola/develop upstream/develop` → `5e64baa3`. From there:

- oldschoola: **2 commits**; upstream has since moved **+477 commits**.
- The one substantive commit (`970c22e7 "feat: adapt dashboard fork for oh my pi"`)
  changes **256 files, +9,866 / −8,570**.

Change distribution (excluding lockfile, real signal):

| Bucket | files | +add | −del |
|---|--:|--:|--:|
| `package-lock.json` | 1 | 4,542 | 5,223 |
| `packages/server` | 80 | 2,352 | 1,807 |
| `packages/client` | 59 | 1,255 | 530 |
| `packages/shared` | 28 | 823 | 390 |
| `packages/electron` | 27 | 292 | 127 |
| `packages/extension` | 28 | 223 | 137 |
| `docs/` | 15 | 275 | 245 |

Biggest files: `package-manager-wrapper.ts` (769) + its 3 test files (~1,100),
`provider-auth-storage.ts` (**+352, new**), `pi-core-checker.ts`, `SessionList.tsx`,
`SettingsPanel.tsx`, `bridge-register.ts`.

**The bulk is avoidable, not intrinsic:**

1. **`package-lock.json` = ~9.8k lines ≈ half the entire diff** — a regenerated
   npm lockfile. omp doesn't even use npm lockfiles (Bun). Pure noise.
2. **One grab-bag commit.** Its own message admits it bundles unrelated work:
   *"tighten the Windows Electron shell and folder workflow UX"* — Windows/Electron
   and folder-UX changes that have nothing to do with the pi→omp port.
3. **It ported the heaviest, most brittle subsystems** that a CLI deployment never
   needs: the **Electron desktop app**, the **standalone bundled-Node installer**,
   a **managed package-manager rework** (`~/.omp-dashboard/node_modules`,
   `~/.omp/plugins/node_modules`), and a **version/update-check** stack
   (`pi-core-checker`, changelog fetchers).
4. **Stale base.** Forking 477 commits back guarantees the divergence is baked into
   256 changed files against an old tree — it can never cleanly track upstream.

### 4.2 What it got *right* (genuinely vital work, independent of bloat)

- Dependency **scope swap** to `@oh-my-pi/*` (all `package.json` + imports).
- **Path** migration `~/.pi/*` → `~/.omp/*`.
- **Manifest key** `pi`→`omp` and skills dir `.pi/skills`→`.omp/skills`.
- **Bridge extension** adaptation — and it confirms the thesis: `bridge.ts` changed
  only **~16 lines** (mostly cosmetic strings + an `OMP_DASHBOARD_URL` env
  fallback + a `BRIDGE_KEY` rename). The event API is compatible.
- **Auth-in-`agent.db`** adapter (`provider-auth-storage.ts`) — correct *if* you
  keep the browser-based provider sign-in feature.

### 4.3 Verdict

Use it as a **reference for the touch-points**, not as a template to fork. Its
size is ~85% avoidable (lockfile + Electron/standalone + version-check +
grab-bag + stale base). Our fork should reproduce only §4.2's vital core.

---

## 5. Vital vs. excessive for **our** fork

### VITAL — irreducible port surface

| # | Change | Where | Notes |
|---|---|---|---|
| V1 | Scope swap `@earendil-works`/`@mariozechner` → `@oh-my-pi` | all `package.json` + imports | Mechanical; codemod-able. Needed for clean build/types even though omp's loader auto-rewrites at runtime. |
| V2 | Paths `~/.pi/` → `~/.omp/` | session dir, `~/.pi/dashboard/` prefs+pid, resource scan, register target | **Centralize in one constants module** so upstream churn never collides. Honor `PI_CODING_AGENT_DIR`. |
| V3 | Bridge manifest `pkg.pi`→`pkg.omp`; skills `.pi/skills`→`.omp/skills` | `packages/extension/package.json` + dir rename | Legacy `pi` accepted, but do it for cleanliness. |
| V4 | Extension auto-register target | server `extension-register.ts` | Prefer writing legacy `~/.omp/agent/settings.json#extensions` (JSON, still read) — simplest; or `config.yml` `extensions:` (YAML). |
| V5 | Spawn `omp` instead of `pi` | server spawn/tmux paths | CLI name + any `pi …` argv. |
| V6 | Server TS launch without pi's jiti | `bin/pi-dashboard.mjs`, `server-launcher.ts` | Use the server's **own** bundled `jiti`/`tsx` (Node) — drop the "resolve pi's jiti" dance. |
| V7 | Branding pi→omp | client strings, logo, README note | Cosmetic but expected. |

### EXCESSIVE — drop for a minimal fork

| # | Drop | Why |
|---|---|---|
| E1 | `packages/electron` (desktop app, signing, auto-update, managed-node) | ZGEnergy runs `pi-dashboard start` on localhost + zrok (see `zrok-pi-dashboard-setup.md`). No desktop app. |
| E2 | Standalone bundled-Node installer + managed package-manager rework | CLI users install via `omp`/bun. This is oldschoola's single largest chunk. |
| E3 | Version/update-check banner (`pi-core-checker`, `pi-version-skew`, `pi-dev-version-check`, `changelog-*`) | Pure nicety; all pi-registry-coupled. |
| E4 | Regenerated `package-lock.json` churn | Keep lockfile stable / use bun; don't hand-regenerate. |
| E5 | Test-framework churn | Keep the existing **vitest** suite as-is (do **not** rewrite to `bun:test`). |
| E6 | Wholesale doc rewrites | One short README note + this file; leave upstream docs untouched to keep merges clean. |

### OPTIONAL — defer to v2

| # | Feature | Decision |
|---|---|---|
| O1 | Browser provider sign-in (`provider-auth-storage`, `ProviderAuthSection`, `/api/providers`) reading `agent.db` | **Defer.** Users configure providers via `omp` directly. Hide the onboarding "Setup credentials" card. Add the `agent.db` adapter later if wanted. |
| O2 | In-dashboard plugin toggles + package install (`pi-resource-activation`, `package-manager-wrapper`) | **Keep code, stub the pi-SDK call.** Both already fail safe against omp. The Settings "resolved tools" table will be empty and install will no-op until wired to omp's capability API — acceptable for v1. |
| O3 | Integrated PTY terminal (`node-pty`) | **Keep** (works on Node). Only becomes a question if the server ever moves to Bun. |

---

## 6. Recommended architecture

**[PROPOSED]** Two runtimes, matching today's reality:

- **Bridge extension → runs inside omp (Bun).** This is the only omp-coupled
  component and it ports trivially (§4.2). omp's loader handles TS + legacy-scope
  rewriting.
- **Dashboard server → stays on Node.** Rationale:
  - Maximum upstream parity — the server core is byte-identical to upstream.
  - `node-pty`, `jiti`/`tsx`, `fastify`, `ws`, worker pools (which rely on
    `execArgv`/jiti propagation) keep working with **no** Bun porting.
  - Because we *don't* load the omp SDK from the Node server (O2 stubbed), the
    server never touches omp's Bun-only `bun:sqlite` — no runtime conflict.
  - The extension (Bun) spawns the server as a separate **Node** process, exactly
    as pi does today; only the jiti-resolution source changes (V6).

**Quarantine principle:** every pi→omp delta lives in one of:
1. `packages/shared/src/omp-constants.ts` **[new]** — scope, CLI name, all
   `~/.omp/*` paths, manifest key, env-var names. Single source of truth.
2. A short list of adapter edits: `extension-register.ts` (V4), the spawn path
   (V5), the launcher (V6), and the two O2 stub points.

Everything else stays upstream verbatim → merges stay clean.

---

## 7. Upstream-parity maintenance strategy

The #2 concern. Design the fork so a merge is boring:

1. **Fork from the tip** (done: this branch = `4afd81dd`). Never fork behind.
2. **Keep the diff mechanical.** Scope + path substitutions are produced by a
   committed **codemod** (`scripts/omp-codemod.ts` **[PROPOSED]**), so re-applying
   after a merge is one command, not manual re-editing.
3. **Centralize semantics** in `omp-constants.ts` (§6) so upstream edits to
   unrelated lines never conflict with our path/scope changes.
4. **Delete, don't modify, the dropped subsystems** (E1–E3). Deleting a package
   produces no merge conflicts on future upstream edits to it (a delete/modify
   conflict resolves trivially to "keep deleted").
5. **Merge loop:**
   ```
   git fetch upstream
   git merge upstream/develop          # core conflicts should be near-zero
   bun run scripts/omp-codemod.ts      # re-apply scope+path substitutions
   # reconcile only the few adapter files (register/spawn/launch/stubs)
   bun run build && vitest run         # verify
   ```
6. **Track the sync point** in this file's header on every merge (mirrors omp's own
   `porting-from-pi-mono.md` §"Last Sync Point").

---

## 8. Phased implementation plan

Concrete, file-level. Each phase is independently verifiable.

**Phase 0 — Decisions (this doc).** Server=Node; drop E1–E6; defer O1; stub O2.

**Phase 1 — Constants + mechanical swap.**
- Add `packages/shared/src/omp-constants.ts`: `SCOPE="@oh-my-pi"`, `CLI="omp"`,
  `AGENT_DIR=~/.omp/agent`, `DASHBOARD_DIR=~/.omp/dashboard`, `SESSIONS_DIR`,
  manifest key `"omp"`, env names (`OMP_DASHBOARD_*`).
- Codemod: rewrite `@earendil-works/pi-*` & `@mariozechner/pi-*` → `@oh-my-pi/pi-*`
  across `package.json`s + imports; replace hardcoded `~/.pi/…` with constants.
- Verify: `bun run build` (typecheck) green.

**Phase 2 — Bridge extension.**
- `packages/extension/package.json`: `pi`→`omp` manifest; `.pi/skills`→`.omp/skills`
  (git-mv the dirs); peer deps → `@oh-my-pi/*`.
- `bridge.ts` / `pi-env.d.ts` / `command-handler.ts`: scope swap (mostly done by
  codemod); add `OMP_DASHBOARD_URL` env fallback.
- Verify: `vitest run packages/extension`.

**Phase 3 — Register + spawn.**
- `extension-register.ts` (V4): write `~/.omp/agent/settings.json#extensions`.
- Spawn path (V5): launch `omp`; keep tmux/headless logic.
- Verify: unit tests for register/spawn; assert the written path + argv.

**Phase 4 — Server launch (Node, no pi-jiti).**
- `bin/pi-dashboard.mjs` + shared `server-launcher.ts` (V6): resolve the server's
  own `jiti`; drop pi-jiti resolution. Rename PID/prefs dir to `~/.omp/dashboard`.
- O2 stub: guard the `resolveModule("pi-coding-agent")` callers so the empty result
  is a clean no-op (already fail-safe; make it intentional + silent).
- Verify: `pi-dashboard start` boots on Node; `/api/health` OK.

**Phase 5 — Client.**
- Branding pi→omp; hide onboarding "Setup credentials" (O1) + the update banner
  (E3) + plugin-mgmt panel (O2) behind their now-empty data.
- Verify: `vitest run packages/client`; `bun run build`.

**Phase 6 — Remove excess.**
- `git rm -r packages/electron`; remove Electron CI workflows; remove
  standalone/managed-install + version-check modules (E2/E3); drop
  `package-lock.json` regeneration from the flow.
- Verify: build + full vitest green with the deleted modules gone.

**Phase 7 — Live smoke (the real proof).**
- Start an `omp` session with the bridge installed; start `pi-dashboard`; confirm
  in the browser: session appears, chat mirrors live, a prompt round-trips, spawn
  works, diff/OpenSpec render. This is the acceptance gate.

**Maintenance — commit the codemod + document the merge loop (§7).**

---

## 9. Risks & open questions

| Risk | Mitigation |
|---|---|
| omp's extension `SessionManager.list()` shape drift (used by bridge `list_sessions` via dynamic import) | Runs inside omp/Bun where the SDK is present; verify field mapping in Phase 2. |
| `config.yml` is YAML; naive JSON register would corrupt it | Register into legacy `~/.omp/agent/settings.json#extensions` (omp still reads it) — avoids YAML writes entirely. |
| Two runtimes (Bun for omp, Node for server) | Matches today's deployment; documented as a prerequisite (Node ≥22.19 alongside omp). |
| `node-pty` postinstall / prebuild | Unchanged from upstream on Node; only a concern if server→Bun later. |
| High upstream churn in server core (sessions/OpenSpec) | We fork none of it; §7 keeps merges mechanical. |

## 10. What is verified vs proposed

- **Verified by reading code/docs:** upstream architecture; server SDK-decoupling
  and the two dynamic-`resolveModule` couplings + their fail-safe behavior; server
  dep set + Node/jiti launch; the omp contract table (§3) from `omp://` docs; the
  `oldschoola` diff statistics and its grab-bag/stale-base nature; the bridge's
  ~16-line change.
- **[PROPOSED] (to validate during implementation):** server-stays-on-Node with
  O2 stubbed avoiding all Bun-only exposure; the register-via-legacy-`settings.json`
  approach; the codemod-based merge loop; the exact drop list. Phase 7 is the
  end-to-end acceptance gate.
