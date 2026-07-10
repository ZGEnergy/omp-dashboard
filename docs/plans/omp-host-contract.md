# OMP Host Contract (live, Phase 0)

**Date:** 2026-07-10  
**Source of truth host:** live install on this machine (`omp` 16.3.15)  
**oldschoola:** topic checklist only (`/tmp/omp-dashboard-research/omp-agent-dashboard`)  
**Accept rule:** profile + small adapters fit budget — proceed. Do **not** absorb 256-file spray renames.

---

## 1. CLI

| Item | Value |
|---|---|
| Binary name | `omp` |
| Resolved path | `~/.bun/bin/omp` → `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js` |
| Form | Bun-shebang JS (`#!/usr/bin/env bun`); **not** a native binary. Node-script strategy still valid (`dist/cli.js`). |
| Package export | `"bin": { "omp": "dist/cli.js" }` on `@oh-my-pi/pi-coding-agent@16.3.15` |
| Modes | text (default), `json`, `rpc`, `rpc-ui` (`--mode`) |
| Version string | `omp/16.3.15` |

**Executor implication:** keep node-script / package-strategy chain; point package scopes + CLI name at OMP. `managedBinStrategy("omp")` / `whereStrategy("omp")` still useful as PATH fallbacks.

---

## 2. Packages / scopes

Live global install under `~/.bun/install/global/node_modules/@oh-my-pi/`:

| Package | Role |
|---|---|
| `@oh-my-pi/pi-coding-agent` | CLI + agent runtime |
| `@oh-my-pi/pi-ai` | models + **AuthStorage** |
| `@oh-my-pi/pi-tui` | TUI |
| `@oh-my-pi/pi-agent-core` | agent core |
| `@oh-my-pi/pi-utils` / `pi-wire` / `pi-catalog` / … | support |

**Not required:** `@earendil-works/*` or `@mariozechner/*` for OMP path.

No `package.json#omp` / `#pi` key on the coding-agent package itself (keys absent). Plugin packages use **`omp` manifest field preferred, `pi` fallback** (verified in dist strings / types: `.omp ?? .pi`).

---

## 3. Homes & paths

| Logical path | Live path |
|---|---|
| Agent root | `~/.omp` |
| Agent dir | `~/.omp/agent` |
| Settings | `~/.omp/agent/settings.json` |
| Runtime config | `~/.omp/agent/config.yml` (YAML roles/models; not settings.json) |
| Sessions default | `~/.omp/agent/sessions` (project-encoded subdirs e.g. `-repos/`) |
| Auth primary | `~/.omp/agent/agent.db` (SQLite) |
| Auth legacy | `~/.omp/agent/auth.json` — **absent** on this host |
| Extensions (user files) | `~/.omp/agent/extensions/` |
| Dashboard config | `~/.omp/dashboard/` (`config.json`, `server.log`, `server.pid`, tokens, …) |
| Managed install (dashboard) | **`~/.omp-dashboard`** (convention from oldschoola + hub design; not yet created on this host) |
| Project-local root | `<cwd>/.omp` (skills at `.omp/skills`; settings/extensions under project `.omp`) |
| Plugins root | expressed as `getPluginsDir()` → `~/.omp/plugins` (or under profile/`rootSubdir("plugins")`); **dir absent until first install** |
| Plugin lock | `omp-plugins.lock.json` under plugins dir |
| Logs | `~/.omp/logs/` |

**Env still honored by OMP (subset, verified symbols):**

- `PI_CODING_AGENT_DIR` — agent dir override (sessions live under this + `/sessions`)
- `PI_CODING_AGENT_SESSION_DIR` — session root override (implied by dashboard precedence; OMP still exposes agent-dir env)
- `PI_*` large set retained for runtime knobs
- `OMP_*` for broker, plugins, profiles (`OMP_AUTH_BROKER_*`, `OMP_PLUGIN_ROOT`, `OMP_PROFILE`, `OMP_WORKTREE_DIR`, …)

Dashboard bridge currently injects `PI_DASHBOARD_URL` in `~/.omp/agent/.env` (OMP still reads that env name).

**Dashboard path implication:** hubs must resolve:

- managed → `~/.omp-dashboard`
- settings → `~/.omp/agent/settings.json`
- config → `~/.omp/dashboard`
- sessions fallback → `~/.omp/agent/sessions`
- project-local → `<cwd>/.omp`

---

## 4. Settings schema (user agent)

Live `~/.omp/agent/settings.json` (and bak) use:

- `extensions: string[]` — file entry points
- `packages: string[]` — package/extension paths
- `dashboardPluginBridges` / `_dashboardManagedPackages` — dashboard-managed bookkeeping (dashboard write surface)

`config.yml` holds model roles / theme / setup (not package lists).

Downstream: prefer reading `extensions` + `packages` as today; path to settings file changes via host profile.

---

## 5. Auth

| Item | Live contract |
|---|---|
| Primary store | SQLite `~/.omp/agent/agent.db` |
| Tables (observed) | `auth_credentials`, `auth_credential_blocks`, `auth_schema_version`, plus usage/cache/settings |
| `auth_credentials` cols | `id, provider, credential_type, data, disabled_cause, identity_key, created_at, updated_at` |
| Credential types observed | `api_key` (`{"key","source?"}`), `oauth` (`access/refresh/...` + optional identity) |
| Public API in OMP | `@oh-my-pi/pi-ai` → `AuthStorage`, `SqliteAuthCredentialStore`; coding-agent re-exports `discoverAuthStorage(agentDir)` |
| Default for session | `discoverAuthStorage()` → local SQLite at `<agentDir>/agent.db` |
| Optional remote | auth-broker via `OMP_AUTH_BROKER_URL` / `OMP_AUTH_BROKER_TOKEN` |
| Legacy `auth.json` | only under `~/.pi/agent/auth.json` on this host; OMP docs/types treat sqlite as default |

**Adapter implication: REQUIRED.** Upstream dashboard `provider-auth-storage.ts` is pure `auth.json`. Must reimplement read/write/status against sqlite (same public surface) or call OMP `AuthStorage` if loadable without dragging bun-only deps into node server.

**Risk note:** `@oh-my-pi/pi-ai` AuthStorage types import `bun:sqlite`. Dashboard server is Node/vitest. Prefer **direct sqlite I/O** (Node `node:sqlite` DatabaseSync or better-sqlite3 if already dep) matching `auth_credentials` schema + lock discipline, not forcing bun runtime for the server.

---

## 6. Plugins / package manager

| Item | Live contract |
|---|---|
| Upstream pi `DefaultPackageManager` | **Gone** from OMP (no symbol in dist) |
| OMP surface | `PluginManager` + `installPlugin` / `uninstallPlugin` / `listPlugins` / `linkPlugin` under `@oh-my-pi/pi-coding-agent/extensibility/plugins` |
| Storage | plugins dir: `package.json` deps + `node_modules` + `omp-plugins.lock.json` |
| Installer | bun-oriented (strings + oldschoola checklist: `bun install`/`uninstall`/`update` in plugins cwd) |
| Manifest | package.json **`omp` first, `pi` fallback** |
| Project overrides | `.omp/plugin-overrides.json` (per types) |
| Marketplace | separate path; out of core session smoke unless packages UI needs it |

**Adapter implication: REQUIRED** for packages UI / install routes. Keep the **existing public methods** of `PackageManagerWrapper` (`listInstalled`, install/remove/update/move, progress events) but replace DefaultPackageManager internals with OMP plugins-dir + bun (or call PluginManager if loadable under node).

Core session loop (spawn/attach/stream) may work **without** full package-manager UI if extensions are already path-linked in settings — still implement adapter in Phase 4 so packages routes do not crash.

---

## 7. Extension / bridge wiring

- Settings `extensions[]` / `packages[]` can point at absolute bridge entry files (current host points at main/minimal dashboard checkouts — infra already works with path entries).
- Discovery also pulls enabled plugins under plugins `node_modules` and project/user settings.
- Manifest dual-read: `pkg.omp ?? pkg.pi`.

Bridge register should prefer host `manifestKey = "omp"` with `pi` fallback.

---

## 8. Env / dashboard injection

| Concern | Recommendation for this fork |
|---|---|
| Sessions/agent dir overrides | Keep reading `PI_CODING_AGENT_*` (OMP still uses them); optional alias later |
| Dashboard attach URL | Currently `PI_DASHBOARD_URL` works under OMP; accept `OMP_DASHBOARD_*` + fall back `PI_DASHBOARD_*` if cheap |
| Managed bin PATH | `~/.omp-dashboard/node_modules/.bin` |

---

## 9. Host profile constants (locked for Phases 1–3)

```ts
{
  agentRootName: ".omp",
  agentDirName: "agent",
  dashboardConfigDirName: "dashboard",
  managedInstallDirName: ".omp-dashboard",
  projectLocalRootName: ".omp",
  cliBinaryName: "omp",
  codingAgentPackageScopes: ["@oh-my-pi/pi-coding-agent"],
  // aliases for AI/TUI/agent-core packages follow same @oh-my-pi/* scope
  packageKeywords: ["oh-my-pi", "omp"], // refine if packaging needs more
  manifestKey: "omp",
  envPrefix: "OMP",
  // session/agent env names remain PI_* for OMP compatibility
}
```

Registry tool key remains `"pi"` as facade; strategies resolve `omp` / `@oh-my-pi/*` underneath.

---

## 10. Phase 4 gate decisions

| Area | Decision |
|---|---|
| Paths / CLI / packages scopes / peers | profile only (Phases 1–3) |
| Auth | **Implement adapter** (sqlite primary, optional auth.json fallback empty) |
| Package manager | **Implement adapter** (plugins dir + bun; no DefaultPackageManager) |
| Electron/UI rebrand | deferred |
| Dual pi+OMP runtime | non-goal |

---

## 11. oldschoola checklist used (topics, not patches)

- Path renames: `.omp`, `.omp-dashboard`, project `.omp`
- Scope/`omp` CLI / manifest `omp`
- `provider-auth-storage` → agent.db
- `package-manager-wrapper` → `~/.omp/plugins` + bun
- bridge-register manifest dual-read

Excess ignored: UI/CSS/Electron marketing renames, incomplete string renames.

---

## 12. Open unknowns (non-blocking)

1. Whether Node can load `@oh-my-pi/pi-ai` AuthStorage without bun (lean to raw SQL).
2. Exact plugins dir when `OMP_PROFILE` / multi-profile is active (`rootSubdir("plugins")` — profile path may nest). v1 uses default unprofiled `~/.omp/plugins`.
3. Whether jiti still ships under `@oh-my-pi/pi-coding-agent` the same way — probe at Phase 3 when wiring JITI_PACKAGES.

These do **not** block Phase 1–2.
