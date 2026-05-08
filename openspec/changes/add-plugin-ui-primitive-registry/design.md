## Context

Robert's `dashboard-plugin-architecture` (April 2026) defined a slot-based plugin system: plugins ship React components, claim a named slot, and the dashboard renders them. The system has TWO kinds of contributions:

- **First-party plugin** ships React components for slots like `session-card-badge`, `command-route`, `content-view`. Used by jj-plugin (6 claims), demo-plugin (2 claims), flows-plugin (planned 7 claims).
- **Third-party extension** sends descriptors (data-only) for slots like `breadcrumb`, `gate`, `toast`, `footer-segment`, `agent-metric`. Used by `@pi/anthropic-messages`, the OpenSpec activity detector, future user extensions.

Both flow in the **plugin → shell** direction. The plugin is the contributor; the shell is the host.

What's missing is the **shell → plugin** direction: a way for plugins to use rich primitives (markdown rendering, agent cards, dialogs) provided by the dashboard, without importing them by relative path or by package name. Today plugins reach for these primitives via direct npm imports — flows-plugin does this for 11 distinct primitives. The path was made workable by the just-shipped `client-utils` workspace package (commit `e28943a`), but the pattern doesn't scale: every future plugin extraction repeats the same dance.

The deep-import-or-package-name approach has three sustained costs:

1. **Bundle weight.** Each primitive-consuming plugin ships its primitives as transitive deps. flows-plugin's tarball would carry the full markdown stack (~1.1 MB) at install time even though the dashboard already has it loaded. Tree-shaking helps at runtime but not at install.
2. **Promotion ceremony.** When a future plugin needs a not-yet-shared primitive, someone has to extract it into client-utils, update CI publish ordering, update the plugin's deps. Per-primitive churn that grows linearly with plugin count.
3. **Implicit coupling.** Plugin authors form a habit of "let me check what `client-utils` exports." That habit makes the API surface of client-utils into a public contract by accident. Renaming a prop in `MarkdownContent` becomes a coordinated multi-package release.

A registry inverts the relationship. The dashboard registers primitives by stable key at startup; plugins ask for them by key. Plugins ship zero React for the primitives. Adding a primitive is one new key; adding a plugin that uses it is one `useUiPrimitive` call. Renaming a primitive's prop is a contract type change caught at build time.

This proposal builds the smallest viable registry — eight primitives covering the four planned plugin extractions — and migrates flows-plugin as the first consumer.

### Stakeholders

- flows-plugin (the active consumer being migrated).
- The three pending extractions (openspec, git, subagents) — they inherit the registry instead of inventing their own primitive-extraction paths.
- Plugin authors writing future plugins — they get a documented `useUiPrimitive(key)` API instead of "import paths from client-utils".
- The pi-flows cross-repo move — flows-plugin's tarball becomes self-sufficient (no `client-utils` dependency), simplifying the cross-repo migration.

## Goals / Non-Goals

**Goals:**

- Provide a typed, build-time-validated registry of dashboard UI primitives that plugins consume by key.
- Migrate flows-plugin's 11 direct primitive imports to registry lookups, demonstrating the pattern end-to-end.
- Make the four pending plugin extractions (flows already in flight, plus openspec, git, subagents) mechanical: each one claims slots and consumes primitives via the registry. No further package-extraction churn per primitive.
- Eliminate the install-time bundle weight transitive deps: flows-plugin's tarball drops from ~1.5 MB to ~50 KB once the markdown stack is no longer transitive.
- Strict-mode lookup. A missing registration is a hard error at first render, not a silent null.

**Non-Goals:**

- Replacing the slot system. The registry is orthogonal: slots are plugin → shell, registry is shell → plugin. Both stay.
- Hooks in the registry. Rules of Hooks forbid conditional/dynamic hook calls; hooks (useMobile, useZoomPan) stay as direct imports from client-utils.
- Versioned keys. The current scheme uses unversioned keys (`"ui:markdown-content"`). Bumping a primitive's prop signature is a breaking change caught by TypeScript at build time. Versioned keys (`"@2"`) can be added later if cross-version coexistence is needed.
- Runtime plugin install. The registry, like the slot registry, is a build-time + startup-time mechanism.
- Reverting the existing `client-utils` workspace package. It remains the implementation host for the primitives — the dashboard registers components from it. The `client-utils` package's existence is independent of the registry's existence.

## Decisions

### Decision 1: One registry per dashboard instance, populated at startup

**Choice:** A single `UiPrimitiveRegistry` is created in `packages/client/src/main.tsx` and populated synchronously before `<App>` mounts. The registry is exposed via `<UiPrimitiveProvider>` context.

**Rationale:** Registration order doesn't matter (no late-binding service-listener pattern needed). All registrations happen before any plugin renders. Synchronous startup matches the existing slot registry's lifecycle. Plugins authored against this can assume primitives are always available — no probing, no waiting.

**Alternatives considered:**

- *Lazy registration* — primitives registered on first lookup. Rejected: introduces async timing concerns, harder to fail loudly when a primitive is missing.
- *Per-plugin registries* — each plugin gets its own scoped registry. Rejected: defeats the point of "shell provides, plugins consume." All primitives are shell-provided.

### Decision 2: Strict lookup by default, soft variant for explicit fallback

**Choice:** Two hooks in `dashboard-plugin-runtime`:

- `useUiPrimitive(key)` — returns the impl. Throws if not registered. Default for plugin code.
- `useUiPrimitiveOrNull(key)` — returns impl or `null`. For plugins that genuinely want graceful degradation (rare).

**Rationale:** A missing registration is almost always a bug. Silent null leads to blank rendering with no diagnostic. Throwing surfaces the bug at first render with a clear stack trace. The strict hook is the right default; the soft hook exists as an escape hatch.

**Alternatives considered:**

- *Always-soft* — return null, plugin checks. Rejected: every consumer would write boilerplate `if (!impl) return null` and silent failures would multiply.
- *Always-strict* — no soft variant. Rejected: forecloses the (occasional) case where a plugin wants to behave differently when a primitive isn't available.

### Decision 3: Type-safe registration via `UiPrimitiveMap`

**Choice:** The contract types live in `packages/shared/src/dashboard-plugin/ui-primitives.ts`:

```typescript
export const UI_PRIMITIVE_KEYS = {
  markdownContent: "ui:markdown-content",
  agentCard: "ui:agent-card",
  // ...
} as const;

export type UiPrimitiveKey = typeof UI_PRIMITIVE_KEYS[keyof typeof UI_PRIMITIVE_KEYS];

export interface UiPrimitiveMap {
  "ui:markdown-content": React.ComponentType<{ content: string }>;
  "ui:agent-card": React.ComponentType<{ name: string; status: string; /* ... */ }>;
  // ...
}
```

The runtime hook is generic over the key:

```typescript
export function useUiPrimitive<K extends UiPrimitiveKey>(key: K): UiPrimitiveMap[K]
```

TypeScript verifies the registration shape matches the contract; consumers get the correctly-typed impl back.

**Rationale:** Catches misregistrations at build time. Adding a new key requires updating `UiPrimitiveMap`; the type checker forces the dashboard's `main.tsx` to register an impl matching the new contract. No runtime surprise.

**Alternatives considered:**

- *Untyped string lookups* — simpler but loses every type-safety benefit. Rejected.
- *Per-primitive declared interface in each consumer's file* — too much duplication. Centralized contract is the cheaper end state.

### Decision 4: Hooks stay as direct imports

**Choice:** `useMobile`, `useZoomPan`, and similar React hooks are NOT in the registry. flows-plugin keeps direct imports from `@blackbelt-technology/pi-dashboard-client-utils/{useMobile,useZoomPan}`.

**Rationale:** Rules of Hooks require unconditional, top-of-component invocation in the same order every render. A hook returned from `useUiPrimitive()` would be called dynamically — React's hook stack would mis-sequence. Wrapping each hook in a render-prop component is technically possible but changes every consumer's call site significantly:

```typescript
// Today (direct hook import — works):
const { state, handlers } = useZoomPan();

// As registry-wrapped render-prop (works but verbose):
const ZoomPanController = useUiPrimitive("ui:zoom-pan-controller");
return <ZoomPanController>{({state, handlers}) => /* render */}</ZoomPanController>;
```

The verbosity isn't worth the consistency. Plugins document this exception: "components go through registry; hooks stay direct-import."

**Alternatives considered:**

- *Wrap hooks as render-prop components* — see above. Rejected for verbosity.
- *Register hooks as functions, document Rules of Hooks discipline* — too easy to misuse. A typo means runtime crashes that look like React state corruption.

### Decision 5: client-utils stays; the registry layers on top

**Choice:** `packages/client-utils/` (just shipped, commit `e28943a`) keeps its 13 component files and is NOT reverted. The registry uses these files as the implementation source. flows-plugin DROPS the `client-utils` dep for components (gains it back transitively for hooks-only).

**Rationale:** Reverting the just-shipped package would throw away working code and waste the file moves. The package is a fine implementation host. Keeping it serves three purposes:

1. The dashboard's main.tsx imports from it to register primitives. (Direct imports inside a workspace are fine.)
2. The dashboard's own internal usage (ChatView, SessionCard, etc.) continues to import these components directly via the existing re-export shims at `client/src/components/`.
3. Hooks (useMobile, useZoomPan) stay importable from it for plugins that need them — Decision 4.

The package becomes a "primitives implementation library" rather than "a thing plugins import from for components." Plugins still import HOOKS from it, but not COMPONENTS.

**Alternatives considered:**

- *Revert client-utils, move primitives back into packages/client/* — cleaner end state but throws away shipped work. Rejected.
- *Move primitives into a new `packages/dashboard-primitives/` package* — yet another package to maintain. Rejected: client-utils is already the right shape.

### Decision 6: Initial primitive set sized by current+planned consumers

**Choice:** Eight primitives at launch. Sized to cover flows-plugin (current) plus the three pending extractions (openspec, git, subagents). The set:

| Key | Why this primitive |
|---|---|
| `ui:agent-card` | flows + subagents render agent-shaped cards |
| `ui:markdown-content` | flows + openspec + subagents all render markdown |
| `ui:confirm-dialog` | flows + openspec + git all use confirmation flows |
| `ui:dialog-portal` | base primitive used by other dialogs |
| `ui:searchable-select-dialog` | flows (action menu), git (branch picker) |
| `ui:zoom-controls` | flows (FlowGraph zoom) |
| `ui:format-tokens` | flows + subagents both render token counts |
| `ui:format-duration` | flows + subagents both render durations |

**Rationale:** Larger initial set means more keys to design carefully now and more primitives the dashboard must register. Smaller set means future plugins keep adding keys, more cross-file coordination over time.

Eight is the smallest set that lets all four planned plugin extractions consume the registry without each one having to add new keys. New keys CAN be added in follow-ups when a future need arises; the framework supports it. But the eight here are confirmed needs from concrete proposals.

**Alternatives considered:**

- *Three primitives (just flows-plugin's most-used)* — rejected. The other three extractions then have to amend their proposals to add more keys.
- *Twenty primitives (every component in client-utils)* — rejected. Most primitives only have one consumer; YAGNI.

### Decision 7: Strict lint blocks plugin code from importing primitives directly

**Choice:** New repo-lint `packages/shared/src/__tests__/no-primitive-direct-import.test.ts`. Scans `packages/*-plugin/src/`. Fails CI when any of the eight primitive symbol names is imported from `@blackbelt-technology/pi-dashboard-client-utils/*`. Hook imports (`useMobile`, `useZoomPan`) and slot consumer imports (`extension-ui/*`) are explicitly allowed.

**Rationale:** Without the lint, plugin authors will keep importing primitives directly because it works. The registry pattern only delivers benefit when EVERY plugin uses it. The lint enforces the rule at PR time, before merge.

**Alternatives considered:**

- *Documentation-only* — relies on plugin authors knowing the rule. Doesn't survive contributor turnover.
- *Lint warns instead of fails* — warnings get ignored. CI failure is the only forcing function.

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| **flows-plugin tests need provider wrapping.** Existing test renders that mount flow components will throw on the strict hook. | Medium | Ship `withUiPrimitiveProvider(impls)` test helper in the same change. Update flows-plugin tests in the same change to use it. The throw is loud and fixes itself once the wrapper is added. |
| **Plugin author confusion: "registry vs slot vs direct import."** Three patterns now exist for "how does my plugin reach UI." | Medium | `docs/plugin-ui-primitives.md` explicitly documents which pattern fits which situation: slots for plugin→shell contributions, registry for shell→plugin primitives, direct imports for hooks (Rules of Hooks exception). |
| **Adding a new primitive requires coordinated changes** (`UiPrimitiveMap` + main.tsx + lint allow-list). | Low | The coordination is small (3 files, ~10 LOC each). Documented in plugin-ui-primitives.md. New plugin extractions trigger new primitives; the workflow is well-defined. |
| **Plugin breakage on dashboard upgrade if the registry signature changes.** Renaming `ui:markdown-content` to `ui:markdown` would silently break plugins built on the old key. | Low | Add a CHANGELOG entry and a deprecation cycle (register both keys for one minor release, log a warning when the old key is used, remove in the following minor). The frozen-keys discipline mirrors slot-id versioning. |
| **The existing client-utils package becomes underused.** It still hosts the implementations but plugins no longer import components from it (only hooks). | Low | Acceptable. `client-utils` remains the right place for components that the dashboard registers and for hooks that plugins import directly. If a future evolution wants to fold client-utils into shared or split it, that's a separate change. |
| **Test coverage growth.** The registry needs its own test surface (registration, lookup, double-registration error, missing-key error, strict vs soft). | Low | One new test file with ~10 cases. Standard React+vitest patterns. |
| **Lint false-positives on legitimate intra-client-utils usage.** The lint scans plugin source; it doesn't apply to `packages/client-utils/` itself. Components there can freely import each other. | Low | Lint scope is `packages/*-plugin/src/` only. Verified during implementation. |

## Migration Plan

### Sequencing inside this change

```
   1. Define contracts (shared/dashboard-plugin/ui-primitives.ts)
      ├─ UI_PRIMITIVE_KEYS const
      └─ UiPrimitiveMap interface

   2. Build runtime (dashboard-plugin-runtime/ui-primitive-registry.ts +
                     ui-primitive-context.tsx)
      ├─ createUiPrimitiveRegistry()
      ├─ registerUiPrimitive(reg, key, impl)
      ├─ <UiPrimitiveProvider>
      ├─ useUiPrimitive(key) — strict
      ├─ useUiPrimitiveOrNull(key) — soft
      └─ withUiPrimitiveProvider() test helper

   3. Tests for the runtime (~10 cases)

   4. Wire dashboard registrations (client/src/main.tsx)
      ├─ create registry
      ├─ register 8 primitives from client-utils + MarkdownContent
      └─ wrap <App> in <UiPrimitiveProvider>

   5. Migrate flows-plugin
      ├─ rewrite 11 imports to useUiPrimitive lookups
      ├─ drop client-utils dep from flows-plugin/package.json
      ├─ update flows-plugin tests to use withUiPrimitiveProvider
      └─ verify all test files render correctly

   6. Add lint (no-primitive-direct-import.test.ts)
      ├─ implements the scan
      ├─ verifies flows-plugin passes
      └─ verifies inverse (planted bad import fails the lint)

   7. Document (docs/plugin-ui-primitives.md, AGENTS.md row)

   8. Verification
      ├─ npm run build clean
      ├─ npm test all green
      ├─ pnpm pack flows-plugin → no client-utils transitive component deps
      └─ Vite dev smoke: open dashboard, render a flow, verify identical UX
```

### Rollback strategy

The change is divided into independently revertible commits by phase. If migration breaks production:
- Revert phase 5 (flows-plugin migration) — flows-plugin returns to direct imports; registry exists but unused. No user-visible regression.
- Revert phases 1-4 (registry itself) — clean removal; no dependencies linger.

### Coordination with concurrent work

- **Superseded change `complete-flows-plugin-migration`** — its proposal is annotated SUPERSEDED at top, its Layer 1 commit (predicate emission + sync-versions) stands, its Layer 0a commit (client-utils package) is repurposed by this change. Archive after this lands.
- **Three pending extractions** — extract-openspec-as-plugin, extract-git-as-plugin, extract-subagents-as-plugin. Each will be amended to depend on this change and use the registry. Out of scope for this proposal.
- **pi-flows cross-repo move** — flows-plugin's tarball drops the client-utils dep, simplifying the cross-repo move. Out of scope here.

## Open Questions

- **Should `format-tokens` and `format-duration` be primitives at all?** They're pure functions, not React components. Could just be plain helpers exported from a public location. Including them in the registry is consistent (one mechanism for everything plugins need from the dashboard) but slightly overkill for two formatters. **Decision deferred to spec phase**: include them or move them to a separate "shared formatters" export. Pragmatic recommendation: include them for now; collapse later if pattern proves overkill.
- **Should the registry support listener notifications?** Slots have an event-listener model implicitly via React's render. Registry primitives are static once registered. If a future plugin wants to react to "MarkdownContent's behavior changed mid-session", that's not supported. Not a current need.
- **Should the registry be exposed via REST `/api/health`?** Slot registrations are reported in `/api/health.plugins[]`. Should the registry's registered primitives be visible there too? **Recommendation**: yes, eventually, but it's a small follow-up. Not blocking.
