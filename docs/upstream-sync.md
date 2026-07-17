# Upstream sync (ZGEnergy fork)

This repo is a fork of [`BlackBeltTechnology/pi-agent-dashboard`](https://github.com/BlackBeltTechnology/pi-agent-dashboard).
We track upstream **`develop`** while shipping ZGE-only product on protected **`main`**.

## Source of truth

| Branch | Role |
|--------|------|
| `main` | Default, **protected**, gated by **`zge-gates`**. Production promote target. |
| `upstream/develop` | BlackBelt integration branch we merge from. |
| `sync/upstream-develop` | **Stable** sync branch (force-updated). Only **one** open sync PR is kept; older ones are closed as superseded. |

## Intent policy (prefer upstream)

When ZGE and BlackBelt implement the **same product intent** (e.g. ChatViewMenu horizontal flip, popover viewport math, generic UI fixes), **take upstream**. Let BlackBelt maintain that surface; do not keep a parallel ZGE implementation that will re-conflict forever.

ZGE keeps ownership only of **ZGE-only product** and **wire-up hubs**:

| Class | Examples | Conflict default |
|-------|----------|------------------|
| **Protected (ours)** | `deploy/**`, Web Push, OMP config routes, `omp-agent-paths`, input-needed tools, sync tooling | `--ours` |
| **Semantic hub (manual)** | `server.ts`, `bridge.ts`, `config.ts`, root + workspace `package.json` / lockfile | combine both sides |
| **Same-intent product (theirs)** | client components/hooks/tests/AGENTS, non-protected server features, docs | `--theirs` |

Auto-resolve runs in `scripts/upstream-sync.sh merge` via `scripts/lib/upstream-sync-policy.sh`.

## Commands

```bash
# remotes: origin = ZGEnergy/omp-dashboard, upstream = BlackBeltTechnology/pi-agent-dashboard
scripts/upstream-sync.sh status
scripts/upstream-sync.sh merge          # branch + merge; policy auto-resolve
scripts/upstream-sync.sh verify         # Gate 0 structure + focused vitest + build
scripts/upstream-sync.sh pr             # force-with-lease push + upsert **one** PR; close older sync PRs
```

Env knobs:

| Var | Effect |
|-----|--------|
| `UPSTREAM_REF` | upstream branch (default `develop`) |
| `TARGET_BRANCH` | integration branch (default `main`) |
| `SYNC_BRANCH` | override sync branch (default `sync/upstream-<ref>`) |
| `DRY_RUN=1` | print actions only for merge/pr |
| `SKIP_BUILD=1` | verify skips `npm run build` |
| `SYNC_ADOPT_UPSTREAM=1` | do **not** auto `--ours` on protected paths |
| `SYNC_KEEP_OURS=1` | do **not** auto `--theirs` on product paths (debug / emergency) |

Weekly automation: [`.github/workflows/upstream-sync.yml`](../.github/workflows/upstream-sync.yml) — always leaves **at most one** open `upstream-sync` PR (latest).  
ZGE CI gates: [`.github/workflows/ci-zge.yml`](../.github/workflows/ci-zge.yml) — required **`zge-gates`** runs shared full unit suite + ZGE focus + build; advisory job runs full monorepo `npm test` until that suite is green.

## Protected paths (ZGE wins on conflict)

- `deploy/**` — self-host installer, systemd, zrok
- `packages/server/src/push/**`, `routes/push-routes.ts` — Web Push
- `packages/server/src/routes/omp-config-routes.ts` — OMP settings mirror
- `packages/shared/src/omp-agent-paths.ts`, `input-needed-tools.ts` (+ their tests)
- `docs/upstream-sync.md`, `scripts/upstream-sync.sh`, `scripts/lib/upstream-sync-policy.sh`, `.github/workflows/ci-zge.yml`, `upstream-sync.yml`

## Semantic hubs (manual combine)

Shared registration / config surfaces need **both** sides:

- `packages/server/src/server.ts`
- `packages/extension/src/bridge.ts`
- `packages/shared/src/config.ts`
- root `package.json` / `package-lock.json`
- workspace `packages/*/package.json`

Keep OMP/push call sites **and** upstream features. Prefer upstream implementation for non-ZGE symbols when intent overlaps.

## Gates

0. **Structural** — deploy/, push/, omp-agent-paths, install.sh still points at `ZGEnergy/omp-dashboard`
1. **Unit** (Node ≥ 22.18, prefer 22.22) — full vitest for `packages/shared`, `server` (excludes flaky faux-session integration), `client`, `roles-plugin`, `extension`. In CI / `VERIFY_STRICT=1`, missing vitest or required packages **fail** (no false-green skip).
2. **Build** — `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm run build`
3. **Runtime smoke** (manual/validation host) — health + vapid with push enabled; omp session spawn
4. **Prod promote** — explicit only (`~/.omp-dashboard` checkout + systemd); never from the Action

Branch protection: **0 approvals** + required status **`zge-gates`** (strict). Do not land red.

## Broken-CI recovery

1. Do **not** merge. Keep the single `sync/upstream*` head.
2. Reproduce: `scripts/upstream-sync.sh verify` with Node 22.22 after `npm ci`.
3. Classify pre-existing on `main` vs introduced by the merge; fix on the sync branch.
4. Re-`pr` (re-verifies) and wait for `zge-gates` SUCCESS.

## Conflict playbook

1. Run `merge`. Protected → `--ours`; same-intent product → `--theirs`; hubs left unmerged.
2. Read `docs/upstream-sync-conflicts-*.md` for remaining manual paths.
3. For each hub: open both stages, combine imports/registrations; for product paths already auto-theirs, do **not** re-introduce ZGE forks of the same intent.
4. If a ZGE-only behavior was incorrectly taken as theirs, restore it on the sync branch with a follow-up commit (and consider adding the path to `PROTECTED_PATHS` if it is truly ZGE-owned).
5. `git commit` to finish the merge if needed → `verify` → `pr`.
6. Land via protected-main (**0 approvals** + **`zge-gates`** green).

### Decision tree (agents)

```
conflict path
├── protected?     → --ours
├── semantic hub?  → manual combine (both sides)
└── else           → --theirs  (prefer upstream maintenance)
```

Same-intent signals (take theirs even if ZGE landed first):

- Parallel fix for the same bug/feature (e.g. horizontal popover clip #313 vs #329)
- Shared client hooks/components with no ZGE-only deps
- Upstream tests covering the same contract

Keep-ours signals (must stay protected or manual):

- Web Push / VAPID / SW
- OMP agent paths, settings mirror, spawn env
- deploy/installer/systemd/zrok
- sync tooling itself

## Installer default ref

`deploy/install.sh` uses `OMP_DASH_REF` default **`main`**. Override for experiments:

```bash
OMP_DASH_REF=main bash deploy/install.sh
```
