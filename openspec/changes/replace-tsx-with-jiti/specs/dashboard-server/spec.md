## ADDED Requirements

### Requirement: CLI bin entry resolves jiti at runtime (no tsx fallback)
The `pi-dashboard` CLI entry point SHALL be a plain JavaScript file (`packages/server/bin/pi-dashboard.mjs`) that resolves jiti at runtime via `resolveJitiImport()` and re-execs Node with `--import <jiti-url> packages/server/src/cli.ts <args>`. There SHALL be no tsx fallback path. When jiti cannot be resolved, the wrapper SHALL exit 1 with a stderr message instructing the user to install pi.

#### Scenario: Direct CLI invocation with pi available
- **WHEN** a user runs `pi-dashboard status` from a shell with pi reachable on the module graph
- **THEN** the wrapper SHALL resolve jiti and exec `node --import <jiti-url> packages/server/src/cli.ts status`, forwarding stdio and the child's exit code

#### Scenario: Direct CLI invocation without pi
- **WHEN** a user runs `pi-dashboard status` and `resolveJitiImport()` cannot resolve a jiti package
- **THEN** the wrapper SHALL print `pi-dashboard: cannot find jiti. Install pi: 'npm install -g @earendil-works/pi-coding-agent'` to stderr and exit 1
- **AND** SHALL NOT attempt to resolve `tsx` or any other TypeScript loader

### Requirement: CLI shebang is loader-agnostic
The `packages/server/src/cli.ts` shebang SHALL be `#!/usr/bin/env node` (no `--import` flag). The file SHALL no longer be invoked directly as the bin entry — the loader is supplied by the `bin/pi-dashboard.mjs` wrapper.

#### Scenario: Shebang inspection
- **WHEN** inspecting line 1 of `packages/server/src/cli.ts`
- **THEN** it SHALL read `#!/usr/bin/env node` with no loader flag

### Requirement: Bootstrap install lists exclude tsx
Every install list that seeds packages into `~/.pi-dashboard/node_modules/` SHALL NOT include `"tsx"`. The five known lists (`packages/server/src/cli.ts:255`, `packages/server/src/server.ts:802`, `packages/electron/src/lib/dependency-installer.ts:260`, `packages/electron/src/lib/power-user-install.ts:42`, `packages/shared/src/bootstrap-install.ts:216`) SHALL each contain only `@earendil-works/pi-coding-agent` and `@fission-ai/openspec` (plus any future non-loader packages).

#### Scenario: Fresh install does not write tsx to managed dir
- **WHEN** any install path completes for a clean `~/.pi-dashboard/`
- **THEN** `~/.pi-dashboard/node_modules/tsx` SHALL NOT exist
- **AND** `~/.pi-dashboard/node_modules/@earendil-works/pi-coding-agent` SHALL exist (or the legacy `@mariozechner/pi-coding-agent` for older configs)

### Requirement: Doctor does not probe for tsx
Electron Doctor (`packages/electron/src/lib/doctor.ts`) SHALL NOT execute `where tsx` / `which tsx` and SHALL NOT report a "No tsx binary" detail string. Doctor's "Server launch test" reduces to checking `node` + pi.

#### Scenario: Doctor output omits tsx
- **WHEN** Doctor runs against a clean install
- **THEN** no diagnostic row mentions tsx
- **AND** the server-launch-test row passes when `node` + pi are present
