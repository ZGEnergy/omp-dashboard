# Design — exports-safe pi-version read

## Root cause

`createRequire(url).resolve("<pkg>/package.json")` is a **subpath** resolution. Under Node's `exports` semantics, only subpaths enumerated in the package's `exports` map are resolvable; everything else throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. `@earendil-works/pi-coding-agent@0.80.2` exports only `"."`, so the `./package.json` subpath is unreachable. This is deterministic, not flaky.

```
resolve("@earendil-works/pi-coding-agent/package.json")
        └─ subpath "./package.json" ──▶ checked against exports map
                                        exports = { "." : ... }   ← no match
                                        ──▶ ERR_PACKAGE_PATH_NOT_EXPORTED (always)
```

## Options considered

| Option | Works with restrictive exports? | Notes |
|---|---|---|
| A. Resolve entry `"."`, walk up to nearest `package.json` | ✅ | `"."` is always exported; walk-up finds the real manifest. Chosen. |
| B. `require("<pkg>").version` | ❌ | Package entry does not re-export its own version; and entry is ESM-only. |
| C. Import a version constant from the package's public API | ❌ | No such export exists in pi; would require an upstream change we don't control. |
| D. Add `"./package.json"` to pi's exports | ❌ | Upstream package we can't edit; wouldn't help already-installed versions. |
| E. Scan `node_modules/@earendil-works/pi-coding-agent/package.json` by hand-built path | ⚠️ | Fragile across hoisting / pnpm / nested installs; walk-up from the resolved entry is the robust form of this. |

## Chosen approach (Option A)

**Resolver correction found during implementation:** the entry must be resolved with the **ESM** resolver `import.meta.resolve`, NOT `createRequire().resolve`. pi's `"."` export defines only `import`/`types` (no `require`/`default`), so the CJS `createRequire` resolver finds no target for the `require` condition and throws its own `ERR_PACKAGE_PATH_NOT_EXPORTED` ("No exports main defined"). `import.meta.resolve` honours the `import` condition, returns a `file://` URL → `fileURLToPath` → walk up.

```ts
function defaultReadPiVersion(): string | undefined {
  return readPkgVersionByWalkUp(
    "@earendil-works/pi-coding-agent",
    (spec) => fileURLToPath(import.meta.resolve(spec)),
  );
}

// readPkgVersionByWalkUp: resolve entry → walk up ≤10 hops to the nearest
// package.json whose `name` matches (guards against ancestor workspace
// manifests under hoisted/linked layouts); return undefined (not throw) when
// none found. resolveEntry/readFile/fileExists injectable for tests.
```

Notes:
- The `name` check prevents matching an ancestor monorepo `package.json` if the entry resolves to a hoisted/linked layout.
- Bounded loop (≤10 hops) guards against pathological symlink/root cases.
- Genuine "not installed" now returns `undefined` (silent skip via existing guard) rather than throwing — so the noisy stack trace disappears even in the not-found case, while the spec's "read failure is silent" contract is preserved for true throws.

## What stays the same

- `pi_version_update` wire message, dedupe via module-scoped `lastPiVersion`, piggyback on `runGitPollTick` (30 s), silent-warn-and-retry on throw. Server storage/broadcast and client display unchanged.

## Test

Inject a fake resolver that points at a temp package whose `exports` omits `./package.json`; assert `defaultReadPiVersion()` returns the manifest's `version` and does not throw. Because `defaultReadPiVersion` uses `import.meta.url`-scoped resolution, the unit test targets the walk-up logic via a small extracted helper or a fixture dir. `sendPiVersionIfChanged` already accepts an injectable `readVersion` for the higher-level behaviour tests.
