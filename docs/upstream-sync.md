# Upstream sync (ZGEnergy fork)

This repo is a fork of [`BlackBeltTechnology/pi-agent-dashboard`](https://github.com/BlackBeltTechnology/pi-agent-dashboard).
We track upstream **`develop`** while shipping ZGE-only product on protected **`main`**.

## Source of truth

| Branch | Role |
|--------|------|
| `main` | Default, **protected**, gated by **`zge-gates`**. Production promote target. |
| `upstream/develop` | BlackBelt integration branch we merge from. |
| `sync/upstream-develop` | **Stable** sync branch (force-updated). Only **one** open sync PR is kept; older ones are closed as superseded. |

## Commands

```bash
# remotes: origin = ZGEnergy/omp-dashboard, upstream = BlackBeltTechnology/pi-agent-dashboard
scripts/upstream-sync.sh status
scripts/upstream-sync.sh merge          # branch + merge; auto --ours on protected paths
scripts/upstream-sync.sh verify         # Gate 0 structure + focused vitest + build
scripts/upstream-sync.sh pr             # force-with-lease push + upsert **one** PR; close older sync PRs
```

Env knobs: `UPSTREAM_REF`, `TARGET_BRANCH`, `SYNC_BRANCH`, `DRY_RUN=1`, `SKIP_BUILD=1`, `SYNC_ADOPT_UPSTREAM=1`.

Weekly automation: [`.github/workflows/upstream-sync.yml`](../.github/workflows/upstream-sync.yml) — always leaves **at most one** open `upstream-sync` PR (latest).  
ZGE CI gates: [`.github/workflows/ci-zge.yml`](../.github/workflows/ci-zge.yml) — required **`zge-gates`** runs shared full unit suite + ZGE focus + build; advisory job runs full monorepo `npm test` until that suite is green.

## Protected paths (ZGE wins on conflict by default)

- `deploy/**` — self-host installer, systemd, zrok
- `packages/server/src/push/**`, `routes/push-routes.ts` — Web Push
- `packages/server/src/routes/omp-config-routes.ts` — OMP settings mirror
- `packages/shared/src/omp-agent-paths.ts`, `input-needed-tools.ts` (+ their tests)
- `docs/upstream-sync.md`, `scripts/upstream-sync.sh`, `.github/workflows/ci-zge.yml`, `upstream-sync.yml`

Shared hubs (`packages/server/src/server.ts`, `packages/extension/src/bridge.ts`, `packages/shared/src/config.ts`) need **semantic** merges: keep both OMP/push call sites and upstream features.

## Gates

0. **Structural** — deploy/, push/, omp-agent-paths, install.sh still points at `ZGEnergy/omp-dashboard`
1. **Focused vitest** (Node ≥ 22.18, prefer 22.22) — omp-agent-paths, config-push, push payload/dispatcher/vapid/classifier, ws-ticket when present
2. **Build** — `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm run build`
3. **Runtime smoke** (manual/validation host) — health + vapid with push enabled; omp session spawn
4. **Prod promote** — explicit only (`~/.omp-dashboard` checkout + systemd); never from the Action

## Conflict playbook

1. Run `merge`; read `docs/upstream-sync-conflicts-*.md` if present.
2. Protected paths already `--ours` unless `SYNC_ADOPT_UPSTREAM=1`.
3. For each remaining file: open both stages, combine imports/registrations, re-run tests for that area.
4. `git commit` to finish the merge if needed → `verify` → `pr`.
5. Land via normal protected-main review (1 approval + `ci-zge`).

## Installer default ref

`deploy/install.sh` uses `OMP_DASH_REF` default **`main`**. Override for experiments:

```bash
OMP_DASH_REF=main bash deploy/install.sh
```
