## Context

The dashboard server polls `openspec list` + per-change `openspec status --change <name>` periodically and broadcasts the result to connected clients. To keep the spawn rate sustainable on Windows (~2 s per CLI invocation), the poller is gated by a per-change effective-mtime cache in `packages/server/src/directory-service.ts`:

```
PerChangeEntry { mtimeMs: number, change: OpenSpecChange }
```

The gate considers a change "unchanged" when the effective mtime — the maximum of a fixed set of tracked paths — equals the previously stamped value. The watch set was originally `[<change-dir>]` only; the **fix-openspec-mtime-gate-blind-spots** change extended it to also include `tasks.md`, `proposal.md`, and `design.md` to catch in-place file edits (POSIX `mtime` of a directory does not advance when a file *inside* it is edited).

Today's set:

```ts
function perChangeArtifactPaths(changesRoot, name): string[] {
  const dir = path.join(changesRoot, name);
  return [
    dir,
    path.join(dir, "tasks.md"),
    path.join(dir, "proposal.md"),
    path.join(dir, "design.md"),
  ];
}
```

`specs/**` is **not** in the set. For multi-spec changes the typical authoring sequence is:

```
1. write proposal.md          ← bumps tracked file
2. write design.md            ← bumps tracked file
3. mkdir specs/<a>            ← bumps <change>/specs/ mtime only
4. write specs/<a>/spec.md    ← bumps <change>/specs/<a>/ mtime only
5. mkdir specs/<b>            ← bumps <change>/specs/ mtime only
6. write specs/<b>/spec.md    ← bumps <change>/specs/<b>/ mtime only
7. write tasks.md             ← bumps tracked file (eventually invalidates)
```

Between steps 2 and 7 the dashboard can poll, observe `specs/**/*.md` matches nothing, stamp `specs: ready`, and never invalidate that stamp until step 7 (or any later edit to a tracked file). For the `fix-mobile-header-and-orientation` change observed in production the user authored both spec files at 11:34 and 11:35; the stamp from the 11:34 poll said `ready` and stuck.

The CLI's verdict is correct (it `fast-glob`s `specs/**/*.md` on every invocation). The bug is purely in the dashboard's invalidation signal.

## Goals / Non-Goals

**Goals:**

- Multi-spec authoring (creating `specs/<cap>/spec.md` after a previous "no specs yet" poll) MUST invalidate the per-change cache on the next poll tick.
- In-place edits to `specs/<cap>/spec.md` MUST also invalidate the cache (mirrors today's `tasks.md` treatment).
- Belt-and-suspenders: even if a future cache-invalidation blind spot creeps in, the dashboard MUST never under-report `specs` as `ready` when at least one spec file actually exists on disk.
- Zero changes to wire-protocol or client-side rendering. Server + shared only.

**Non-Goals:**

- Cross-checking the proposal's "Capabilities" section against authored spec files. (That's a separate proposal — case B/D from the explore session.)
- Validating spec section structure (`### Requirement:`, `#### Scenario:`). The CLI doesn't, so we don't.
- Adding `archive/` or any other directory beyond `specs/` to the watch set.
- Replacing the mtime gate with a file-watcher (`chokidar` etc.) — out of scope; the gate is good enough once the watch set is correct.

## Decisions

### Decision 1: Watch set extension shape

The new `perChangeArtifactPaths(changesRoot, name)` will return:

```
[
  <change>/                              (existing)
  <change>/tasks.md                      (existing)
  <change>/proposal.md                   (existing)
  <change>/design.md                     (existing)
  <change>/specs/                        (new)
  <change>/specs/<cap>/        (new, one entry per immediate child dir)
  <change>/specs/<cap>/spec.md (new, one entry per existing spec.md)
]
```

The fan-out is computed by one `readdirSync` of `<change>/specs/` per change per poll tick.

**Why immediate-child enumeration instead of recursive walk?**

Spec files are conventionally `specs/<cap>/spec.md` — exactly two levels deep. The schema's `outputPath` is `specs/**/*.md` but we only need to detect *change*, not enumerate matches. Watching the parent directories is sufficient because:

| Event                                          | Bumps which dir mtime?                       | Do we need to detect it? |
| ---------------------------------------------- | -------------------------------------------- | ------------------------ |
| `mkdir specs/`                                 | `<change>/`                                   | already covered          |
| `mkdir specs/<cap>/`                           | `<change>/specs/`                             | covered by new entry     |
| `write specs/<cap>/spec.md` (new)              | `<change>/specs/<cap>/`                       | covered by new entry     |
| `edit specs/<cap>/spec.md` (in-place)          | `<change>/specs/<cap>/spec.md` (mtime only)  | covered by new entry     |
| `rm -rf specs/<cap>/`                          | `<change>/specs/`                             | covered by new entry     |
| `mv specs/<cap>/spec.md spec2.md`              | `<change>/specs/<cap>/`                       | covered by new entry     |

Three-or-more-level layouts (`specs/<cap>/sub/file.md`) aren't part of the schema's expected layout. If the user manually creates one, the cache may stale until any tracked path changes — acceptable, and the same caveat applies to the existing `tasks.md` watch (we don't watch `tasks/` subdirectories either).

**Alternative rejected:** Recursive walk via `fast-glob`. Adds 5–50 ms per change per poll tick — small, but the gate is supposed to be cheap-or-skip. Conventional layout doesn't need it.

### Decision 2: Probe-factory parallel to `DesignProbeFactory`

`buildOpenSpecData(listResult, statusResults, designProbeFactory?)` already accepts an optional design-probe factory. We extend its signature:

```ts
buildOpenSpecData(
  listResult,
  statusResults,
  designProbeFactory?: DesignProbeFactory,
  specsProbeFactory?: SpecsProbeFactory,
): OpenSpecData
```

`SpecsProbeFactory` returns a `SpecsEvidenceProbe` with a single method:

```ts
interface SpecsEvidenceProbe {
  hasAnySpecFile(): boolean;  // any *.md under specs/**
}
```

The override fires only when the CLI reports `specs: ready` (mirrors design-probe semantics — promote-only, never demote, never `blocked → done`).

**Why a probe factory and not a direct `fs` call inside `buildOpenSpecData`?**

Same reason the design probe is a factory: keeps `buildOpenSpecData` pure and unit-testable without filesystem mocks. Tests inject in-memory factories; production wires `createFsSpecsEvidenceProbe()`.

**Alternative rejected:** Folding specs evidence into the design probe. They're orthogonal (one fires on design files, one on spec files). Keep them separate so each can be reasoned about and tested in isolation.

### Decision 3: Backward-compatibility shape

The new factory parameter is optional and defaults to `undefined`. Callers that don't pass it get verbatim CLI output for `specs` (matches today's behavior). Both production call sites (`pollOpenSpec` / `pollOpenSpecAsync`) and the gated path in `directory-service.ts` will pass the new factory; tests that don't care can omit it.

### Decision 4: Where to wire the override on the gated path

`directory-service.ts` builds its `statusResults` map from a mix of cached entries and freshly-spawned CLI results. The probe factory MUST run on the *final* assembled artifacts array — same point at which `createFsProbeFactory(cwd)` is wired today. One call site, no surprise interactions with the gate.

## Risks / Trade-offs

| Risk                                                                                                                 | Mitigation                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `readdirSync(<change>/specs/)` adds one syscall per change per poll. With 30 active changes that's 30 extra syscalls. | Each is sub-millisecond on local disk. Total cost dwarfed by the openspec CLI invocations the gate is protecting (~ 200–2000 ms each). |
| `readdirSync` throws if `<change>/specs/` doesn't exist.                                                              | Wrap in try/catch returning `[]`, exactly mirroring `effectiveMtimeOr`'s ENOENT handling. Tested.                              |
| Probe factory promotes `ready → done` even if every spec file is empty / structurally invalid.                        | The CLI also accepts any matching file (its check is just `fast-glob` count > 0). We're matching CLI semantics — not adding new validation. Not a regression. |
| Future schemas with a different `outputPath` glob.                                                                    | Out of scope. Probe is keyed on the literal `specs/**/*.md` layout. If a custom schema appears, this override won't fire (probe returns false), so the CLI verdict wins — safe degradation. |
| TOCTOU between the readdirSync (computing watch set) and the openspec CLI invocation.                                  | Same TOCTOU window already exists for the existing `effectiveMtimeOr` calls, and is already documented + handled by the post-call mtime re-check (see `fix-openspec-mtime-gate-toctou`). The new entries plug into the same pre/post check loop unchanged. |

## Migration Plan

- **Deploy**: server-only change, takes effect on next dashboard restart. Caches are in-memory, no on-disk state to migrate.
- **Rollback**: revert the watch-set extension in `directory-service.ts` and the `SpecsProbeFactory` wiring in `openspec-poller.ts`. Probe factory is opt-in so the rollback is a clean diff.
- **No client work** — existing client-side `LETTER_MAP[specs] = "S"` and `statusColor("done") = green` already render correctly once the server reports `done`.

## Open Questions

- Should we ship `B` (override) and `A` (gate fix) as one change (this proposal) or split? **Decided in the explore session — both, here, because they're complementary and small.**
- Do we want a config flag to disable the override (e.g. for users debugging the CLI)? **No. The override matches CLI semantics; disabling it would only hide bugs, not fix them.**
- Does this also need to run for archived changes under `openspec/changes/archive/<name>/`? **No. Archived changes are immutable by convention; the cache for archive entries is read-once at scan time, not gated.**
