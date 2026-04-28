## Why

The mtime-gated openspec poll cache in `packages/server/src/directory-service.ts` watches a fixed file set per change — `{ <change-dir>, tasks.md, proposal.md, design.md }` — but does **not** watch anything under `specs/**`. When a multi-spec change authors `specs/<cap>/spec.md` files *after* its first poll, no tracked file's mtime advances, the cache hit is permanent, and the dashboard surfaces stale `specs: ready` (orange S letter, no Apply button) indefinitely — even though `openspec status --json` directly reports `specs: done`.

This is the same blind-spot pattern that `fix-openspec-mtime-gate-blind-spots` previously fixed for `tasks.md` in-place edits. We missed `specs/**` because the single-spec workflow naturally re-touches `tasks.md` after authoring, which masks the bug. The multi-spec workflow doesn't, so the staleness sticks.

The user-visible symptom on `fix-mobile-header-and-orientation` (2 specs, both authored, CLI says done, dashboard says ready) is the trigger for this fix.

## What Changes

- **(A) Extend `perChangeArtifactPaths()`** in `directory-service.ts` to union the mtimes of:
  - `<change>/specs/` (catches new capability subdirectories)
  - every immediate `<change>/specs/<cap>/` directory (catches `spec.md` creation inside each)
  - every `<change>/specs/<cap>/spec.md` file (catches in-place edits, mirrors the tasks.md treatment)

  One `readdirSync` per change per poll tick; ENOENT-safe; cheap relative to the openspec CLI invocations the gate is protecting.

- **(B) Add a specs-evidence promote-on-evidence override** mirroring the existing `openspec-design-evidence.ts` pattern. Pure rule evaluator + real-fs probe factory: if `specs/**/*.md` matches anything, promote `specs: ready → done`. Promote-only, never demote, only fires when the CLI says `ready`. Belt-and-suspenders against any future blind spot in the gate.

- **Regression test** in `directory-service.test.ts` simulating the exact timeline (poll → mkdir specs/cap → write spec.md → re-poll must observe the new state, not stale ready).

- **Unit tests** for the new `openspec-specs-evidence.ts` rule evaluator (parallel structure to `openspec-design-evidence.test.ts`).

- **AGENTS.md notes** for both files citing this change.

## Capabilities

### Modified Capabilities

- `server-openspec-polling`: the per-change effective-mtime watch set MUST cover `specs/**` so that authoring spec files invalidates the cache. The poller MUST also expose a specs-evidence probe factory that promotes `specs: ready → done` when at least one `specs/**/*.md` file exists, so multi-spec changes never appear ready in the dashboard once any spec has been authored.

## Impact

**Code:**
- `packages/server/src/directory-service.ts` — extend `perChangeArtifactPaths()`; wire specs probe factory.
- `packages/shared/src/openspec-specs-evidence.ts` — **new** pure evaluator + real-fs probe factory.
- `packages/shared/src/openspec-poller.ts` — extend `buildOpenSpecData` to optionally accept a `SpecsProbeFactory` (parallel to existing `DesignProbeFactory`); wire the real-fs factory in the sync + async poll paths.
- `packages/server/src/__tests__/directory-service.test.ts` — new timeline regression test.
- `packages/shared/src/__tests__/openspec-specs-evidence.test.ts` — **new** unit tests for the rule evaluator.

**Docs:**
- `AGENTS.md` — key-files entries for `directory-service.ts`, `openspec-poller.ts`, and the new `openspec-specs-evidence.ts`.

**Out of scope:**
- No protocol changes (`browser-protocol.ts` / `protocol.ts` untouched).
- No client changes — the fix is server-side only; the existing client renderer already maps `specs → S` correctly.
- No migration — caches are in-memory, the fix takes effect on the first poll after restart.
- No skill changes — `effective-status.sh` continues to defer to the CLI plus the existing design override.

**Compatibility / rollback:**
- Probe factory is opt-in (matches the existing `DesignProbeFactory` argument shape) — older callers that pass no factory get verbatim CLI output, so the change is backward compatible.
- Rollback = revert the watch-set extension and the probe wiring; no persisted state to migrate.
