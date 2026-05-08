## ADDED Requirements

### Requirement: client-utils package is a published workspace

The repository SHALL contain a workspace package at `packages/client-utils/` published as `@blackbelt-technology/pi-dashboard-client-utils`. The package SHALL be published with `publishConfig.access: "public"` and SHALL participate in the lockstep version scheme defined by `workspace-publishing`. The package's `package.json` SHALL declare:

- `"type": "module"`
- `"files": ["src/"]`
- `peerDependencies` for `react` (`>=18.0.0`) and `react-dom` (`>=18.0.0`)
- `dependencies` for icon support (`@mdi/js`, `@mdi/react`)
- `dependencies` on `@blackbelt-technology/pi-dashboard-shared` at the lockstep version

The package SHALL NOT declare runtime `dependencies` on `react-markdown`, `remark-*`, `rehype-*`, `katex`, `react-syntax-highlighter`, or `mermaid` — those belong to `markdown-content-package`.

#### Scenario: Package directory exists with required structure

- **WHEN** listing `packages/client-utils/`
- **THEN** the directory SHALL contain `package.json`, `tsconfig.json`, and `src/` at minimum
- **AND** `package.json#name` SHALL be `"@blackbelt-technology/pi-dashboard-client-utils"`
- **AND** `package.json#publishConfig.access` SHALL be `"public"`

#### Scenario: Package version matches monorepo lockstep

- **WHEN** the root `package.json` declares version `X.Y.Z`
- **THEN** `packages/client-utils/package.json#version` SHALL equal `X.Y.Z`

#### Scenario: Package does not bundle the markdown stack

- **WHEN** reading `packages/client-utils/package.json#dependencies`
- **THEN** the object SHALL NOT contain `react-markdown`, `remark-gfm`, `remark-math`, `rehype-raw`, `rehype-katex`, `katex`, `react-syntax-highlighter`, or `mermaid`

### Requirement: Per-subpath exports for tree-shaking

The `client-utils` package SHALL declare a per-subpath `exports` map in its `package.json` so that consumers import individual symbols by path and Vite tree-shakes correctly.

The exports map SHALL include at minimum:

- `./AgentCardShell`
- `./agent-card-utils`
- `./DialogPortal`
- `./ConfirmDialog`
- `./SearchableSelectDialog`
- `./ZoomControls`
- `./useZoomPan`
- `./useMobile`
- `./useMediaQuery`
- `./extension-ui/AgentMetricSlot`
- `./extension-ui/BreadcrumbSlot`
- `./extension-ui/GateSlot`
- `./extension-ui/decorator-utils`

The package SHALL NOT export a barrel file (no `"."` entry that re-exports everything) — every consumer SHALL import via a per-symbol subpath.

#### Scenario: Per-subpath exports resolve

- **WHEN** a consumer writes `import { AgentCardShell } from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell"`
- **THEN** the import SHALL resolve to `packages/client-utils/src/AgentCardShell.tsx` (via the workspace symlink in dev or the published tarball)

### Requirement: Source files moved with git history preserved

The source files relocated into `client-utils` SHALL be moved using `git mv` (or an equivalent history-preserving operation), not copied + deleted. Co-located test files SHALL travel with their subjects.

The mandatory move list:

| From `packages/client/src/...` | To `packages/client-utils/src/...` |
|---|---|
| `components/AgentCardShell.tsx` | `AgentCardShell.tsx` |
| `components/agent-card-utils.ts` | `agent-card-utils.ts` |
| `components/DialogPortal.tsx` | `DialogPortal.tsx` |
| `components/ConfirmDialog.tsx` | `ConfirmDialog.tsx` |
| `components/SearchableSelectDialog.tsx` | `SearchableSelectDialog.tsx` |
| `components/ZoomControls.tsx` | `ZoomControls.tsx` |
| `hooks/useZoomPan.ts` | `useZoomPan.ts` |
| `hooks/useMobile.tsx` | `useMobile.tsx` |
| `hooks/useMediaQuery.ts` | `useMediaQuery.ts` |
| `components/extension-ui/AgentMetricSlot.tsx` | `extension-ui/AgentMetricSlot.tsx` |
| `components/extension-ui/BreadcrumbSlot.tsx` | `extension-ui/BreadcrumbSlot.tsx` |
| `components/extension-ui/GateSlot.tsx` | `extension-ui/GateSlot.tsx` |
| `components/extension-ui/decorator-utils.ts` | `extension-ui/decorator-utils.ts` |

Co-located tests that travel with their subjects:

- `hooks/__tests__/useZoomPan.test.ts` → `__tests__/useZoomPan.test.ts`
- `hooks/__tests__/useMobile.test.tsx` → `__tests__/useMobile.test.tsx`
- `components/__tests__/DialogPortal.test.tsx` → `__tests__/DialogPortal.test.tsx`

`useMediaQuery.ts` and `decorator-utils.ts` are explicitly listed because they are required dependencies of moved files (`useMobile` consumes `useMediaQuery`; all three extension-ui slots consume `decorator-utils`).

#### Scenario: git log --follow shows pre-move history

- **WHEN** running `git log --follow packages/client-utils/src/AgentCardShell.tsx`
- **THEN** the output SHALL contain commits authored before this change landed, dated when the file lived at `packages/client/src/components/AgentCardShell.tsx`

### Requirement: Original locations become re-export shims

For every moved file, `packages/client/src/<original-path>` SHALL be replaced with a thin re-export shim that re-exports the same symbols from the new package path. The shim SHALL contain only the re-export statement and a one-line comment indicating the move.

#### Scenario: Shim file exists and is minimal

- **WHEN** reading `packages/client/src/components/AgentCardShell.tsx` after this change lands
- **THEN** the file SHALL contain `export * from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell";` or an equivalent named re-export
- **AND** the file SHALL NOT contain the original component definition
- **AND** the file SHALL NOT exceed 5 lines (excluding comments)

#### Scenario: Internal client imports keep working through shim

- **WHEN** a client file imports `AgentCardShell` from `../components/AgentCardShell` (or an equivalent relative path)
- **THEN** the import SHALL resolve through the shim to the new package
- **AND** TypeScript SHALL not report any error

### Requirement: Plugins import from package name, never via deep relative paths

Source files under `packages/<plugin-name>-plugin/src/` SHALL import `client-utils` symbols via the package name. They SHALL NOT use any path that escapes the plugin package boundary.

A repository-level lint SHALL enforce this rule.

#### Scenario: flows-plugin imports use package name

- **WHEN** scanning `packages/flows-plugin/src/` for imports of moved symbols
- **THEN** every import SHALL use `@blackbelt-technology/pi-dashboard-client-utils/<symbol>` form
- **AND** no import SHALL contain `../../../client/`

#### Scenario: jj-plugin imports use package name

- **WHEN** scanning `packages/jj-plugin/src/` for imports of moved symbols
- **THEN** every import SHALL use `@blackbelt-technology/pi-dashboard-client-utils/<symbol>` form

#### Scenario: Lint fails on a deep relative import regression

- **WHEN** a plugin source file contains `import { X } from "../../../client/src/components/X.js"`
- **THEN** the lint test SHALL fail
- **AND** the failure message SHALL identify the offending file path and the offending specifier
