# Design — derive OpenSpec artifact status locally

## Context

`directory-service.ts` `pollOne(cwd, force)`:
- Step 1: `openspec list --json` (gated by `changesRoot` effective mtime).
- Step 2: for each change, gated by per-change effective mtime, call
  `semaphore.run(() => runOpenSpecStatus(cwd, c.name))` — **the spawn storm**.
- Step 3: `buildOpenSpecData(list, statusResults, designProbe, specsProbe)`.

`buildOpenSpecData` already accepts the design + specs probe factories and
already promotes artifact status from local evidence. So the data plumbing for
local evidence exists; only the `tasks`/`proposal` artifacts and `isComplete`
still depend on the CLI `status` call.

## Decision

Replace the Step-2 CLI spawn with a pure derivation on the periodic path.
Keep the CLI for `force=true` (user Refresh) as authoritative.

### `deriveArtifactStatus` contract

```
deriveArtifactStatus(
  changeDir: string,
  listEntry: { completedTasks: number; totalTasks: number },
  probes: { design: DesignProbe; specs: SpecsProbe },
): { artifacts: Array<{ id: string; status: string }>; isComplete?: boolean }
```

Artifact id → status rule:
- `proposal`: `done` iff `proposal.md` exists, else `ready`.
- `tasks`: `done` iff `totalTasks > 0 && completedTasks === totalTasks`
  (cross-checked against `parseTasksMarkdown` count for the parity test).
- `design`: `done` iff design evidence probe (R1/R2/R3) satisfied, else `ready`.
- `specs`: `done` iff ≥1 `specs/**/*.md` per specs evidence probe, else `ready`.
- `isComplete`: `true` iff every artifact `done`.

Pure + probe-injected → unit-testable without fs mocks, mirroring the existing
`buildOpenSpecData` style.

## Why not just raise the interval (Option A alone)

A larger interval reduces frequency but each tick still emits the full
`1 + N` spawn burst and the synchronous stat storm — the spike that drops the
heartbeat still happens, just less often. Structural fix removes the spike.

## Why keep CLI on force-refresh

The `openspec status` CLI is authoritative for artifact-state semantics. If a
future openspec release changes ordering or adds artifact kinds, local
derivation could drift. Force-refresh stays CLI-backed so the user always has
a ground-truth escape hatch; the parity test catches drift in CI before it
ships.

## Out of scope

- The synchronous `perChangeArtifactPaths` stat scan stays (it is the
  mtime gate; correctness depends on it). Removing the spawn storm already
  collapses tick cost; offloading the stat scan is a separate optimization.
- Lazy/visible-only status (Option C) — deferred; local derivation is cheap
  enough that eager derivation for all changes is fine.
