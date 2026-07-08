# Fix bridge pi-version read failing on restrictive `exports` maps

## Why

The bridge reads its own pi version by resolving a package **subpath**:

```ts
// packages/extension/src/model-tracker.ts:82  defaultReadPiVersion()
createRequire(import.meta.url).resolve("@earendil-works/pi-coding-agent/package.json")
```

Node's ESM/`exports` resolver refuses any subpath the package does not explicitly list in its `exports` map. The installed `@earendil-works/pi-coding-agent@0.80.2` declares only:

```jsonc
"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
//            ↑ no "./package.json" entry
```

So `resolve(".../package.json")` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` on **every** call — not intermittently, not environment-specific. Any dashboard user on a pi build whose `exports` omits `./package.json` (0.80.2 and any similarly-packaged version) hits it.

Because the read is retried every `runGitPollTick` (30 s) and the "read failure is silent" contract only `console.warn`s and retries, the warning + full stack trace floods the connected pi TUI indefinitely:

```
[dashboard] pi version read failed: Error [ERR_PACKAGE_PATH_NOT_EXPORTED]:
Package subpath './package.json' is not defined by "exports" in
.../node_modules/@earendil-works/pi-coding-agent/package.json
  ...repeats every 30s, forever...
```

The bug is dual: the **code** resolves a non-exported subpath, and the **spec** (`bridge-extension` → "Bridge reports its session's pi version") literally prescribes that exact broken call. Both must change.

The code comment even asserts the wrong invariant: *"The bridge runs inside pi's own tree, so `createRequire` resolution always succeeds."* Tree location is irrelevant — the `exports` map gates subpath resolution regardless of where the caller sits.

## What Changes

- Replace the subpath resolve with a resolution that does not depend on `./package.json` being exported:
  - Resolve the package **entry** (`"@earendil-works/pi-coding-agent"`, the `"."` export — always available), then walk up from the resolved file to the nearest `package.json` whose `name` matches, and read `version` from it.
- Correct the misleading code comment about "always succeeds".
- Update the `bridge-extension` spec requirement + scenarios: drop the prescriptive broken call, describe the exports-safe resolution, and add a scenario asserting a restrictive `exports` map (no `./package.json`) still yields the version rather than a permanent read failure.
- Keep the existing behaviour otherwise: single push at register, re-push on change, `lastPiVersion` dedupe, silent-warn-and-retry on genuine failure.

## Capabilities

### Modified Capabilities

- `bridge-extension`: the "Bridge reports its session's pi version" requirement no longer prescribes resolving the `./package.json` subpath; it mandates an `exports`-safe read and adds a restrictive-exports scenario.

## Impact

- `packages/extension/src/model-tracker.ts` — `defaultReadPiVersion()` rewrite + comment fix.
- `packages/extension/src/model-tracker.test.ts` (or equivalent) — add a test covering a package whose `exports` omits `./package.json`.
- No wire-protocol change: `pi_version_update { sessionId, version }` unchanged; server + client untouched.
- Removes recurring 30 s TUI log spam for all users on affected pi versions.
