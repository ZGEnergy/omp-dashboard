## Context

The RPC keeper sidecar (`packages/server/src/rpc-keeper/keeper.cjs`) is a CommonJS subprocess of the dashboard server. It owns pi's stdin pipe and outlives server restarts. Today, the keeper spawns pi via bare PATH lookup:

```js
child_process.spawn("pi", piArgs, { env, cwd, ... })
```

The dashboard server hands the keeper an `env` produced by `buildSpawnEnv()` (`packages/server/src/process-manager.ts`), which prepends managed-Node directories to `PATH` but does **not** prepend the dashboard server's own `node_modules/.bin/`. The non-keeper headless branch (`spawnHeadless`, same file) resolves `pi` through `ToolRegistry.resolvePiCommand()` and passes the resolved argv directly to `spawnDetached`. The keeper branch was written under the assumption that PATH-based discovery in the keeper would always succeed.

That assumption breaks in the Electron-launched configuration. The Electron app launches the server from `/Applications/PI-Dashboard.app/Contents/Resources/server/dist/cli.js`. The bundled `pi` lives at `Resources/server/node_modules/.bin/pi`, but no PATH entry points there. Empirically (this session, `keeper-ca962218-…log`):

```
spawning pi --mode rpc --session …
pi spawn error: spawn pi ENOENT
shutdown: code=1 reason=pi-spawn-error
```

`ToolRegistry` finds the bundled binary correctly — only the keeper, which bypasses the registry, fails.

## Goals / Non-Goals

**Goals:**
- Keeper spawns the same `pi` binary that `ToolRegistry` would resolve in the parent server.
- Behavior unchanged for non-Electron launches (managed install, system PATH, dev).
- No protocol changes between server ↔ keeper ↔ pi.
- Manual keeper invocation (testing, debugging) still works without server scaffolding — the bare-`"pi"` fallback is preserved.

**Non-Goals:**
- Reshaping `buildSpawnEnv` PATH precedence. The fix targets the keeper's pi resolution, not server-wide PATH semantics.
- Changing the keeper's CJS-only / no-loader rule. The new env var is plain JSON; no new dependencies.
- Resolving `pi` once and caching across keeper spawns. Each spawn re-resolves through the registry, matching the non-keeper branch.

## Decisions

### Decision 1: Resolve pi in the server, pass resolved argv to the keeper via env var

Resolution stays in TypeScript (`process-manager.ts`) where the `ToolRegistry` already lives. The keeper receives the resolved command (executable path + any leading argv from the resolver, e.g. `["node", "/abs/.../cli.js"]` on Windows when only `pi.cmd` is available) through a new env var.

**Env var name:** `PI_KEEPER_PI_CMD`. JSON-encoded `string[]` (mirrors the existing `PI_KEEPER_PI_ARGS` pattern that encodes flag arguments). The keeper strips it from pi's env before spawning pi (same as `PI_KEEPER_PI_ARGS`).

**Alternative considered: pass argv as CLI args to keeper.cjs.**
Rejected — the keeper today accepts a single positional `sessionId`. Adding more positional args complicates parsing and is at odds with the existing `PI_KEEPER_PI_ARGS` convention. An env var matches the established pattern.

**Alternative considered: prepend the server's own `node_modules/.bin/` to `PATH` in `buildSpawnEnv`.**
Rejected — this would affect every spawn the server makes (tmux, wt, headless, keeper). Resolver-based dispatch is the project's stated direction (see `src/shared/tool-registry/`); broadening PATH precedence in `buildSpawnEnv` undoes that intent and risks surprising other lookups.

**Alternative considered: have the keeper require the `ToolRegistry`.**
Rejected hard — keeper.cjs is deliberately CJS-pure, no jiti / no TS loader (matching `preload-fastify.cjs`). The registry lives behind ESM/TS modules. Crossing that line would break the keeper's "outlives server restart" property because the registry would resolve relative to the parent server's install layout, not the keeper's runtime.

### Decision 2: Fallback to bare `"pi"` when env var unset

If `PI_KEEPER_PI_CMD` is missing or malformed JSON, the keeper SHALL fall back to `child_process.spawn("pi", piArgs, …)`. This preserves:
- Existing tests that spawn the keeper directly without the server scaffolding.
- Manual ad-hoc keeper invocation for debugging.
- Any caller relying on the current PATH-lookup behavior (none in production after the server change, but defense in depth).

Malformed JSON is logged as `keeper: ignoring malformed PI_KEEPER_PI_CMD` and treated as unset. Empty array is treated as unset.

### Decision 3: Fail fast in `spawnHeadlessViaKeeper` on resolver miss

Mirror the non-keeper branch (line 459) — if `resolvePiCommand()` returns null, return `{ success: false, code: "PI_NOT_FOUND", … }` before spawning the keeper. Prevents the current failure mode where the keeper spawns successfully, then exits within the 300ms crash window, surfacing as an opaque "RPC keeper exited within crash window" error instead of a clean `PI_NOT_FOUND`.

### Decision 4: cmd vs argv[0] split

`spawn(cmd, args, opts)` takes the executable separately. The resolver returns a `string[]` whose `[0]` is the executable and `[1..]` are leading args (e.g. on Windows `["node", "<path>/cli.js"]`). The keeper SHALL spawn `child_process.spawn(piCmd[0], [...piCmd.slice(1), ...piArgs], …)` and log the joined form for diagnostics.

## Risks / Trade-offs

- **[Risk]** Env-var size limit on Windows (8191 chars combined). → Mitigation: resolved pi argv is typically 1-3 absolute paths, far below the limit. `PI_KEEPER_PI_ARGS` already follows this pattern without issue.
- **[Risk]** Resolver finds a different pi than the user expects in mixed installs (managed + system + dev). → Mitigation: this is `ToolRegistry`'s existing behavior on the non-keeper path; aligning the keeper with it is a feature, not a regression.
- **[Risk]** Stale env var leaks into pi's own env. → Mitigation: keeper deletes `PI_KEEPER_PI_CMD` from the env it passes to pi (same handling as `PI_KEEPER_PI_ARGS`).
- **[Trade-off]** Two code paths in the keeper (env-driven cmd vs bare `"pi"` fallback). Acceptable: the bare path is small, fail-soft, and explicitly documented.

## Migration Plan

1. Land code change. No on-disk state, no protocol change.
2. Keepers spawned by old servers continue to use bare PATH lookup — unaffected by the new behavior. Keepers spawned by new servers use the env var.
3. Rollback: revert the commit. No cleanup steps.

## Open Questions

None. The failure mode is reproducible, the resolver is mature, the env-var pattern is established.
