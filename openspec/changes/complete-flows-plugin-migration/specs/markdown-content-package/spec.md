## ADDED Requirements

### Requirement: markdown-content package is a published workspace

The repository SHALL contain a workspace package at `packages/markdown-content/` published as `@blackbelt-technology/pi-dashboard-markdown-content`. The package SHALL be published with `publishConfig.access: "public"` and SHALL participate in the lockstep version scheme.

The package's `package.json` SHALL declare:

- `"type": "module"`
- `"files": ["src/"]`
- `peerDependencies` for `react` (`>=18.0.0`) and `react-dom` (`>=18.0.0`)
- `dependencies` for the markdown rendering stack: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-raw`, `rehype-katex`, `katex`, `react-syntax-highlighter`, `@mdi/js`, `@mdi/react`
- `dependencies` on `@blackbelt-technology/pi-dashboard-shared` (types) and `@blackbelt-technology/pi-dashboard-client-utils` (`DialogPortal`, `useZoomPan`, `ZoomControls` consumed inside `ImageLightbox` / `MermaidBlock`)
- `dependencies` on `mermaid` for diagram rendering (loaded dynamically)

#### Scenario: Package directory exists with required structure

- **WHEN** listing `packages/markdown-content/`
- **THEN** the directory SHALL contain `package.json`, `tsconfig.json`, and `src/` at minimum
- **AND** `package.json#name` SHALL be `"@blackbelt-technology/pi-dashboard-markdown-content"`

#### Scenario: Package depends on client-utils

- **WHEN** reading `packages/markdown-content/package.json#dependencies`
- **THEN** the object SHALL contain `"@blackbelt-technology/pi-dashboard-client-utils": "^X.Y.Z"` matching the lockstep version

#### Scenario: Package version matches monorepo lockstep

- **WHEN** the root `package.json` declares version `X.Y.Z`
- **THEN** `packages/markdown-content/package.json#version` SHALL equal `X.Y.Z`

### Requirement: Per-subpath exports

The `markdown-content` package SHALL declare a per-subpath `exports` map. The exports map SHALL include at minimum:

- `./MarkdownContent`
- `./ThemeProvider`
- `./SessionAssetsContext`
- `./CopyButton`
- `./MermaidBlock`
- `./ImageLightbox`
- `./syntax-theme`
- `./useTheme`

#### Scenario: Per-subpath exports resolve

- **WHEN** a consumer writes `import { MarkdownContent } from "@blackbelt-technology/pi-dashboard-markdown-content/MarkdownContent"`
- **THEN** the import SHALL resolve to `packages/markdown-content/src/MarkdownContent.tsx`

### Requirement: Source files moved with git history preserved

The source files relocated into `markdown-content` SHALL be moved using `git mv` (or an equivalent history-preserving operation), not copied + deleted. Co-located test files SHALL travel with their subjects.

The mandatory move list:

| From `packages/client/src/...` | To `packages/markdown-content/src/...` |
|---|---|
| `components/MarkdownContent.tsx` | `MarkdownContent.tsx` |
| `components/ThemeProvider.tsx` | `ThemeProvider.tsx` |
| `components/CopyButton.tsx` | `CopyButton.tsx` |
| `components/MermaidBlock.tsx` | `MermaidBlock.tsx` |
| `components/ImageLightbox.tsx` | `ImageLightbox.tsx` |
| `lib/SessionAssetsContext.tsx` | `SessionAssetsContext.tsx` |
| `lib/syntax-theme.ts` | `syntax-theme.ts` |
| `hooks/useTheme.ts` | `useTheme.ts` |

Co-located test that travels:

- `components/__tests__/MarkdownContent.test.tsx` → `__tests__/MarkdownContent.test.tsx`

`ThemeProvider`, `SessionAssetsContext`, `CopyButton`, `MermaidBlock`, `ImageLightbox`, `syntax-theme`, and `useTheme` are listed because `MarkdownContent` directly consumes all of them and they have no other consumers in the dashboard shell that would prefer a different layering.

#### Scenario: git log --follow shows pre-move history

- **WHEN** running `git log --follow packages/markdown-content/src/MarkdownContent.tsx`
- **THEN** the output SHALL contain commits authored before this change landed

### Requirement: Original locations become re-export shims

For every moved file, `packages/client/src/<original-path>` SHALL be replaced with a thin re-export shim.

#### Scenario: MarkdownContent shim exists

- **WHEN** reading `packages/client/src/components/MarkdownContent.tsx` after this change lands
- **THEN** the file SHALL contain `export * from "@blackbelt-technology/pi-dashboard-markdown-content/MarkdownContent";`
- **AND** the file SHALL NOT contain the original component definition

#### Scenario: 14 dashboard-side imports keep working through shims

- **WHEN** building the dashboard client after this change lands
- **THEN** every existing internal import of `MarkdownContent` (in `ChatView`, `PackageReadmeDialog`, `WhatsNewDialog`, `DiagnosticsSection`, `ThinkingBlock`, `MarkdownPreviewView`, `SkillInvocationCard`, `interactive-renderers/*`, `tool-renderers/*`) SHALL resolve through the shim
- **AND** the build SHALL succeed without modifying any of these files

### Requirement: flows-plugin uses markdown-content for rich text rendering

The `flows-plugin` source files that render markdown (`FlowAgentDetail.tsx`, `FlowArchitect.tsx`) SHALL import `MarkdownContent` from `@blackbelt-technology/pi-dashboard-markdown-content/MarkdownContent` (not via deep relative paths).

`flows-plugin`'s `package.json` SHALL declare `@blackbelt-technology/pi-dashboard-markdown-content` as a runtime `dependency`.

#### Scenario: flows-plugin's MarkdownContent imports use package name

- **WHEN** scanning `packages/flows-plugin/src/` for imports of `MarkdownContent`
- **THEN** every import SHALL use `@blackbelt-technology/pi-dashboard-markdown-content/MarkdownContent`
- **AND** no import SHALL reference `../../../client/`

#### Scenario: jj-plugin does NOT depend on markdown-content

- **WHEN** reading `packages/jj-plugin/package.json#dependencies`
- **THEN** the object SHALL NOT contain `@blackbelt-technology/pi-dashboard-markdown-content` (jj-plugin does not import any markdown-content symbol)
- **AND** jj-plugin's installation footprint SHALL NOT include the markdown rendering stack
