# Merge Plan — `windows-integration` ← `origin/develop`

**Goal:** Produce a single branch that retains:
- Every permanent **Windows fix** on `windows-integration` (cli.ts, cmdStop, /api/restart, resolve-jiti, bridge server-launcher diagnostics).
- The **platform/** strategy-router architecture + lint-enforcement tests.
- The **ToolRegistry** module and its settings UI / REST endpoints.
- The **OS-aware path normalization** + session-grouping fixes.
- All **useful develop-side commits** (34 of them — landing page, marketing site, Vitest 4, batch ask_user, editor PID registry, tunnel CORS, barber-pole indicator, error-banner retry, pi-core version checker, node-pty fix, etc.).

**Non-goal:** Reproduce develop's inline `process.platform` branching, its `execSync("lsof …")` port discovery, its `sh -c` restart script, or its raw-path `tsLoader` return. Those are bugs we *explicitly replace*, not preserve.

**Strategy:** Take `windows-integration` as the base. Cherry-pick develop's 34 feature commits on top, reconciling conflicts file-by-file using this document. Before starting, fix two regressions so the base itself is clean.

---

## 0. Prerequisites (do these FIRST on `windows-integration`, before anything from develop)

### 0.1 Discard the preload-fastify-cjs work and replace with a preflight refuse-to-start

**Decision: the preload-fastify workaround is NOT shipping.** Rationale captured in BRANCH-COMPARISON.md §10. Summary: the preload only benefits users stuck on Node 22.0–22.17 / 24.1–24.2, which is a shrinking self-correcting audience fixable by `nvm install 22` in 2 minutes. The workaround costs a file + resolver + node-version-check module + 4 argv injection sites + a permanent Fastify-internals pin + an indefinite maintenance tail.

#### 0.1a Revert the uncommitted preload-fastify work

The working tree has ~640 lines of uncommitted Node 22.17/Fastify mitigation. All of it goes.

```bash
cd B:/Dev/BB/pi-agent-dashboard

# Revert the preload-related edits in every spawn site.
git checkout HEAD -- \
  packages/server/src/cli.ts \
  packages/server/src/restart-helper.ts \
  packages/server/src/routes/system-routes.ts \
  packages/server/src/__tests__/restart-helper.test.ts \
  packages/extension/src/server-launcher.ts \
  packages/extension/src/__tests__/server-launcher.test.ts \
  packages/electron/src/lib/server-lifecycle.ts \
  packages/shared/src/platform/detached-spawn.ts \
  packages/shared/src/__tests__/detached-spawn.test.ts \
  packages/shared/src/platform/index.ts \
  openspec/specs/bridge-extension/spec.md \
  openspec/specs/dashboard-server/spec.md \
  README.md package.json packages/server/package.json

# Delete the preload file + resolver + node-version-check + their tests.
rm -f \
  packages/server/preload-fastify.cjs \
  packages/server/src/__tests__/cli-daemon-argv.test.ts \
  packages/shared/src/platform/preload-fastify.ts \
  packages/shared/src/platform/node-version-check.ts \
  packages/shared/src/__tests__/platform-preload-fastify.test.ts \
  packages/shared/src/__tests__/platform-node-version-check.test.ts

# Delete the four misplaced openspec folders (dropped into archive/ without
# being real archives; they document a workaround we're not making).
rm -rf \
  openspec/changes/archive/2026-04-20-fix-bridge-autostart-diagnostics \
  openspec/changes/archive/2026-04-20-lazy-import-fastify-FAILED \
  openspec/changes/archive/2026-04-20-preload-fastify-cjs \
  openspec/changes/archive/2026-04-20-remove-cargo-cult-dynamic-imports

# Delete the ad-hoc commit-helper scripts.
rm -f scripts/commit-route-kill-paths.sh scripts/split-commits.sh
```

This returns the working tree to the last committed state at `0be288f`.

#### 0.1b Replace with a preflight refuse-to-start

Add a hard block in both foreground and daemon startup paths. ~40 lines total including tests. No workaround code, no Fastify pin, no resolver module.

**`packages/server/src/node-guard.ts`** (new):

```ts
/**
 * Pure predicate + message builder for nodejs/node#58515 affected versions.
 * Bug fires on v22.0–22.17 and v24.1–24.2. Fixed in v22.18+, v24.3+, v25.x.
 */
export function isAffectedNode(version: string): boolean {
  const m = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major === 22 && minor < 18) return true;
  if (major === 24 && minor < 3) return true;
  return false;
}

export function buildNodeUpgradeMessage(version: string): string {
  return [
    ``,
    `❌  pi-dashboard cannot start on Node ${version}.`,
    ``,
    `    This Node version has a bug that crashes Fastify at startup:`,
    `    https://github.com/nodejs/node/issues/58515`,
    ``,
    `    Fix: upgrade Node to ≥22.18.0 (LTS) or ≥24.3.0.`,
    `    Install:`,
    `      nvm:   nvm install 22 && nvm use 22`,
    `      brew:  brew upgrade node`,
    `      Win:   https://nodejs.org/ → current 22.x LTS installer`,
    ``,
  ].join("\n");
}
```

**`packages/server/src/cli.ts`** — add at the top of foreground `runForeground()` *and* at the top of `cmdStart()`:

```ts
import { isAffectedNode, buildNodeUpgradeMessage } from "./node-guard.js";

// Preflight: refuse to start on Node versions affected by nodejs/node#58515.
if (isAffectedNode(process.version)) {
  console.error(buildNodeUpgradeMessage(process.version));
  process.exit(1);
}
```

**`packages/server/package.json`** — add:

```json
{ "engines": { "node": ">=22.18.0" } }
```

Unit test (`__tests__/node-guard.test.ts`) covers boundaries: `22.17.999` true, `22.18.0` false, `24.2.999` true, `24.3.0` false, `25.0.0` false, malformed false.

**Commit:**

```bash
git add packages/server/src/node-guard.ts \
        packages/server/src/__tests__/node-guard.test.ts \
        packages/server/src/cli.ts \
        packages/server/package.json

git commit -m "feat(server): refuse to start on Node versions affected by nodejs/node#58515

Replaces the abandoned preload-fastify-cjs workaround. Simpler, no
Fastify internal pinning, better error UX.

Affected: Node v22.0–22.17, v24.1–24.2. Fixed in v22.18+ / v24.3+.
See BRANCH-COMPARISON.md §10 for full rationale."
```

#### 0.1c Breadcrumb in docs

Add one line to `docs/architecture.md` under "cross-platform server launch":

> Node versions v22.0–22.17 and v24.1–24.2 are blocked at startup via `node-guard.ts` due to [nodejs/node#58515](https://github.com/nodejs/node/issues/58515).

Do **not** re-create the four openspec change folders that were deleted in 0.1a — they documented a workaround we decided not to ship. BRANCH-COMPARISON.md §10 is the durable decision record.

### 0.2 Fix the `spawnDetached` regression

This is the one that overrode `d331850`. Minimal surface:

```ts
// packages/shared/src/platform/detached-spawn.ts
export interface SpawnDetachedOptions {
  // ...existing fields...
  /**
   * When true (default), set detached:true — the child is excluded from
   * the parent's libuv Job Object (Windows) or put in its own process
   * group (POSIX), so it survives parent death.
   *
   * When false, keep the child inside the parent's libuv Job on Windows
   * — no new console is allocated, so no flash. Use this for children
   * whose lifecycle is deliberately tied to the parent (pi sessions via
   * RPC stdin-EOF). See change: d331850.
   */
  detach?: boolean;
}

// inside spawnDetached()
detached: opts.detach ?? true,
```

And tighten the cmd.exe redirect gate so the shape invariant is actually checked:

```ts
const useWindowsRedirect =
  platform === "win32"
  && !!opts.logPath
  && stdinMode === "ignore";   // ← was missing; CREATE_NO_WINDOW requires all-ignore stdio
```

Then in `packages/server/src/process-manager.ts` `spawnHeadlessDetached`:

```ts
const r = await spawnDetached({
  cmd: bin,
  args: [...prefixArgs, ...args],
  cwd,
  env,
  logFd,
  stdinMode: "pipe",
  detach: false,     // ← restores d331850's no-flash behaviour
  // logPath intentionally omitted — with stdinMode:"pipe", the cmd.exe
  // redirect branch can't produce CREATE_NO_WINDOW, so there's no point
  // invoking it. stderr still goes to logFd.
});
```

Server auto-start in `packages/extension/src/server-launcher.ts` keeps the default `detach: true` — it must outlive the bridge.

Ship 0.1a, 0.1b, and 0.2 in **three separate commits** so the preload-fastify revert, the node-guard addition, and the flashing fix are independently revertable:

1. `chore(server): remove abandoned preload-fastify-cjs workaround` (0.1a — pure deletes + reverts)
2. `feat(server): refuse to start on Node versions affected by nodejs/node#58515` (0.1b — node-guard)
3. `fix(windows): restore d331850 no-flash pi-session spawn` (0.2 — detach:false)

### 0.3 Validate on Windows locally before merging anything from develop

- Start fresh: `pi-dashboard stop && pi-dashboard start`
- Verify no flash on `pi` session spawn (visually — spawn 3 sessions).
- Verify `~/.pi/dashboard/server.log` fills with startup and diagnostics.
- Verify `/api/restart` works (uses `spawnRestart` → no `sh`/`lsof`/`curl`).
- Verify `pi-dashboard stop` frees port 8888 even when the PID file is stale.

If any of the above fails, **do not proceed to Phase 1.** Fix first.

---

## 1. Merge strategy overview

```
┌─────────────────────────────────────────────────────────────────┐
│  BASE: windows-integration (post-0.1/0.2)                       │
│  HEAD: 0be288f + node-guard commit + detach-option commit       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │  cherry-pick 34 commits from origin/develop
                          │  (see §2 for order and categorization)
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Category A (no-conflict, direct drop-in): ~20 commits          │
│  Category B (trivial reconcile): ~9 commits                     │
│  Category C (manual merge needed): ~5 commits                   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Post-merge cleanup:                                            │
│  - Platform/ consolidation (18→13 files, see BRANCH-COMPARISON  │
│    §9.5) — OPTIONAL, can be a follow-up commit                  │
│  - Run full test suite (npm test) + manual Windows QA           │
│  - Update AGENTS.md / README / docs/architecture.md             │
└─────────────────────────────────────────────────────────────────┘
```

**Why cherry-pick, not merge:** `git merge origin/develop` would produce conflicts in ~15 files where both branches diverged heavily (cli.ts, server-launcher.ts, process-manager.ts, resolve-jiti.ts, electron/server-lifecycle.ts, system-routes.ts, directory-service.ts, and the 40 files unique to each side). Cherry-pick lets us handle each develop commit in isolation and explicitly skip or adapt the ones that would undo our Windows work.

---

## 2. Commit-by-commit plan for develop's 34 commits

Listed in chronological order (oldest first). Each entry has: **action** + **why**.

### Category A — drop in as-is (no conflict, pure additions or independent files)

| # | Commit | Action | Why |
|---|---|---|---|
| 1 | `ee838d0  feat(site): add public marketing site + GH Pages workflow` | **Pick** | Pure addition (`site/` tree, `.github/workflows/deploy-site.yml`). Zero overlap with our files. |
| 2 | `e95491b  feat(error-banner): collapse long errors, add Retry + Copy` | **Pick** | Client-only (`packages/client/src/components/ErrorBanner.tsx`). |
| 3 | `f2ec691  docs: add CHANGELOG.md, release process` | **Pick** | Adds `CHANGELOG.md`, `docs/release-process.md`. No overlap. |
| 4 | `97dd4bd  feat(server): persistent editor PID registry` | **Pick** | Touches `editor-manager.ts`. Our branch edits this file too — **check for conflict**, likely clean (we added platform imports; this adds PID registry). |
| 5 | `15da6a8  feat(site): download section, theme toggle` | **Pick** | Pure `site/` additions. |
| 6 | `c0bd183  feat(ui): inline SVG brand mark + barber-pole + pin-folder label` | **Pick** | Client-only. |
| 7 | `4143d49  fix(cors): allow tunnel origins` | **Pick** | Server — `routes/` or `server.ts`. Our branch didn't touch CORS; should be clean. |
| 8 | `a343efa  docs: CORS tunnel-origin allowlist + pre-compressed static` | **Pick** | Docs only. |
| 9 | `144301c  fix(qa): address critical issues from verification` | **Pick** | `qa/` folder — we use `qa/` too but edits are unlikely to overlap. |
| 10 | `89d3bf6  feat(client): landing-page onboarding` | **Pick** | Client-only (`LandingPage.tsx` is new). |
| 11 | `c004806  feat(openspec-card): state pill, Tasks popover` | **Pick** | Client-only. |
| 12 | `d192513  docs(site): link marketing site in README, add site scripts` | **Pick** (resolve README conflict — merge both sections) | |
| 13 | `889d71a  chore(openspec): archive add-marketing-site` | **Pick** | Moves the active change to archive. Clean if #1 was picked. |
| 14 | `7c5ff18  chore(openspec): archive 2 parallel changes` | **Pick** | Openspec archive moves. |
| 15 | `9510702  chore(openspec): archive cross-platform-qa-vms` | **Pick** | Openspec archive move. **Note:** This may conflict with our existing QA work — inspect carefully. |
| 16 | `852ccf8  chore(openspec): archive fix-portable-windows-package-manager` | **Pick** | Archive move. |
| 17 | `7a0e926  feat(ask-user): add batch method for multi-question dialogs` | **Pick** | Touches `ask-user-tool.ts` (we also touch it). **Resolve conflict** — merge the features. |
| 18 | `b2c7d90  chore(session-header): propagate image paste through onSendPrompt` | **Pick** | Client. |
| 19 | `cee0c58  feat(skills): add release-cut and release-revoke skills` | **Pick** | `.pi/skills/` additions. |
| 20 | `36bd96d  fix(ask-user): backfill outer title on explicit method=batch` | **Pick** | Depends on #17. Pick after. |

### Category B — trivial reconcile (mostly our-side preserved + their-side feature added)

| # | Commit | Action | Why |
|---|---|---|---|
| 21 | `f037530  docs(ask-user): spec scenario + changelog` | **Pick** | Spec file in `openspec/specs/ask-user-tool/spec.md` — we also edited this. Merge both scenarios. |
| 22 | `381dbfe  docs(changelog): consolidate Unreleased section` | **Pick** | CHANGELOG.md edit. Drop in. |
| 23 | `93e0bb8  ci: switch main branch trigger to develop` | **Pick** | `.github/workflows/publish.yml`. We also edit this — merge trigger + matrix carefully. |
| 24 | `ca9d76f  fix(ci): sync-release-version pushes to develop` | **Pick** | New workflow — clean. |
| 25 | `2e50ebe  ci(deploy-site): auto-enable GitHub Pages` | **Pick** | Workflow edit; depends on #1. |
| 26 | `2ef37c6  harden ask_user argument validation` | **Pick** | Adds validation to `ask-user-tool.ts`. Reconcile with #17. |
| 27 | `8737249  fix(server): make node-pty permissions hoist-aware, stop swallowing errors` | **Pick — CAREFUL** | Touches `scripts/fix-pty-permissions.cjs` + handler files. We may have edited those for ToolRegistry. Inspect hunk-by-hunk. |
| 28 | `2ef37c6  harden ask_user argument validation` | (same as 26, duplicate — ignore) | |
| 29 | `cf3ab84  feat: add pi core version checker and update UI` | **Pick** | New server endpoint + client component. May touch routes index — reconcile. |

### Category C — MANUAL MERGE required (overlap with our Windows work)

| # | Commit | Action | Guidance |
|---|---|---|---|
| 30 | `9af9dd8  fix(server): resolve TypeScript errors in tests and route imports` | **Inspect** | Likely addresses develop's own TS errors. Check whether the fixes still apply on our tree. If the TS errors are develop-specific (caused by develop's ad-hoc spawn code), **skip this commit entirely** — our code doesn't have the errors. |
| 31 | `a4cced2  test: migrate from vitest.workspace.ts to root vitest.config.ts (Vitest 4)` | **Pick — FOUNDATIONAL** | This is Vitest 4 migration. Every `packages/*/vitest.config.ts` changes. Our `platform/` test files stay unchanged. Expect conflicts in root `vitest.config.ts` (new file) and deletion of `vitest.workspace.ts`. |
| 32 | `e368d27  fix(pi-core): broadcast pi_core_update_complete` | **Pick** | Depends on #29. Clean hunk. |
| 33 | `a45e9d0  feat(path-picker): server-side filter, smarter Enter, new-folder` | **Pick** | Client + server `browse.ts`. We edited `browse.ts` for paths — **reconcile path-normalization with new filter logic**. |
| 34 | `8ca4538  fix(tunnel): eliminate zrok reservation leaks + shrink client bundle` | **Pick** | Touches `tunnel.ts` (we may have touched it for ToolResolver). Reconcile. |

---

## 3. File-level conflict resolution guide

When cherry-picking hits a conflict, resolve each file per this table. **Always prefer `windows-integration`'s version for the OS-abstraction layer; prefer `origin/develop`'s version for feature logic.**

### 3.1 `packages/server/src/cli.ts`

**Keep `windows-integration` entirely.** Every develop-side hunk here is a Windows regression (see BRANCH-COMPARISON §2.1):

- `process.env.HOME ?? "~"` → `os.homedir()` ✅ keep our version
- `logFd = openSync(logPath, "w")` → `"a"` ✅ keep our version
- `tsLoader` raw path → `file://` URL via `resolveJitiImport()` ✅ keep our version
- `findPortHolders` via `lsof` → `platformFindPortHolders` ✅ keep our version
- `killProcess` inline `process.kill` → `platformKillProcess` ✅ keep our version

If develop adds a new feature (e.g., a new subcommand, a new flag), **port that feature on top of our cli.ts** — don't let develop's version overwrite our fixes.

### 3.2 `packages/extension/src/server-launcher.ts`

**Keep `windows-integration` entirely.** Develop's 80-LOC version has no log capture and no positive-probe readiness check — strictly worse (see BRANCH-COMPARISON §2.4). If develop adds feature to this file (it doesn't in the 34 commits), port it on top of ours.

### 3.3 `packages/server/src/process-manager.ts`

**Keep `windows-integration`** (with 0.2's `detach: false` fix applied). Develop's `spawnHeadlessWindows` (109–190) is replaced by our `spawnHeadlessDetached`. Never resurrect develop's inline `execSync("lsof …")` or `process.platform === "win32"` branches.

### 3.4 `packages/shared/src/resolve-jiti.ts`

**Keep `windows-integration`.** Return type is `file://` URL, not raw path. Every caller expects a URL; reverting to develop's raw-path return breaks Windows (see BRANCH-COMPARISON §2.6).

### 3.5 `packages/server/src/routes/system-routes.ts` + `packages/server/src/restart-helper.ts`

**Keep `windows-integration`** (with preload preservation from 0.1). The `/api/restart` implementation must stay on `spawnRestart` (pure Node, no sh/lsof/curl). If develop's commits add a *feature* to system-routes (tunnel teardown on restart, for instance, which `8ca4538` may touch), port that feature on top of our restart-helper-based implementation.

### 3.6 `packages/electron/src/lib/server-lifecycle.ts`

**Keep `windows-integration`** (uses `ToolResolver` + `isDashboardRunning` + `resolveJitiFromAnchor`). Develop's version has inline resolution with `where`/`which` + `curl`-for-health — broken on Windows.

### 3.7 `packages/server/src/editor-manager.ts`

**Merge.** Develop's `97dd4bd` adds the editor PID registry for orphan cleanup. Our version has ToolResolver-based `code-server` detection. Both needed. Order of operations on conflict:

1. Keep our imports (`ToolResolver`, `platformKillProcess`).
2. Add develop's PID registry read/write.
3. In the cleanup path, use `platformKillProcess(pid)` instead of develop's `process.kill(pid, "SIGTERM")`.

### 3.8 `packages/server/src/browse.ts`

**Merge.** Our edits add path normalization (`normalizePath` + multi-drive invariant). Develop's `a45e9d0` adds server-side filter + new-folder creation. Both layers co-exist:

1. Normalize incoming path first (our code).
2. Then apply develop's filter / listing logic.
3. When creating a new folder, use our `normalizePath` to canonicalize the target before `mkdirSync`.

### 3.9 `packages/shared/src/openspec-poller.ts`

**Merge.** Our edits route `openspec` CLI calls through `platform/openspec.ts` Recipe. Develop may have edited the test file. Keep our Recipe-based implementation; adapt tests if develop changed test structure.

### 3.10 `packages/extension/src/ask-user-tool.ts`

**Merge.** Develop's `7a0e926` (batch method) + `36bd96d` (title backfill) + `2ef37c6` (validation hardening) are all feature additions. Our edits are the extension registration plumbing. Apply develop's ask-user features on top of our registration code.

### 3.11 `packages/server/src/tunnel.ts`

**Merge.** Develop's `8ca4538` fixes zrok reservation leaks + adds compression. Our edits route zrok binary lookup through ToolResolver. Keep our binary-lookup code; apply develop's lifecycle + compression fixes on top.

### 3.12 Tests under `packages/*/vitest.config.ts`

Once `a4cced2` lands (Vitest 4 root config), every sub-package's `vitest.config.ts` may simplify or delete. Our `packages/shared/vitest.config.ts` already exists — harmonize with the new root config structure rather than running parallel systems.

### 3.13 `packages/server/src/server.ts` / `server-bootstrap.ts`

Develop's commits (editor PID registry boot cleanup, pi-core version checker) likely add initialization calls. Both are additive — insert the new init steps into our existing bootstrap sequence.

### 3.14 AGENTS.md / README.md / docs/architecture.md

**Merge both directions.** Develop adds sections about CHANGELOG, release process, marketing site, CORS. Our edits add sections about platform/, ToolRegistry, Windows spawn invariants, preload-fastify. Final doc should have **all** sections. No deletions from either side.

---

## 4. Recommended execution sequence

### Phase 0 — Preparation (on `windows-integration`)

```bash
# 0.1a: Revert the uncommitted preload-fastify work. See §0.1a for the
# exact git checkout / rm invocations.
# Commit: "chore(server): remove abandoned preload-fastify-cjs workaround"

# 0.1b: Add packages/server/src/node-guard.ts + cli.ts guard + engines.node
# + test. See §0.1b for the code.
# Commit: "feat(server): refuse to start on Node versions affected by
#           nodejs/node#58515"

# 0.2: The spawnDetached regression fix.
#  - Edit platform/detached-spawn.ts: add detach?: boolean option, tighten gate
#  - Edit process-manager.ts: pass detach: false + drop logPath for pi spawn
#  - Add a regression test in platform/__tests__/detached-spawn.test.ts
#  - Commit: "fix(windows): restore d331850 no-flash pi-session spawn"

# 0.3: Manual Windows validation. Do not proceed if any fails.

# Tag the base for easy rollback:
git tag -a pre-develop-merge -m "windows-integration, all regressions fixed"
```

### Phase 1 — Cherry-pick Category A (20 commits)

```bash
git fetch origin develop
# Cherry-pick in order — the list from §2 Category A
for sha in ee838d0 e95491b f2ec691 97dd4bd 15da6a8 c0bd183 4143d49 a343efa \
          144301c 89d3bf6 c004806 d192513 889d71a 7c5ff18 9510702 852ccf8 \
          7a0e926 b2c7d90 cee0c58 36bd96d; do
  git cherry-pick --signoff $sha || {
    echo "Conflict on $sha — see §3 of MERGE-PLAN.md"
    break
  }
done
```

Run tests after every 5 picks. Push to a PR branch for backup.

### Phase 2 — Cherry-pick Category B (9 commits)

```bash
for sha in f037530 381dbfe 93e0bb8 ca9d76f 2e50ebe 2ef37c6 8737249 cf3ab84; do
  git cherry-pick --signoff $sha || {
    echo "Conflict on $sha — see §3 of MERGE-PLAN.md"
    break
  }
done
```

### Phase 3 — Manual merges (Category C, 5 commits)

Do one at a time. After each:

```bash
git cherry-pick --signoff <sha>
# Resolve conflicts using §3 guide
npm test
npm run build
# Manual Windows smoke test
git cherry-pick --continue
```

Specific order (respecting dependencies):

1. `a4cced2` (Vitest 4) — **foundational**, do first in this phase
2. `9af9dd8` (TS errors in tests/routes) — **likely skip**; evaluate after Vitest 4 lands
3. `a45e9d0` (path-picker + browse.ts) — reconcile path normalization
4. `8ca4538` (tunnel leaks) — reconcile ToolResolver
5. `e368d27` (pi_core broadcast) — depends on cf3ab84 from Phase 2

### Phase 4 — Post-merge cleanup

```bash
# 4.1 Platform/ consolidation (OPTIONAL but recommended — see BRANCH-COMPARISON §9.5)
# 18 → 13 files, pure moves:
#   - merge subprocess-adapter.ts → exec.ts
#   - merge process-scan.ts + process-identify.ts → process.ts
#   - merge commands.ts + shell.ts → os-commands.ts
#   - move node-version-check.ts + preload-fastify.ts → shared/src/node-compat/
git commit -m "refactor(platform): consolidate file boundaries (18→13 files, zero behaviour change)"

# 4.2 Update docs (post-merge sweep)
# - AGENTS.md: merge both branches' sections
# - README.md: merge both branches' sections
# - docs/architecture.md: same
git commit -m "docs: reconcile AGENTS/README/architecture after develop merge"

# 4.3 Full test suite
npm test
npm run build
cd packages/electron && npm run build
```

### Phase 5 — Validation gates

**Must pass before merging to `develop` or releasing:**

- [ ] Full `npm test` green on Windows, macOS, Linux (CI matrix)
- [ ] `npm run build` green on all three
- [ ] Electron build green on all three
- [ ] Manual Windows smoke test:
  - [ ] No cmd.exe flash on pi session spawn (×3)
  - [ ] `~/.pi/dashboard/server.log` populated on startup
  - [ ] `pi-dashboard stop` frees both ports after crash
  - [ ] `/api/restart` works from the UI
  - [ ] Zrok tunnel + QR works
  - [ ] Editor (code-server) spawns with iframe
- [ ] Manual macOS smoke test (landing page, session spawn, terminal)
- [ ] `no-direct-child-process`, `no-direct-process-kill`, `no-direct-platform-branch` lint tests all green

### Phase 6 — PR / release

- Open PR `windows-integration` → `develop`
- PR description links to this document
- After review, **squash-merge is NOT recommended** — preserve the cherry-pick commits so the commit history shows which develop commits were incorporated
- Tag release after merge (follow `release-cut` skill from develop)

---

## 5. Risk register

| Risk | Mitigation |
|---|---|
| Cherry-pick order dependency (e.g., `36bd96d` depends on `7a0e926`) | §2 lists correct order; never jump ahead. |
| Vitest 4 migration (`a4cced2`) breaks existing tests | Do it in isolation as the first commit of Phase 3. Validate all our platform/ tests still pass before moving on. |
| Editor PID registry (`97dd4bd`) clashes with ToolResolver seam | See §3.7. Accept that both layers co-exist; write a reconciliation commit if needed. |
| `9af9dd8` fixes TS errors that don't exist on our tree | Evaluate case-by-case. Skipping is a valid action — cherry-pick is not a moral obligation. |
| Someone on another session commits to `develop` during the merge | Rebase Phase 1/2/3 picks onto the new `origin/develop` before Phase 4. Use `git rerere` for conflict memory. |
| Uncommitted preload-fastify work is "lost" via 0.1a revert | **Intentional.** See BRANCH-COMPARISON §10. If someone argues it should be preserved, check `git reflog` — the code is recoverable. The decision record is in the comparison doc. |
| Platform/ consolidation (Phase 4.1) breaks something | It's optional — skip if under time pressure. Can be a follow-up PR. |
| Tests start flaking on Windows after merge | Isolate per-commit: `git bisect` between `pre-develop-merge` tag and current HEAD. |

---

## 6. Explicit non-goals (do NOT do these)

- ❌ `git merge origin/develop` — will produce unresolvable conflicts in 15+ files.
- ❌ Accept develop's inline `process.platform` branches as "simpler." They are bugs (BRANCH-COMPARISON §2).
- ❌ Revert to develop's `resolve-jiti.ts` raw-path return. It breaks Windows.
- ❌ Drop `platform/` in favour of scattered branching. The lint-enforcement tests exist for a reason.
- ❌ Consolidate `platform/` files **during** the merge. Do it before (never) or after (optional). Mixing refactor with merge turns every conflict into a guess.
- ❌ **Resurrect the preload-fastify-cjs workaround.** Rejected in BRANCH-COMPARISON §10; replaced by `node-guard.ts` in §0.1b. Do not re-add `preload-fastify.cjs`, `platform/preload-fastify.ts`, `platform/node-version-check.ts`, or the four argv `--require` injection sites.
- ❌ Leave OpenSpec changes misplaced under `openspec/changes/archive/` without archiving them correctly.

---

## 7. Acceptance criteria

The merge is **done** when:

1. `windows-integration` HEAD contains all 34 `origin/develop` commits' **user-visible behaviour** (either directly cherry-picked or ported on top).
2. Every file listed in §3 reflects the "keep windows-integration" or "merge" decision.
3. Phase 5 gates all pass.
4. The two regressions identified in BRANCH-COMPARISON §5 are fixed:
   - Windows pi-session spawn has **no console flash**.
   - Bridge auto-start failure message does **not** append the Node-bug hint for EADDRINUSE / explicit exits.
5. `packages/shared/src/platform/` architecture survives intact, with all three lint-enforcement tests green.
6. CHANGELOG.md has entries for both the windows-integration work and the merged develop features.

---

## 8. TL;DR

> **Take `windows-integration` as the base.** Fix the two regressions there first (one-line `detach: false` + one-line gate tightening). Cherry-pick develop's 34 commits on top, keeping `windows-integration`'s version of every file under `packages/server/src/cli.ts`, `packages/extension/src/server-launcher.ts`, `packages/server/src/process-manager.ts`, `packages/shared/src/resolve-jiti.ts`, `packages/server/src/routes/system-routes.ts`, `packages/electron/src/lib/server-lifecycle.ts`, and the entire `packages/shared/src/platform/` + `tool-registry/` modules. Reconcile (not replace) in the ~10 files where both branches added features to the same surface (editor-manager, browse, tunnel, ask-user-tool, server.ts, openspec-poller). Optionally run the platform/ consolidation pass after. Validate on Windows and macOS before merging to `develop`.
