## ADDED Requirements

### Requirement: Frozen primitive key set

The repository SHALL define a frozen set of stable string keys identifying UI primitives the dashboard provides to plugins. The keys SHALL live in `packages/shared/src/dashboard-plugin/ui-primitives.ts` as a `UI_PRIMITIVE_KEYS` const object with `as const` assertion. The initial set SHALL include at minimum:

- `"ui:agent-card"` — agent-shaped card container
- `"ui:markdown-content"` — markdown rendering with code, math, mermaid, tables, lightbox
- `"ui:confirm-dialog"` — modal yes/no confirmation
- `"ui:dialog-portal"` — base modal portal with body-scroll lock
- `"ui:searchable-select-dialog"` — typeahead-filtered selection dialog
- `"ui:zoom-controls"` — zoom in/out/reset button group
- `"ui:format-tokens"` — number-to-human-readable token count
- `"ui:format-duration"` — milliseconds-to-human-readable duration

Adding a new key SHALL be a non-breaking change. Renaming or removing a key SHALL be a breaking change requiring a deprecation cycle (register both old and new keys for at least one minor release with a warning).

#### Scenario: UI_PRIMITIVE_KEYS exists and is frozen

- **WHEN** importing `UI_PRIMITIVE_KEYS` from `@blackbelt-technology/pi-dashboard-shared/dashboard-plugin/ui-primitives`
- **THEN** the import SHALL resolve
- **AND** the imported value SHALL be a const-asserted object with at least the eight keys listed above
- **AND** TypeScript SHALL infer literal-string types for each key value (not generic `string`)

#### Scenario: TypeScript catches misuse of unknown keys

- **WHEN** plugin code calls `useUiPrimitive("ui:nonexistent-thing")`
- **THEN** TypeScript SHALL fail compilation with a type error referencing the `UiPrimitiveKey` union

### Requirement: Typed primitive contract map

`packages/shared/src/dashboard-plugin/ui-primitives.ts` SHALL export a `UiPrimitiveMap` interface mapping each key in `UI_PRIMITIVE_KEYS` to its public contract type. The contract for each primitive SHALL be either a `React.ComponentType<P>` (component primitives) or a function signature (helper primitives).

Contracts:

- `"ui:agent-card"`: `ComponentType<{ name: string; status: string; headerRight?: ReactNode; stats?: ReactNode; onClick?: () => void; selected?: boolean; children?: ReactNode }>`
- `"ui:markdown-content"`: `ComponentType<{ content: string }>`
- `"ui:confirm-dialog"`: `ComponentType<{ message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }>`
- `"ui:dialog-portal"`: `ComponentType<{ children: ReactNode }>`
- `"ui:searchable-select-dialog"`: `ComponentType<{ title: string; options: SelectOption[]; onSelect: (value: string) => void; onCancel: () => void; placeholder?: string; emptyMessage?: string }>`
- `"ui:zoom-controls"`: `ComponentType<{ onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; scale: number }>`
- `"ui:format-tokens"`: `(n: number) => string`
- `"ui:format-duration"`: `(ms: number) => string`

The contract SHALL form the public API of each primitive. Adding optional props is non-breaking. Renaming or removing required props is breaking.

#### Scenario: Type lookup returns the contract type

- **WHEN** plugin code declares `const renderMd: UiPrimitiveMap["ui:markdown-content"] = …`
- **THEN** TypeScript SHALL type-check the value as `ComponentType<{ content: string }>`

#### Scenario: Misregistration fails build

- **WHEN** dashboard code calls `registerUiPrimitive(reg, "ui:markdown-content", (s: number) => s)` (wrong shape)
- **THEN** TypeScript SHALL fail compilation referencing the contract mismatch

### Requirement: Registry creation and registration

`packages/dashboard-plugin-runtime/src/ui-primitive-registry.ts` SHALL export:

- `createUiPrimitiveRegistry(): UiPrimitiveRegistry` — constructs an empty registry.
- `registerUiPrimitive<K extends UiPrimitiveKey>(reg: UiPrimitiveRegistry, key: K, impl: UiPrimitiveMap[K]): void` — registers the impl under the key. Throws if `key` is already registered.

The registry SHALL be a private internal data structure (not a public Map exposed directly). Consumers SHALL access it only through the provider context and the lookup hooks.

#### Scenario: Empty registry creation

- **WHEN** calling `createUiPrimitiveRegistry()`
- **THEN** the call SHALL return a `UiPrimitiveRegistry` instance
- **AND** subsequent `useUiPrimitiveOrNull(key)` calls SHALL return `null` for every key

#### Scenario: Successful registration

- **WHEN** calling `registerUiPrimitive(reg, "ui:format-tokens", (n) => String(n))`
- **THEN** the registration SHALL succeed silently
- **AND** `useUiPrimitive("ui:format-tokens")` (inside `<UiPrimitiveProvider value={reg}>`) SHALL return the registered function

#### Scenario: Double-registration throws

- **WHEN** calling `registerUiPrimitive(reg, "ui:agent-card", AgentCardShellA)` then `registerUiPrimitive(reg, "ui:agent-card", AgentCardShellB)`
- **THEN** the second call SHALL throw an error with a message naming the duplicate key
- **AND** the registry SHALL retain `AgentCardShellA` (first-write-wins)

### Requirement: Provider-context distribution

`packages/dashboard-plugin-runtime/src/ui-primitive-context.tsx` SHALL export `<UiPrimitiveProvider value={registry}>` (a React context provider). The dashboard's `<App>` SHALL be wrapped in this provider in `packages/client/src/main.tsx`. All plugin slot consumers SHALL be descendants of this provider.

#### Scenario: Provider exposes registry to descendants

- **WHEN** a plugin component rendered inside `<UiPrimitiveProvider value={reg}>` calls `useUiPrimitive(key)`
- **THEN** the hook SHALL look up the impl in `reg`

#### Scenario: Hook outside provider throws

- **WHEN** a component calls `useUiPrimitive(key)` outside any `<UiPrimitiveProvider>`
- **THEN** the hook SHALL throw an error with a message reading "useUiPrimitive must be called inside <UiPrimitiveProvider>"

### Requirement: Strict and soft lookup hooks

The runtime SHALL export two lookup hooks with different missing-key behavior:

- `useUiPrimitive<K extends UiPrimitiveKey>(key: K): UiPrimitiveMap[K]` — strict. Throws if the key is not registered.
- `useUiPrimitiveOrNull<K extends UiPrimitiveKey>(key: K): UiPrimitiveMap[K] | null` — soft. Returns `null` if the key is not registered.

The strict hook SHALL be the default plugin authors reach for. The soft hook is for explicit graceful-degradation cases.

#### Scenario: Strict hook returns registered impl

- **WHEN** registry has `"ui:markdown-content"` registered AND a component calls `useUiPrimitive("ui:markdown-content")`
- **THEN** the hook SHALL return the registered React component
- **AND** TypeScript SHALL type the return as `ComponentType<{ content: string }>`

#### Scenario: Strict hook throws on missing key

- **WHEN** registry does NOT have `"ui:agent-card"` registered AND a component calls `useUiPrimitive("ui:agent-card")`
- **THEN** the hook SHALL throw an error with a message naming the missing key (e.g. `"UI primitive 'ui:agent-card' is not registered. Was the dashboard's main.tsx updated to register it?"`)

#### Scenario: Soft hook returns null on missing key

- **WHEN** registry does NOT have `"ui:agent-card"` registered AND a component calls `useUiPrimitiveOrNull("ui:agent-card")`
- **THEN** the hook SHALL return `null`
- **AND** the component SHALL be free to render fallback content

#### Scenario: Per-claim error boundary catches strict-hook throws

- **WHEN** a slot contribution calls `useUiPrimitive(key)` for a missing key inside a slot consumer
- **THEN** the existing per-claim `SlotErrorBoundary` SHALL catch the throw, log the error with plugin id and slot id, and render nothing for that contribution
- **AND** sibling contributions SHALL continue rendering unaffected

### Requirement: Test helper for plugin tests

`packages/dashboard-plugin-runtime/test-support/withUiPrimitiveProvider.tsx` SHALL export a helper that wraps a render in a `<UiPrimitiveProvider>` populated with a partial set of registrations. The helper signature:

```typescript
export function withUiPrimitiveProvider(
  partialImpls: Partial<UiPrimitiveMap>,
  children: React.ReactNode,
): React.ReactElement
```

Plugin tests SHALL use this helper to provide mock implementations of the primitives their tested components consume.

#### Scenario: Helper wraps children in provider with provided impls

- **WHEN** a test calls `render(withUiPrimitiveProvider({ "ui:markdown-content": MockMarkdown }, <ComponentUnderTest />))`
- **THEN** the rendered `<ComponentUnderTest />` SHALL have access to `MockMarkdown` via `useUiPrimitive("ui:markdown-content")`
- **AND** any primitive not in `partialImpls` SHALL throw if accessed via the strict hook (matches production behavior)

### Requirement: Plugins consume primitives via the registry

Plugin source files under `packages/*-plugin/src/` SHALL access registered UI primitives ONLY through `useUiPrimitive(key)` or `useUiPrimitiveOrNull(key)`. Direct imports of registered primitive SYMBOLS from `@blackbelt-technology/pi-dashboard-client-utils/{AgentCardShell,MarkdownContent,ConfirmDialog,DialogPortal,SearchableSelectDialog,ZoomControls,agent-card-utils}` SHALL be forbidden in plugin source.

Direct imports of HOOKS (`useMobile`, `useZoomPan`) and SLOT CONSUMERS (`extension-ui/AgentMetricSlot`, `BreadcrumbSlot`, `GateSlot`) from `@blackbelt-technology/pi-dashboard-client-utils/*` ARE explicitly allowed — hooks cannot be registered (Rules of Hooks) and slot consumers are a different layer.

A repository-level lint test SHALL enforce this rule.

#### Scenario: Lint passes on registry-using plugin

- **WHEN** flows-plugin imports `useUiPrimitive` from `@blackbelt-technology/dashboard-plugin-runtime` and looks up `"ui:markdown-content"` instead of importing `MarkdownContent` directly
- **THEN** the lint test `no-primitive-direct-import.test.ts` SHALL pass

#### Scenario: Lint fails on direct primitive import

- **WHEN** a plugin source file contains `import { MarkdownContent } from "@blackbelt-technology/pi-dashboard-client-utils/MarkdownContent"`
- **THEN** the lint test SHALL fail with a message identifying the file and recommending `useUiPrimitive("ui:markdown-content")`

#### Scenario: Lint allows hook imports

- **WHEN** a plugin source file contains `import { useMobile } from "@blackbelt-technology/pi-dashboard-client-utils/useMobile"`
- **THEN** the lint test SHALL NOT flag this import

#### Scenario: Lint allows slot consumer imports

- **WHEN** a plugin source file contains `import { GateSlot } from "@blackbelt-technology/pi-dashboard-client-utils/extension-ui/GateSlot"`
- **THEN** the lint test SHALL NOT flag this import

### Requirement: Dashboard registers all declared primitives at startup

`packages/client/src/main.tsx` SHALL register an implementation for every key in `UI_PRIMITIVE_KEYS` before mounting `<App>`. The registrations SHALL happen synchronously inside the entry module so plugins encounter a fully-populated registry on first render.

If a future plugin claims a slot whose contribution requires a primitive not yet registered, the strict hook SHALL throw on first render of that contribution — surfacing the missing registration as a build-time concern rather than a silent runtime null.

#### Scenario: All declared keys have registrations

- **WHEN** the dashboard boots and `<App>` mounts
- **THEN** for every key K in `UI_PRIMITIVE_KEYS`, calling `useUiPrimitive(K)` from any descendant SHALL return a non-null impl
- **AND** the type of the impl SHALL match `UiPrimitiveMap[K]`

#### Scenario: Adding a key requires updating main.tsx

- **WHEN** a developer adds a new key to `UI_PRIMITIVE_KEYS` in shared/src/dashboard-plugin/ui-primitives.ts
- **THEN** TypeScript SHALL flag any path where the new key is used via `useUiPrimitive` that has no registration in main.tsx
- **AND** the build SHALL fail until the registration is added

### Requirement: Plugin tarballs do not transitively depend on client-utils for primitive components

After this change lands, `packages/flows-plugin/package.json#dependencies` SHALL NOT contain `@blackbelt-technology/pi-dashboard-client-utils` (because flows-plugin imports primitives only via the registry, not via direct symbol imports). flows-plugin's published tarball SHALL NOT pull the markdown stack (`react-markdown`, `remark-*`, `rehype-*`, `katex`, `react-syntax-highlighter`, `mermaid`) or `@mdi/*` as transitive deps for its primitive needs.

flows-plugin MAY retain a `client-utils` dep IF it imports hooks (e.g. `useMobile`, `useZoomPan`) from there directly. The dep is bounded to hook-shaped imports; primitive-component imports SHALL travel through the registry.

#### Scenario: flows-plugin package.json drops primitive-host dep

- **WHEN** reading `packages/flows-plugin/package.json#dependencies`
- **THEN** the object SHALL NOT contain `@blackbelt-technology/pi-dashboard-client-utils` UNLESS flows-plugin still imports a hook (`useMobile`, `useZoomPan`) directly
- **AND** if the hook dep is retained, the dependency presence SHALL be documented in the package.json with a comment naming the hook(s) that justify it

#### Scenario: pnpm pack confirms tarball is lean

- **WHEN** running `pnpm pack -F flows-plugin --dry-run` after this change lands
- **THEN** the inspected tarball SHALL NOT contain references to `react-markdown`, `mermaid`, or `react-syntax-highlighter` in flows-plugin's own source
- **AND** the dependency list at the top of the tarball metadata SHALL exclude these packages
