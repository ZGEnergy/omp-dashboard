# Branch Comparison — `windows-integration` vs `origin/develop`

**Generated:** 2026-04-20
**Compared:** `0be288f` (local `develop` = pushed `origin/windows-integration`) vs `a4cced2` (`origin/develop`)
**Scope:** 478 files changed, +29,083 / −15,660 lines

---

## TL;DR

| Dimension | `windows-integration` (`0be288f`) | `origin/develop` (`a4cced2`) | Verdict |
|---|---|---|---|
| Windows support | Deep, consolidated, well-tested | **Broken in multiple places** | windows-integration wins |
| Architecture | Strategy-router (`platform/` module boundary + lint enforcement) | Ad-hoc inline `process.platform` branches | **windows-integration is the correct pattern** — not "over-engineered," *abstracted*. Develop is un-abstracted, which is what produced the 4 Windows bugs below. |
| Pi-session spawn flashing | **REGRESSION** — `5ab7956` overwrote `d331850`'s `detached:false` fix | Still has `d331850` (`detached:false`) → no flash | develop preserves the original fix; windows-integration reverted it |
| Bridge auto-start diagnostics | Rich (log, probes, Node-bug hint) but buggy | Minimal (2 s crash window, no log) | Neither is great |
| Node 22.17 Fastify mitigation | **Rejected** (preload-fastify-cjs WIP to be discarded per MERGE-PLAN §0.1a) → replaced by preflight refuse-to-start (§0.1b) | Not addressed | Neither branch will ship the workaround. Fix is `nvm install 22`. |
| Client UX features | Older | Landing page, barber-pole, SVG brand, error-banner retry, batch ask_user | develop wins |
| Marketing / release tooling | None | Full marketing site, CHANGELOG.md, release skills | develop wins |
| Test runner | Vitest 3 + workspace.ts | **Vitest 4 + root vitest.config.ts** | develop wins |
| Tunnel / CORS | Basic | Leak-fixed, tunnel-origin allowlist, compression | develop wins |
| Editor lifecycle | Basic | PID registry + orphan cleanup | develop wins |

**Bottom line:** *Neither branch is a clean superset of the other.* windows-integration has the **correct platform-strategy architecture** with two localized bugs inside strategy implementations; develop is a feature-rich mainline with un-abstracted OS branching that is broken on Windows in 4 independent places. A merge is required — and the merge should take windows-integration's architecture as the base.

---

## 1. Structural Divergence

### 1.1 Modules that exist ONLY on `windows-integration` (40 files deleted on develop's side)

```
packages/shared/src/platform/
├── commands.ts              openBrowser, isVirtualMachine
├── detached-spawn.ts        spawnDetached, waitForNoCrash, waitForReady + cmd.exe /d /s /c trick
├── exec.ts                  wraps spawn/execSync/exec/execFile with windowsHide:true default
├── git.ts                   typed git ops via Recipe runner
├── index.ts                 barrel
├── npm.ts                   npm.rootGlobal etc.
├── openspec.ts              openspec CLI ops
├── paths.ts                 normalizePath, samePath, parsePathInput
├── process-identify.ts      findPidByMarker, isProcessLikePi, isPiCommandLine
├── process-scan.ts          isProcessRunning, parseEtime
├── process.ts               findPortHolders, killProcess, killPidWithGroup (Windows taskkill /F /T)
├── runner.ts                Recipe engine
├── shell.ts                 detectShell, getTerminalEnvHints
├── spawn-mechanism.ts       selectMechanism: tmux / wt / wsl-tmux / headless
└── subprocess-adapter.ts

packages/shared/src/tool-registry/
├── definitions.ts           strategy chains per tool
├── index.ts
├── overrides.ts             ~/.pi/dashboard/tool-overrides.json
├── registry.ts              ToolRegistry class
├── strategies.ts            overrideStrategy, managedBinStrategy, bareImportStrategy, whereStrategy...
└── types.ts
```

Plus tests: `__tests__/platform-*.test.ts` ×13, `tool-registry-*.test.ts` ×3, `no-direct-*.test.ts` ×3 (lint-style tests enforcing no `child_process` / `process.kill` / `process.platform` branches outside platform/).

### 1.2 Modules that exist ONLY on `origin/develop`

- `packages/shared/src/managed-paths.ts`
- `packages/shared/src/source-matching.ts` (moved from recommended-extensions?)
- **Entire `site/` tree** — marketing site (Astro + Tailwind, 70+ files, GH-Pages deploy)
- `.github/workflows/deploy-site.yml` + `sync-release-version.yml`
- `.pi/skills/release-cut` + `release-revoke`
- `CHANGELOG.md`, `docs/release-process.md`
- 11 additional archived OpenSpec changes (`2026-04-19-*` and `2026-04-20-*`)

### 1.3 OpenSpec archive delta

| Archived only on `windows-integration` | Archived only on `develop` |
|---|---|
| `2026-04-18-fix-windows-server-parity` | `2026-04-19-add-release-notes` |
| `2026-04-18-platform-command-executor` | `2026-04-19-fix-node-pty-permissions-and-handler-errors` |
| `2026-04-19-consolidate-tool-resolution` | `2026-04-19-harden-ask-user-arg-validation` |
| `2026-04-19-consolidate-windows-spawn-and-platform-handlers` | `2026-04-19-pi-core-version-checker` |
| `2026-04-20-route-kill-paths-through-platform` | `2026-04-19-polish-header-logo-and-card-stripes` |
| *(active, unarchived):* `consolidate-platform-handlers` | `2026-04-20-add-editor-pid-registry` |
| *(active, unarchived):* `platform-path-normalization` | `2026-04-20-add-landing-page-onboarding` |
| | `2026-04-20-add-marketing-site` |
| | `2026-04-20-ask-user-batch-questions` |
| | `2026-04-20-dashboard-openspec-card-state-and-actions` |
| | `2026-04-20-improve-path-picker` |

---

## 2. Windows Behaviour — File-by-File

### 2.1 `packages/server/src/cli.ts — cmdStart`

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| Home dir | `os.homedir()` ✅ | `process.env.HOME ?? "~"` ❌ (undefined on Windows → literal `~` path) |
| Log open mode | `"a"` — appends, preserves prior runs ✅ | `"w"` — **truncates on every start** ❌ |
| `tsLoader` type | `file://` URL via `pathToFileURL` ✅ | Raw absolute path ❌ (Node ≥ 20 on Windows rejects `C:\…` as bad URL scheme) |
| Timestamped header | Yes (`\n[ISO] pi-dashboard start (pid …)`) | No |
| Node-version preflight warning | Yes (via `buildNodeVersionWarning`) — **uncommitted** | No |
| `--require preload-fastify.cjs` | Yes — **uncommitted** | No |
| Spawn primitive | `spawnDetached` with `logPath` (cmd.exe redirect path) | `spawn()` from `node:child_process` |
| Spawn stdio | `["ignore","ignore","ignore"]` (via cmd.exe /d /s /c) | `["ignore", logFd, logFd]` |
| Uses `.cmd` shim? | Never (ToolResolver pre-resolves to node.exe + cli.js) | Relies on `#!/usr/bin/env node --import tsx` shebang (Linux/Mac only) |
| Flash on Windows? | No (stdio=ignore×3 → `CREATE_NO_WINDOW`) | No (detached:false inherits parent console) |

**Develop is broken on Windows in 3 independent ways (HOME, loader URL, shebang).** windows-integration fixed all three.

### 2.2 `packages/server/src/cli.ts — cmdStop`

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| Port-holder discovery | `platformFindPortHolders` — netstat on Windows, lsof on Unix ✅ | `lsof -t -i :${port}` via `execSync` only ❌ (Windows returns `[]`) |
| Kill primitive | `platformKillProcess` — `taskkill /F /T /PID` on Windows, SIGTERM→SIGKILL on Unix ✅ | Inline `process.kill(pid, "SIGTERM")` / `SIGKILL` ❌ (won't reach child tree on Windows) |

Stale-port cleanup (the "zombie :8888 holder" defence that *should* have kicked in during the regression) is a **no-op on Windows in develop**.

### 2.3 `packages/server/src/routes/system-routes.ts — /api/restart`

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| Orchestrator | `spawnRestart()` → `node -e "<script>"` child using only `net` + `http` ✅ | `spawn("sh", ["-c", <script with lsof+curl>])` ❌ |
| Works on Windows | Yes | **No** — no sh, no lsof, no curl |
| Preserves `--require` preload | Yes (uncommitted) | N/A |

### 2.4 `packages/extension/src/server-launcher.ts` (bridge auto-start)

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| LOC | ~200 | ~80 |
| Readiness detection | 15-s positive health probe (`isDashboardRunning`) ✅ | 2-s "did it exit?" negative check ❌ |
| Crash log | `~/.pi/dashboard/server.log`, append mode, timestamped header ✅ | **None** — `stdio: "ignore"` drops stderr ❌ |
| Node-bug hint | Unconditional (on Node 22.17) — **regression**, misleading for EADDRINUSE | None |
| Preload preservation | Yes (uncommitted) | No |
| Detached + windowsHide | detached:true + cmd.exe redirect (all ignore) | detached:true + stdio:"ignore" |
| Flashes on Windows? | No | No |

**Regression #2 (Node-bug hint shown for EADDRINUSE) lives only on windows-integration.** Develop has no hint at all, but also no log — so a user hitting the Fastify crash on Node 22.17 would see *no* diagnostic on develop.

### 2.5 `packages/server/src/process-manager.ts — pi-session spawn`

The headline regression.

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| Windows branch entrypoint | `spawnHeadlessDetached` (unified via `spawnDetached`) | `spawnHeadlessWindows` (Windows-specific function) |
| `detached` | `true` | **`false`** |
| `stdio` | `["pipe","ignore","ignore"]` → via cmd.exe `["pipe","ignore","ignore"]` → NOT the no-flash shape | `["pipe","ignore","pipe"]` direct on node.exe |
| `shell` | Never (refuses `.cmd`, requires pre-resolved node.exe+cli.js) | `true` only for `.cmd` (quotes args) |
| `windowsHide` | `true` | `true` |
| Log capture | Per-session log via cmd.exe `>>` redirection | stderr pipe, last 4 KB kept in memory |
| Crash window | 300 ms via `waitForNoCrash` | 1500 ms via inline race |
| **Console flashes?** | **YES** — cmd.exe wrapper + stdin pipe kills `CREATE_NO_WINDOW` | **No** — detached:false + windowsHide:true + no cmd.exe wrapper |
| Pi durability across server restart | "pi dies with server" (stdin EOF) | "pi dies with server" (detached:false → killed on parent exit) |

**Root cause of Regression #1 is visible in a single conditional:**

```ts
// detached-spawn.ts (windows-integration)
const useWindowsRedirect = platform === "win32" && !!opts.logPath;
// process-manager.ts passes logPath, so this is TRUE
// → cmd.exe spawned with stdio=["pipe","ignore","ignore"]
// → libuv won't set CREATE_NO_WINDOW because stdin is a pipe
// → only SW_HIDE applied → brief flash
```

Develop simply avoids cmd.exe entirely when the pi command is `node.exe + cli.js` (pre-resolved). No wrapper, no flash concern.

### 2.6 `packages/shared/src/resolve-jiti.ts`

| Aspect | `windows-integration` | `develop` |
|---|---|---|
| Return type | `file://` URL (via `pathToFileURL`) | Raw absolute path |
| Windows compat for `node --import` | ✅ | ❌ `ERR_UNSUPPORTED_ESM_URL_SCHEME` |
| `buildJitiRegisterUrl(pkgJson)` pure helper | Exported for tests | Not present |
| `resolveJitiFromAnchor(anchor)` for Electron | Exported | Not present (duplicated inline in electron/server-lifecycle.ts) |

### 2.7 Binary resolution

| `windows-integration` | `develop` |
|---|---|
| `ToolRegistry` singleton with ordered strategy chain per tool (override → bare-import → managed → npm-global → where) | Simpler `tool-resolver.ts` (~200 LOC) with inline strategies |
| Per-resolution diagnostic trail, in-memory cache | No trail |
| `~/.pi/dashboard/tool-overrides.json` overrides | None |
| Settings → General → Tools UI with status/source/rescan | None |
| REST endpoints `/api/tools*` + diagnostics export | None |
| `PATHEXT` aware for `.cmd` shims | Less robust |

### 2.8 Kill-path consolidation

windows-integration has a **repo-level lint** (`no-direct-process-kill.test.ts`, `no-direct-child-process.test.ts`, `no-direct-platform-branch.test.ts`) enforcing that only `packages/shared/src/platform/` touches `child_process` / `process.kill` / `process.platform === "win32"`. Develop has no such enforcement — every file importing `child_process` does it directly, producing the inconsistencies above.

---

## 3. Features ONLY on `origin/develop`

These are all missing on `windows-integration`:

### Client / UX
- **Landing page onboarding** (3-step status cards) — `LandingPage.tsx`
- **Barber-pole working indicator** + inline SVG brand mark + pin-folder label
- **Error-banner** collapse + Retry + Copy actions
- **Ask-user `method: "batch"`** for multi-question dialogs (+ title backfill fix)
- **PathPicker** — server-side filter, smarter Enter, new-folder creation
- **OpenSpec card** — state pill, Tasks popover, Archive-anyway overflow
- **SessionHeader** image paste propagation through `onSendPrompt`

### Server
- **Persistent editor PID registry** with boot-time orphan cleanup (`97dd4bd`)
- **Tunnel / zrok reservation leak fix** + CORS allowlist for tunnel origins + pre-compressed static serving (`8ca4538`, `4143d49`)
- **node-pty permissions hoist-aware** + handler error surfacing (`8737249`)
- **Pi core version checker** — `/api/pi-core/*` + header badge + broadcast on update (`cf3ab84`, `e368d27`)

### Test infra
- **Vitest 4** migration: `vitest.workspace.ts` (deprecated) → root `vitest.config.ts`
- Fixes for TypeScript errors in tests and route imports (`9af9dd8`)

### Release / distribution
- **`CHANGELOG.md`** + release-derived GitHub body (`f2ec691`)
- **Marketing site** (Astro) + GH Pages workflow
- **`release-cut` and `release-revoke` skills**
- **Sync-release-version** workflow (pushes to develop, not main)

### CI
- `ci: switch main branch trigger to develop`
- `ci(deploy-site): auto-enable GitHub Pages via configure-pages enablement`

---

## 4. Features / work ONLY on `windows-integration` (beyond Windows support)

- **Consolidated platform/ primitives** (see §1.1) — not just Windows, but a genuine OS-abstraction layer
- **ToolRegistry** with override UI + REST endpoints + diagnostic export
- **OS-aware path normalization** (`samePath`, `parsePathInput`) — fixes session-grouping across separator/case/trailing-slash drift (multi-drive invariant for Windows)
- **Cross-platform QA VMs** (Packer templates for Ubuntu + Windows + macOS, `qa/Makefile`, `qa/scripts/`, `qa/tests/`) — `9510702` on develop is the archive, but QA is present in both trees; windows-integration may have more recent iterations
- **Uncommitted: preload-fastify-cjs + node-version-check + 4 OpenSpec change folders** (see previous uncommitted-changes audit)

---

## 5. Regression Verdict for the User's Two Bugs

### Regression 1 — Windows cmd flashing on pi session spawn

**Corrected timeline:** the user fixed this THREE times and `5ab7956` silently reverted two of them.

| Date | Commit | Status on windows-integration | Status on develop |
|---|---|---|---|
| Apr 13 | `5d59d13` — spawn `node.exe` directly | **Reverted** by `5ab7956` | Still present |
| Apr 13 | `d331850` — `detached:false` on Windows | **Reverted** by `5ab7956` | Still present |
| Apr 18 | `1239201` — fix other `.cmd` call sites | Present | Present |

`5ab7956` ("consolidate Windows spawn and platform handlers") centralised every detached-spawn site onto one primitive that **hard-codes `detached:true` on every platform**. For server auto-start that's correct (must outlive launcher). For pi-session spawn it overrode `d331850`, because `detached:true` on Windows allocates a new console unless `CREATE_NO_WINDOW` is set, which requires all-ignore stdio — incompatible with RPC-mode's required `stdin:"pipe"`.

The **uncommitted working-tree diff** attempts to retrofit a `cmd.exe /d /s /c` redirect that would set `CREATE_NO_WINDOW`, but it leaves `stdio[0]=pipe`, which is exactly the case where libuv refuses to set that flag. Net result: still flashing.

**Correct fix:** add a `detach?: boolean` option to `spawnDetached` (default `true`), and pass `detach: false` from `spawnHeadlessDetached` — restoring `d331850` without touching the cmd.exe path. Server auto-start keeps `detach: true`.

- **Root cause of regression:** `5ab7956` — Apr 19 — your own refactor.
- **Not present on `develop`** because `5ab7956` lives only on `windows-integration`.
- **Not fixed by the uncommitted work** — the retrofit is broken by design (stdin pipe negates `CREATE_NO_WINDOW`).

### Regression 2 — "Server failed to become ready within 15s" + Node-bug hint

- **Present on:** `windows-integration` (uncommitted `preload-fastify-cjs` work introduced the unconditional Node hint; auto-start race is present in both)
- **Absent on:** `develop` — no Node hint, no preload, and a much simpler 2-s crash gate. Develop's bridge-launcher also has **no log file at all**, so while there's no misleading message, there's also no diagnostic for the real Fastify crash bug.

**Resolution:** per MERGE-PLAN.md §0.1, the uncommitted preload-fastify work (which introduced the misleading unconditional hint) is being **discarded**, not landed. The developer has upgraded Node to 22.22.2 and the replacement is a preflight refuse-to-start in `packages/server/src/node-guard.ts` that runs *before* any server setup — no timeout, no ambiguous hint, just a clear error message directing users to upgrade Node. Both the timeout-regression *and* its causal code are removed simultaneously.

---

## 6. What a Merge Would Need to Reconcile

### Easy (mostly no conflict)
- `site/` — pure addition, drop straight in
- `CHANGELOG.md`, `docs/release-process.md`
- `.pi/skills/release-*` — pure addition
- Vitest 4 config migration — global replacement
- Client UX changes (LandingPage, barber-pole, batch ask_user, etc.) — mostly new files
- Tunnel CORS + leak fix — contained in tunnel.ts
- Editor PID registry — contained in editor-manager.ts

### Hard conflicts
- **`packages/server/src/cli.ts`** — every section of `cmdStart` / `cmdStop` / restart differs
- **`packages/server/src/process-manager.ts`** — entirely different spawn strategies
- **`packages/extension/src/server-launcher.ts`** — structurally different (80 vs 200 LOC, different readiness model)
- **`packages/shared/src/resolve-jiti.ts`** — return type changed (path vs URL); every caller on develop would need updating
- **`packages/electron/src/lib/server-lifecycle.ts`** — ToolResolver vs inline resolution
- **Any file importing `node:child_process`** — develop does, windows-integration's lint forbids it outside `platform/`

### Philosophical conflicts
| Decision | windows-integration says | develop says |
|---|---|---|
| Where does OS branching live? | Only in `platform/` | Wherever it's needed |
| How to resolve binaries? | Single ToolRegistry | Inline per-call |
| Error diagnostics? | Rich logs + probes | Minimal, trust the happy path |
| Windows pi-spawn lifecycle? | detached:true + pipe stdin | detached:false |
| tsLoader type? | file:// URL | raw path |

---

## 7. Recommendation

**The strategy-router architecture on `windows-integration` is correct and should stay.** It's the standard pattern for serious cross-platform Node projects (esbuild, Prisma, pnpm, Electron), it's enforced via lint tests (`no-direct-child-process`, `no-direct-platform-branch`, `no-direct-process-kill`), and it's the only reason future Windows regressions get caught automatically. Develop's inline-branching approach produced 4 Windows bugs precisely because it has no abstraction to enforce.

The two bugs on windows-integration are **localized to strategy implementations**, not caused by the abstraction:

| Bug | File | Fix size |
|---|---|---|
| `detached:true` baked as universal invariant (overrode user's `d331850` fix) | `platform/detached-spawn.ts` | Add `detach?: boolean` option, default `true`; pi-session spawn passes `false` |
| `useWindowsRedirect` heuristic doesn't check the real precondition (all-ignore stdio) | `platform/detached-spawn.ts` | Add `&& stdinMode === "ignore"` to the gate |

**Cherry-pick, don't merge.** A full `merge origin/develop` will produce 15+ non-trivial conflicts in the server/extension hot path, and resolving each will require a judgement call that's not auto-mergeable.

Suggested order:

1. **Rebase windows-integration onto a clean `origin/develop`** using `rebase --onto` with an empty range for the Windows platform/ work, so the platform/ and tool-registry modules land as *new* files on top of develop. Almost all develop features will survive intact.
2. **Resolve the handful of files that both branches edit** (`cli.ts`, `server-launcher.ts`, `process-manager.ts`, `resolve-jiti.ts`, `electron/server-lifecycle.ts`, `routes/system-routes.ts`, `directory-service.ts`) — keeping windows-integration's Windows-correct versions but porting any develop-side feature added in those files (e.g., tunnel teardown in `/api/restart`, editor PID init in server bootstrap).
3. **Before merging, fix Regression #1**: in `packages/shared/src/platform/detached-spawn.ts`, change
   ```ts
   const useWindowsRedirect = platform === "win32" && !!opts.logPath;
   ```
   to
   ```ts
   const useWindowsRedirect =
     platform === "win32" && !!opts.logPath && stdinMode !== "pipe";
   ```
   and have the `stdinMode === "pipe"` branch fall through to direct node.exe + `windowsHide:true` + `logFd` inheritance (develop's proven approach) — best of both worlds.
4. **Before merging, fix Regression #2 (b)**: in `server-launcher.ts`, make the Node hint conditional. Either tail the log for an `ERR_INTERNAL_ASSERTION` / ajv-compiler signature, or only append when `readyError === "timeout"` (never when `child exited with code N` — an explicit exit is never the Node-loader bug).
5. **Optional**: commit the preload-fastify-cjs work properly (right now it's loose in the working tree and misleadingly placed under `openspec/changes/archive/2026-04-20-*/`). It's a net-positive change and should not be lost.

---

## 8. Commit-Level Context

### 20 commits in `windows-integration` not in `origin/develop`
Representative (oldest → newest):

```
6716a4f  fix: cross-platform server launch, restart, and stale-port cleanup on Windows
ce1576d  test: fix cross-platform assumptions in test fixtures (Windows parity)
170408a  docs: document cross-platform server launch, restart, and log hygiene
cf84058  docs: archive fix-windows-server-parity change and sync main specs
d0adac2  docs: add consolidate-platform-handlers openspec proposal
f7cfe82  refactor: moved platform primitives into shared/src/platform/ module
a97514e  refactor: migrate electron binary lookup to shared ToolResolver
1239201  fix: suppress cmd.exe console flash when spawning .cmd files on Windows
059dfe0  refactor: centralize subprocess execution behind platform/exec + runner
bb05398  fix: resolve windows binaries via PATHEXT to skip bash shims
4bfb77b  fix: resolve windows binaries via PATHEXT and spawn .cmd with shell:true
ca978d4  refactor: centralize tool resolution behind ToolRegistry with diagnostic trail and per-tool overrides
f04a173  feat: add OS-aware path normalization via platform/paths and migrate session-grouping + pin/unpin callers
5ab7956  refactor: consolidate Windows spawn and platform handlers into detached-spawn, spawn-mechanism, process-identify primitives  ← introduces Regression #1
2257b08  docs: refine fix-fork-entryid-timing proposal
39acb1e  fix: route all process termination through platform/process helpers (Windows tree-kill parity)
455ced4  refactor: use ToolResolver and isDashboardRunning in Electron doctor/detector
b4f712a  test: add process.kill-ban lint and platform-routing kill-path tests
a4f9860  docs: document platform-routed kill paths in AGENTS and architecture
0be288f  docs: archive route-kill-paths-through-platform change and sync main specs
```

### 34 commits in `origin/develop` not in `windows-integration`
See §3. Summary: 0 Windows-platform commits, all feature / UX / release / site / test-infra work.

---

## 9. Audit of `packages/shared/src/platform/` — File Boundaries

User question: *"Why is platform/ separated into a million files?"*

Short answer: **18 files, 2,887 LOC — most are fine, four are commit-history artifacts that should be consolidated.** The *architecture* (strategy-router + lint enforcement) is correct; the *file boundaries* drifted because each OpenSpec change added new files rather than editing existing ones (to keep diffs narrow in review).

### 9.1 Inventory by responsibility

| Group | Files | LOC | Assessment |
|---|---|---|---|
| **Exec / subprocess** | `exec.ts` (218), `subprocess-adapter.ts` (124), `detached-spawn.ts` (345) | 687 | `exec.ts` + `detached-spawn.ts` are correct. `subprocess-adapter.ts` **duplicates `exec.ts`'s claim** to be "the single spawn boundary." |
| **Process control** | `process.ts` (168), `process-scan.ts` (94), `process-identify.ts` (126) | 388 | Three files for one concern (OS processes). Split is commit-history-driven — three different changes each added one file. Should be one `process.ts`. |
| **Resolver / discovery** | `binary-lookup.ts` (301), `spawn-mechanism.ts` (124) | 425 | Both correct and cohesive. |
| **Recipe engine** | `runner.ts` (369), `git.ts` (155), `openspec.ts` (91), `npm.ts` (162) | 777 | Correct. One file per external tool is a clean taxonomy. |
| **Paths** | `paths.ts` (276) | 276 | Correct. Multi-drive Windows invariant + POSIX path normalization justify a dedicated file. |
| **Misc OS commands** | `commands.ts` (100), `shell.ts` (44) | 144 | Two grab-bags of OS helpers. `commands.ts` has 2 functions; `shell.ts` has 2 functions. Natural merge into one `os-commands.ts`. |
| **Node-specific (misplaced)** | `node-version-check.ts` (94), `preload-fastify.ts` (79) | 173 | **Do not belong in `platform/`.** Neither branches on `process.platform`; both are about Node runtime quirks (`nodejs/node#58515`). Should move to `shared/src/` or `shared/src/node-compat/`. |
| **Barrel** | `index.ts` | 17 | Fine. |

### 9.2 The `subprocess-adapter.ts` / `exec.ts` duplication

Both files' docstrings self-describe as the sole spawn boundary:

- `exec.ts`: *"the only module that imports `node:child_process`"* — enforced by `no-direct-child-process.test.ts`.
- `subprocess-adapter.ts`: *"the single point of entry for spawning any subprocess"*.

In practice `subprocess-adapter.ts` is a thin DI wrapper around `exec.ts` for exactly one caller (`package-manager-wrapper.ts` — the pi `DefaultPackageManager` subclass). It either should (a) be inlined into that caller as a 30-line adapter, or (b) replace `exec.ts` as the actual boundary. As-is, two layers claim the same job and the docstrings contradict each other.

### 9.3 The three `process-*.ts` files

Origins traced by commit:

| File | Added in | Purpose |
|---|---|---|
| `process.ts` | `39acb1e` (route-kill-paths-through-platform) | `findPortHolders`, `killProcess`, `killPidWithGroup` |
| `process-scan.ts` | `5ab7956` (consolidate-windows-spawn-and-platform-handlers) | `isProcessRunning`, `parseEtime` |
| `process-identify.ts` | `5ab7956` | `findPidByMarker`, `isProcessLikePi`, `isPiCommandLine` |

All three operate on OS processes; nothing fundamental distinguishes them. Merging into a single 388-LOC `process.ts` with three comment-delimited sections would not reduce cohesion or violate the strategy pattern.

### 9.4 `node-version-check.ts` and `preload-fastify.ts` are being deleted

Both files were added as part of the **uncommitted** `preload-fastify-cjs` work. They landed under `platform/` because that's where "platform-ish helpers" live, but neither actually branches on `process.platform` — they address a **Node runtime bug** (`nodejs/node#58515`), not a cross-OS concern.

**Resolution:** both files are being **deleted** per MERGE-PLAN §0.1a, not moved. The preflight refuse-to-start in `packages/server/src/node-guard.ts` (§0.1b) replaces them with ~20 lines in the server package itself. The debate over whether they belonged in `platform/` or `node-compat/` is moot once the code is gone.

### 9.5 Proposed consolidation

Zero behaviour change, clearer file structure, same LOC:

```
packages/shared/src/platform/
├── exec.ts                 ← merge subprocess-adapter.ts into this (or inline subprocess-adapter into package-manager-wrapper)
├── detached-spawn.ts
├── process.ts              ← merge process-scan.ts + process-identify.ts into this
├── binary-lookup.ts
├── spawn-mechanism.ts
├── runner.ts
├── git.ts
├── openspec.ts
├── npm.ts
├── paths.ts
├── os-commands.ts          ← merge commands.ts + shell.ts into this
└── index.ts

packages/shared/src/node-compat/   ← new folder
├── node-version-check.ts  ← moved out of platform/
└── preload-fastify.ts     ← moved out of platform/
```

**18 files → 11 files + 2 relocated** = 13 files total. Same LOC. Same behaviour. Same test coverage. Pure move + merge, one commit.

### 9.6 Why it happened this way

Looking at git archeology:

- `6716a4f` (fix-windows-server-parity) — first introduced `platform/` as concept
- `f7cfe82` — moved primitives into `shared/src/platform/`
- `059dfe0` (platform-command-executor) — added `platform/exec.ts`, `platform/runner.ts`, `platform/git.ts`, `platform/openspec.ts`, `platform/npm.ts`
- `ca978d4` (consolidate-tool-resolution) — added `tool-registry/` (separate module) + `platform/binary-lookup.ts`
- `f04a173` (platform-path-normalization) — added `platform/paths.ts`
- `5ab7956` (consolidate-windows-spawn-and-platform-handlers) — added `platform/detached-spawn.ts`, `platform/spawn-mechanism.ts`, `platform/process-identify.ts`, `platform/process-scan.ts`, `platform/subprocess-adapter.ts`
- `39acb1e` (route-kill-paths-through-platform) — added `platform/process.ts`
- *(uncommitted)* preload-fastify-cjs — added `platform/node-version-check.ts`, `platform/preload-fastify.ts`

Each OpenSpec change added new files instead of editing existing ones. This is **normal and correct OpenSpec hygiene** (narrow diffs, independent review) but it accumulates without someone doing a consolidation pass at the end. That pass is still owed.

### 9.7 Honest summary

> The `platform/` module is **not** "separated into a million files." It's separated into 18 files, of which:
> - **11 are well-sized single-responsibility primitives** (the core of the strategy-router pattern);
> - **4 are commit-history artifacts** that should consolidate (3 process-* files → 1; subprocess-adapter → merge with exec); 
> - **2 are misplaced** (`node-version-check.ts` and `preload-fastify.ts` are not OS-abstractions and should move to `shared/`);
> - **1 is the barrel** (`index.ts`).
>
> The architecture is correct. The file count is a maintenance backlog, not a design flaw. A single consolidation commit (≈200 lines of moves) gets the tree to 13 files with no behaviour change.

---

## 10. Preload-Fastify-CJS Decision: Rejected

### 10.1 Question

Should we ship a CJS preload (`packages/server/preload-fastify.cjs` + `platform/preload-fastify.ts` + `platform/node-version-check.ts` + 4 argv injection sites) to shield users from the `ERR_INTERNAL_ASSERTION: Unexpected module status 3` crash caused by [nodejs/node#58515](https://github.com/nodejs/node/issues/58515) on Node v22.0–22.17 and v24.1–24.2?

### 10.2 Answer

**No.** Replace it with a preflight refuse-to-start in `packages/server/src/node-guard.ts`.

### 10.3 Why the preload is rejected

1. **It only benefits users who can't or won't upgrade Node.** The bug is fixed in Node v22.18+ / v24.3+ / v25.x — shipped Sep 2024. As of 2026-04, the affected population is people on Windows who installed Node manually from nodejs.org ~18 months ago and haven't updated. That population is shrinking, self-correcting, and fixable by `nvm install 22` in 2 minutes.

2. **The workaround pins to Fastify internals.** The preload hard-codes `require("fastify")` + `require("@fastify/ajv-compiler")` + `require("@fastify/ajv-compiler/standalone")`. If Fastify 5 or 6 adds another CJS-heavy internal module, the preload silently stops closing the race. No test fails when this happens. A future Fastify upgrade regresses the fix with zero signal.

3. **The silent `try/catch` in the preload hides resolution failures.** If resolution breaks, the server starts without the preload and hits the *exact crash the preload was meant to prevent* — the comment in the code claims "will fail elsewhere with a clearer message," but that's false for this specific bug.

4. **Four spawn sites must all inject `--require`.** No structural enforcement. A fifth spawn site added later without the injection — no failure at build/test time, only on affected Node in production.

5. **No deprecation plan.** The workaround becomes permanent code paying maintenance costs for a Node bug that's already fixed upstream.

### 10.4 Why the preflight refuse-to-start wins

| | Preload workaround | Preflight refuse-to-start |
|---|---|---|
| Files added | 3 (`.cjs` + 2 `.ts`) | 1 (`node-guard.ts`) |
| Call sites that must know about it | 4 (spawn argv injectors) | 1 (startup guard) |
| Tests required | Resolver unit + path-resolution unit + smoke test on Node 22.17 in CI | 1 boundary test (`isAffectedNode`) |
| Fastify coupling | Hard-pins `fastify` + `@fastify/ajv-compiler*` | None |
| Maintenance forever | Yes (Fastify deps, 4 spawn sites, resolver layouts) | No |
| User sees when broken | Cryptic `ERR_INTERNAL_ASSERTION` | `❌ pi-dashboard cannot start on Node v22.17.1. Upgrade to ≥22.18.` |
| Lines of code | ~350 (with tests) | ~40 (with tests) |
| Reversibility if approach changes | Delete many things | Delete one file |

The preflight is **strictly simpler, strictly better UX when it fires, and free of permanent maintenance cost.**

### 10.5 When would the preload be the right call?

Only if *all* of these were true:

- Enterprise/regulated users locked to specific Node versions by policy (pharma, finance, government).
- Upgrading Node requires a multi-week compliance review.
- Losing those users to a startup error would materially harm the product.

pi-dashboard fits none of these. Users who install it are developers comfortable running `nvm install 22`.

### 10.6 Concrete action

See MERGE-PLAN.md §0.1a (revert preload work) and §0.1b (add `node-guard.ts`). The four misplaced openspec change folders (`2026-04-20-fix-bridge-autostart-diagnostics`, `2026-04-20-lazy-import-fastify-FAILED`, `2026-04-20-preload-fastify-cjs`, `2026-04-20-remove-cargo-cult-dynamic-imports`) are deleted along with the code — they documented a workaround we're not making.

One durable breadcrumb: a line in `docs/architecture.md` under "cross-platform server launch":

> Node versions v22.0–22.17 and v24.1–24.2 are blocked at startup via `node-guard.ts` due to [nodejs/node#58515](https://github.com/nodejs/node/issues/58515).

That's the only permanent memory of this bug in the repo.

---

## 11. Verdict Sentence

> `origin/develop` is a **cleaner mainline** with substantial user-visible improvements but is **fundamentally broken on Windows** at the server lifecycle layer (cmdStart, cmdStop, /api/restart, resolve-jiti). `windows-integration` has the **correct strategy-router architecture** (not over-engineered — standard for cross-platform Node projects, with lint enforcement most projects skip) but suffers from two localized bugs in `detached-spawn.ts` strategy implementations that reverted prior flashing fixes, plus a maintenance-backlog of 4 commit-history-driven file splits under `platform/`. **Merge by taking windows-integration's platform architecture as the base, cherry-picking develop's feature commits on top, fixing the two `detached-spawn.ts` bugs (≤5 LOC), and running a one-commit platform/ consolidation pass (18→13 files, zero behaviour change)** — don't just `git merge`.
