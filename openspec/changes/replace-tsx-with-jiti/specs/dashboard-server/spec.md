## ADDED Requirements

### Requirement: CLI bin entry resolves loader at runtime
The `pi-dashboard` CLI entry point SHALL be a plain JavaScript file (`packages/server/bin/pi-dashboard.mjs`) that resolves a TypeScript loader at runtime (jiti via `resolveJitiImport()`, with tsx as a fallback) and re-execs Node.js with the appropriate `--import` flag pointing at `cli.ts`.

#### Scenario: Direct CLI invocation with pi available
- **WHEN** a user runs `pi-dashboard status` from a shell with pi reachable on the module graph
- **THEN** the JS wrapper SHALL resolve jiti, then exec `node --import <jiti-path> packages/server/src/cli.ts status` and forward the child's exit code

#### Scenario: Direct CLI invocation without pi
- **WHEN** a user runs `pi-dashboard status` in an environment where `resolveJitiImport()` throws
- **THEN** the JS wrapper SHALL fall back to resolving tsx's `esm/index.mjs` via `createRequire` and exec `node --import <tsx-path> packages/server/src/cli.ts status`

### Requirement: CLI shebang is loader-agnostic
The `packages/server/src/cli.ts` shebang SHALL be `#!/usr/bin/env node` (no `--import` flag). The file SHALL no longer be invoked directly as the bin entry — the loader is supplied by the `bin/pi-dashboard.mjs` wrapper.

#### Scenario: Shebang inspection
- **WHEN** inspecting line 1 of `packages/server/src/cli.ts`
- **THEN** it SHALL read `#!/usr/bin/env node` with no loader flag
