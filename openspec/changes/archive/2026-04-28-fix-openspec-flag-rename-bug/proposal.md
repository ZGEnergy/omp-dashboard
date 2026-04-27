## Why

`detectOpenSpecActivity` in `packages/shared/src/openspec-activity-detector.ts` extracts the change name from openspec CLI invocations using regexes whose capture group `[^\s"']+` greedily matches any non-whitespace token — including flags that start with `-`. When an agent runs a discovery command like `openspec archive --help` (or any `openspec <verb> --help`), the detector returns `{ changeName: "--help", isActive: true }`. The server then:

1. Stamps `session.openspecChange = "--help"`
2. Auto-attaches a (nonexistent) proposal named `--help`
3. If the session has no name, **renames it to `--help`** and propagates the rename to the bridge

Users have hit this in the wild. The fix is small and well-scoped: refuse to treat tokens starting with `-` as change names, in the one shared helper that produces them.

## What Changes

- `detectOpenSpecActivity` SHALL reject any captured `changeName` that starts with `-` (returns `null` instead of a falsy/flag-shaped name).
- The rename / auto-attach path in `event-wiring.ts` is left untouched — once the detector is honest, the cascade is correct. (No defense-in-depth duplication; the detector is the single source.)
- Add regression coverage in `packages/shared/src/__tests__/` (or wherever the detector is currently tested) for: `openspec archive --help`, `openspec change new --help`, `openspec foo --change --help`, and a positive control (`openspec archive add-auth` still extracts `add-auth`).
- Drop / re-shape the speculative regexes that don't match the real openspec CLI surface only if doing so is risk-free; otherwise leave them and rely on the `-` guard. (Decision deferred to design.md.)

Not breaking. Not user-visible beyond "sessions stop being renamed to `--help`".

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `proposal-attachment`: The "Activity detection with isActive flag" requirement is tightened — change names captured from CLI invocations MUST NOT begin with `-`. This affects the auto-attach and auto-rename behavior downstream (both already documented in this spec).

## Impact

- **Code**: `packages/shared/src/openspec-activity-detector.ts` (regex tightening or guard clause), plus a unit test file alongside it.
- **APIs**: None. The `DetectedActivity` shape is unchanged.
- **Behavior**: Sessions that would previously have been silently renamed to `--help` (or any other `--flag`) by an agent's discovery command stay un-renamed. Manual attach/rename are unaffected.
- **No migration**: Already-corrupted sessions (e.g. `name = "--help"`, `attachedProposal = "--help"`) can be cleaned up via the existing rename / detach UI; no automatic backfill needed.
