## Context

The dashboard originally spawned its server process using `node --import tsx` in three places: the `cli.ts` shebang, the daemon spawn inside `cli.ts`, and the extension's auto-launcher. Pi ships a TypeScript loader (`jiti`, formerly `@mariozechner/jiti`) which provides an `--import`-compatible register hook, so the dashboard can prefer pi's loader and avoid an extra tsx dependency on the hot path.

Two of the three call sites have already migrated:

1. **Daemon spawn** — `packages/server/src/cli.ts:364` calls `resolveJitiImport()` and falls back to tsx at `cli.ts:366-377` when jiti is unavailable.
2. **Extension spawn** — `packages/extension/src/server-launcher.ts:104` calls `resolveJitiImport()` and uses the same fallback semantics.
3. **Shebang** — `packages/server/src/cli.ts:1` still reads `#!/usr/bin/env node --import tsx`.

The shebang is the only remaining call site because shebangs cannot interpolate a dynamic path. This change scopes itself to that last site.

A separate decision (recorded here) keeps tsx as a fallback rather than removing it: Electron's managed install (`packages/server/src/cli.ts:255`) and the standalone-without-pi path (`packages/electron/src/lib/server-lifecycle.ts:235-297`) both rely on tsx when no pi installation is reachable. Removing tsx outright would regress those flows.

## Goals / Non-Goals

**Goals:**
- Decouple the `pi-dashboard` bin entry from the tsx-in-shebang requirement
- Reuse the existing `resolveJitiImport()` resolver — no new resolution logic
- Preserve the tsx fallback behavior already present in the daemon spawn

**Non-Goals:**
- Removing tsx from dependencies (out of scope; tsx is the fallback loader)
- Bundling the server to plain JS
- Touching the daemon spawn or extension spawn — both already migrated

## Decisions

### 1. JS bootstrap wrapper at `packages/server/bin/pi-dashboard.mjs`

**Decision**: Add a thin ESM wrapper that mirrors the runtime resolution already done inside `cli.ts:364-377`:

```
1. Try resolveJitiImport() from @blackbelt-technology/pi-dashboard-shared/resolve-jiti.js
2. If that throws, fall back to resolving tsx's esm/index.mjs via createRequire
3. spawn(process.execPath, ["--import", loader, cliTsPath, ...argv], { stdio: "inherit" })
4. Forward exit code
```

The wrapper itself is plain ESM JS so it needs no loader to parse.

*Why mirror cli.ts logic instead of extracting to a shared helper?* — The fallback chain is ~10 lines and lives in one other place (`cli.ts:364-377`). Extracting it would create a new shared module for two callers; inlining keeps the surface small. If a third caller appears, extract then.

### 2. Bin entry repointing

**Decision**: Change `packages/server/package.json` `bin.pi-dashboard` from `src/cli.ts` to `bin/pi-dashboard.mjs`. Add `bin/` to the published `files` list if not already covered by the existing globs.

*Why not keep both?* — npm's `bin` field maps a name to one file. The shebang change makes `cli.ts` no longer a directly executable entry, so the wrapper is now the canonical entry.

### 3. Shebang change

**Decision**: Replace `#!/usr/bin/env node --import tsx` with `#!/usr/bin/env node` in `cli.ts:1`. The `cli.ts` file is no longer invoked directly — only via the `.mjs` wrapper which supplies the loader through `--import`. The plain shebang is kept so that `cli.ts` remains a syntactically valid Node entry if someone imports it directly under jiti/tsx.

## Risks / Trade-offs

- **[Risk] Wrapper drift from daemon spawn fallback** → Mitigation: both copies are short and live in adjacent files; a comment in the wrapper points back to `cli.ts:364-377` as the reference.
- **[Risk] `bin/` excluded from npm package** → Mitigation: explicit verification in task 4.2; existing test pattern in `packages/shared/src/__tests__` could be extended if regressions appear.
- **[Trade-off] Two fallback resolvers** (cli.ts daemon spawn + bin wrapper) → Acceptable; consolidating would require a new shared module for two callers.
