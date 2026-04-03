## Context

The dashboard spawns its server process using `node --import tsx` in three places:
1. **Shebang** in `src/server/cli.ts` — `#!/usr/bin/env node --import tsx`
2. **Daemon spawn** in `src/server/cli.ts` line 126 — `spawn(process.execPath, ["--import", "tsx", cliPath, ...args])`
3. **Extension spawn** in `src/extension/server-launcher.ts` line 48 — same pattern

Pi ships `@mariozechner/jiti` which provides `jiti-register.mjs` — a Node.js `--import` hook that transpiles TypeScript on the fly, same as tsx.

## Goals / Non-Goals

**Goals:**
- Replace all `tsx` usage with pi's bundled `@mariozechner/jiti/register`
- Remove `tsx` from `package.json` dependencies
- Work in both contexts: inside pi process (extension) and standalone CLI (`pi-dashboard`)

**Non-Goals:**
- Building/bundling the server to plain JS (that's a separate concern)
- Supporting environments where pi is not installed

## Decisions

### 1. Jiti path resolution strategy

**Decision**: Create a shared `resolveJitiRegister()` helper that uses two strategies:

1. **`import.meta.resolve`** — Works when running inside pi's process (extension context). Call `import.meta.resolve('@mariozechner/jiti/register')` which resolves through pi's module graph.
2. **`which pi` fallback** — For standalone CLI invocation. Find the `pi` binary, follow symlinks to get `pi-coding-agent/dist/cli.js`, walk up to the package root, then resolve `node_modules/@mariozechner/jiti/lib/jiti-register.mjs`.

*Why not just `import.meta.resolve`?* — The CLI bin entry may run outside pi's process where `@mariozechner/jiti` isn't in the resolution chain.

*Why not just `which pi`?* — It spawns a child process and depends on PATH. The `import.meta.resolve` path is instant and more reliable when available.

### 2. CLI bin entry approach

**Decision**: Replace the TypeScript shebang with a thin JS wrapper.

Current: `"bin": { "pi-dashboard": "src/server/cli.ts" }` with shebang `#!/usr/bin/env node --import tsx`.

New: `"bin": { "pi-dashboard": "bin/pi-dashboard.mjs" }` — a ~15-line ESM JS file that:
1. Resolves jiti register path (via `which pi` + symlink traversal)
2. Re-execs node with `--import <jiti-path> src/server/cli.ts`

This avoids the shebang limitation (can't use dynamic paths in shebangs).

### 3. Where the helper lives

**Decision**: `src/shared/jiti-loader.ts` — shared between extension and server code. Exports:
- `resolveJitiRegisterPath(): string` — returns the absolute filesystem path to `jiti-register.mjs`
- `getJitiImportArgs(scriptPath: string): string[]` — returns `["--import", jitiPath, scriptPath]` ready for `spawn()`

## Risks / Trade-offs

- **[Risk] Pi not installed globally** → Mitigation: The dashboard already requires pi as a prerequisite. The resolver throws a clear error message if jiti can't be found.
- **[Risk] Pi's jiti version changes behavior** → Mitigation: Low risk — jiti's register hook is a stable API. Both tsx and jiti use esbuild transforms. Already verified with `cli.ts status`.
- **[Risk] `which pi` fails on some systems** → Mitigation: `import.meta.resolve` is the primary path (covers extension + daemon spawn). `which pi` is only needed for direct `pi-dashboard` CLI invocation, where pi must be on PATH anyway.
- **[Trade-off] Adds coupling to pi's internal package structure** → Acceptable since this is a pi extension/plugin. The path `node_modules/@mariozechner/jiti/lib/jiti-register.mjs` follows standard node_modules layout.
