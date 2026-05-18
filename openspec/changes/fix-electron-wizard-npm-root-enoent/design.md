## Context

`packages/shared/src/tool-registry/definitions.ts::npmExecutorDef` builds two
strategy chains:

| Platform | Chain |
| --- | --- |
| `win32` | `override → managed-runtime → npmCliBesideNode → where` |
| unix    | `override → managed-runtime → where` |

`managed-runtime` reads `~/.pi-dashboard/node/{bin/npm,npm.cmd}`. On a clean
Electron install, that directory does not exist until the wizard's
`installManagedNode()` completes. Until then the chain falls through to
`where`, which on macOS Electron returns `null` because GUI processes inherit
a minimal PATH (no `/opt/homebrew/bin`, no `/usr/local/bin`).

When `packages/server/src/server.ts` boots inside Electron, it constructs
pi's `DefaultPackageManager` via the wrapper at
`packages/server/src/package-manager-wrapper.ts`. Pi's package manager
synchronously probes `npm root -g` on construction. The wrapper's
`resolveViaRegistry()` queries the registry, sees `npm` is registered but
unresolved, and falls back to `[command, ...args]` — i.e. the literal string
`"npm"`. `adapter.spawnSync("npm", …)` then fires ENOENT and the wrapper
throws `Failed to run npm root -g: spawnSync npm ENOENT`.

Electron's wizard installer (`packages/electron/src/lib/dependency-installer.ts::resolveNpm`)
already knows the correct fallback cascade — managed → bundled → system —
and uses the bundled npm at `process.resourcesPath/node/lib/node_modules/npm/bin/npm-cli.js`
(via `getBundledNpmPath()`). The registry never learned about this
location.

## Goals / Non-Goals

**Goals**

- Eliminate the ENOENT warning on every clean Electron startup.
- Make `ToolRegistry.resolveExecutor("npm")` return a working argv on
  first Electron boot — before `installManagedNode()` runs and even when
  no system npm exists.
- Keep non-Electron consumers (CLI, extension, dev server, tests)
  byte-identical: the new strategy MUST report `ok:false` cleanly when
  not in Electron.
- Apply the same fix to the `node` executor for parity, even though
  pi's package manager rarely spawns bare `node`.

**Non-Goals**

- Removing `packages/electron/src/lib/dependency-installer.ts::resolveNpm`.
  Its cascade is broader (handles managed-Node verification probes,
  Windows quoting) and stays as defence-in-depth.
- Changing `resolveViaRegistry()` fallback semantics. The bare
  `[command, ...args]` passthrough remains for unregistered names.
- Pre-warming the registry from `server.ts` startup. The fix lives
  inside the registry definition itself so every consumer benefits
  uniformly (no ordering hazard between server bootstrap and pi load).

## Decisions

**D1. Add the strategy to the registry, not to a server-side pre-warm hook.**

Alternative considered: have `server.ts` call
`registry.registerOverride("npm", getBundledNpmPath())` before
`loadPiPackageManager()`. Rejected because:

1. Couples server bootstrap to an Electron-specific concern.
2. Requires every other entry point (Doctor, route handlers, future
   workers) to repeat the pre-warm or risk re-hitting ENOENT.
3. Conflates "user override" semantics with "platform default" — the
   override slot exists for `tool-overrides.json` user choices, not for
   bundled-runtime defaults.

Putting the bundled-runtime probe inside the strategy chain means every
`registry.resolve("npm")` consumer (server, route handlers, Doctor,
package-manager wrapper, plugin loader) wins automatically.

**D2. Strategy name = `"managed"`.**

`Source` is the public classification surface. The new strategy resolves
a runtime bundled inside the application itself; semantically it is a
managed runtime (the user didn't install it). Reusing the existing
`"managed"` label avoids inventing a new `Source` value (which would
ripple through Doctor UI, classify functions, and downstream consumers).
Recorded `tried[]` entry name distinguishes it as `"electron-bundled"`
for diagnostic clarity.

**D3. Position: after `managed-runtime`, before `where`.**

Final chains:

| Platform | Chain |
| --- | --- |
| `win32` | `override → managed-runtime → electron-bundled → npmCliBesideNode → where` |
| unix    | `override → managed-runtime → electron-bundled → where` |

Rationale:

- `override` first — user choices always win.
- `managed-runtime` second — `~/.pi-dashboard/node/` is the persistent,
  upgradeable copy; once installed it should be preferred over the
  per-version bundled snapshot.
- `electron-bundled` third — fires only when the persistent copy is
  absent. After the wizard's first run, `managed-runtime` wins on
  subsequent boots.
- `npmCliBesideNode` fourth (win32) — covers system Node installs whose
  npm-cli.js sits beside `node.exe` (not a layout we control on Unix).
- `where` last — fall-through to PATH.

**D4. Reading `process.resourcesPath` directly inside the strategy.**

`StrategyCtx` does not include `resourcesPath`. Adding it would force
every test in the bootstrap harness (1080-cell scenario cube in
`packages/shared/src/__tests__/bootstrap/`) to pass a value.

Decision: extend `StrategyDeps` with an optional
`resourcesPath?: string` injection slot; default reads
`(process as { resourcesPath?: string }).resourcesPath ?? null` at
strategy-construction time. Pure function over deps; tests inject; prod
reads global. Same pattern as the existing
`StrategyDeps.npmRootGlobal()` injection.

**D5. Strategy returns `ok:false` when `resourcesPath` is unset.**

Reason recorded as `"not running in Electron (no resourcesPath)"`.
Keeps the `tried[]` trail honest for diagnostics in non-Electron contexts
without producing noise (the trail entry is informational; the chain
falls through to the next strategy as designed).

**D6. Layout discovery mirrors `getBundledNpmPath()` exactly.**

Probe order inside the strategy:

```
Unix:    <resourcesPath>/node/bin/node                              (node)
         <resourcesPath>/node/lib/node_modules/npm/bin/npm-cli.js   (npm)
Windows: <resourcesPath>/node/node.exe                              (node)
         <resourcesPath>/node/node_modules/npm/bin/npm-cli.js       (npm)
```

For `npm` we resolve directly to `npm-cli.js` (the JavaScript entry
point, not the shell shim or symlink at `bin/npm`). This is required
because on macOS the `bin/npm` entry is a *symlink* directly to
`npm-cli.js` (no shell wrapper), and spawning the symlink relies on
the shebang `#!/usr/bin/env node` resolving `node` via PATH — which
fails in the exact GUI-process scenario we are fixing. Pairing the
bundled node interpreter with `npm-cli.js` explicitly removes the
PATH dependency.

For `node` we resolve to the binary directly.

**D6a. `nodeScriptToArgv` must prepend `node` on all platforms for
`.js` paths (cross-platform extension).**

`nodeScriptToArgv` (in `definitions.ts`) was previously a Windows-only
interpreter prepender (added for the "no cmd flash" story). For the
Electron-bundled npm resolution to actually spawn successfully on
macOS/Linux, the `.js`-detection branch MUST also fire on Unix. This
is backwards-compatible: existing Unix scenarios that resolve via the
`where` strategy land on shell wrappers (`/usr/local/bin/npm`,
`/usr/bin/openspec`) which do NOT end in `.js`, so the branch never
fires for them — their argv stays `[<wrapper>]` and shebang resolution
continues to work because the user shell PATH already includes node.

The branch only fires when a strategy returns a literal `.js` path,
which today happens only via:
- `electronBundledRuntimeStrategy("npm")` (this change)
- `npmGlobalStrategy(...)` for module-style executors like pi-coding-agent
- `bareImportStrategy(...)` for the same

All three are scenarios where pairing the interpreter explicitly is
the correct call — the resolved path is a pure JS script with no
guarantee of an executable bit or PATH-resolvable shebang.

**D7. No `rescan()` call from server bootstrap.**

The first call to `registry.resolve("npm")` from inside pi's package
manager will hit the new strategy and succeed. There is no stale cache
to invalidate because the registry caches resolutions per-tool, and the
very first resolution will now succeed.

If a prior failed resolution was somehow cached before this change ships
(e.g. via a route handler eagerly probing during a previous boot), a
process restart already clears the in-memory cache. No persisted state.

## Risks / Trade-offs

**[Risk] Bundled npm version drifts from system / managed npm.**
→ Mitigation: bundled Node ships with the npm pinned by
`packages/electron/scripts/bundle-server.mjs` (Node distribution
default). Same npm version is in use today by `resolveNpm()` fallback;
this change only routes the registry to the same place. No new drift.

**[Risk] `process.resourcesPath` populated in non-Electron edge cases
(e.g. a renderer-side test bench that imports the registry).**
→ Mitigation: the existence probe (`exists(<resourcesPath>/node/...)`)
gates the strategy. If the path is set but no bundled tree exists, the
strategy reports `missing: <path>` and the chain proceeds. No silent
mis-resolution.

**[Risk] Strategy classified as `"managed"` source confuses Doctor.**
→ Mitigation: Doctor reads both `source` and the `tried[]` trail.
Diagnostic clarity comes from the strategy `name` field
(`"electron-bundled"`) recorded in `tried[]`. UI surfaces the trail
verbatim.

**[Risk] Bootstrap test harness (`packages/shared/src/__tests__/bootstrap/harness.ts`)
needs updating.**
→ Mitigation: harness passes `resourcesPath: undefined` by default, so
the new strategy reports `ok:false` and existing 1080-cell scenarios
remain unchanged. New scenarios that opt in to Electron-bundled paths
inject a value explicitly.

## Migration Plan

1. Ship strategy + tests behind the existing registry. No feature flag.
2. Next Electron release picks up the new chain. First user launch
   resolves `npm` to the bundled path instead of ENOENT'ing.
3. Rollback: revert the single strategy registration in
   `definitions.ts`. The chain returns to its pre-change shape; no data
   migration, no persistent state changes.

## Open Questions

None — the strategy boundary, injection point, and ordering are all
well-defined by existing patterns (`managedRuntimeStrategy`,
`npmCliBesideNodeStrategy`).
