## Context

`flows-plugin` is currently a half-extracted package: physically relocated to `packages/flows-plugin/` in April but functionally still entangled with the dashboard shell on three independent axes (CI fragility, broken predicate emission, content-slot architectural block).

This change ships **four sequenced layers** that resolve all three. **Layer 1 has already shipped** in commit `80c99ce` (vite-plugin predicate emission + sync-versions hardening). The remaining work is Layers 0, 2, 3, and 4.

### Layer numbering — read this first

The numbering reflects dependency direction, not implementation order:

```
   Layer 0 — Foundation: kill deep imports
     Extract shared client utilities into TWO published workspace
     packages so flows-plugin and jj-plugin import via npm names
     instead of cross-package relative paths. PREREQUISITE for everything.

   Layer 1 — Plugin runtime bug fixes  ✅ SHIPPED (commit 80c99ce)
     Vite plugin emits predicates; sync-versions hardened.

   Layer 2 — Plugin internals
     Adapt flow components to {session} signatures. Create contexts.
     Restore manifest claims. Bridge augments DashboardSession.

   Layer 3 — Dashboard shell surgery
     Deduplicate flow JSX in App.tsx. Wrap context providers.
     Remove direct flow imports. Without this, Layer 2's claims do
     nothing — App.tsx still hard-wires the components.

   Layer 4 — Verification + docs
```

Layer 1 is independent and was shipped first because it's risk-free and unblocked downstream design choices. Layers 0 → 2 → 3 → 4 must land in order.

### Current state (2026-05-08)

```
   ┌──────────────────────────────────────────────────────────────────┐
   │  flows-plugin/                                                    │
   │    ├─ src/client/*.tsx     ◄── 13 deep relative imports          │
   │    │                            "../../../client/src/..." form  │
   │    │                            (works in monorepo, breaks       │
   │    │                            in node_modules tarball)         │
   │    │                                                              │
   │    ├─ src/flow-reducer.ts  ◄── still imported by shell's        │
   │    ├─ src/architect-reducer.ts  event-reducer.ts (workspace     │
   │    │                            import; this stays as-is)        │
   │    │                                                              │
   │    └─ package.json#claims: []  ◄── manifest claims deferred;    │
   │                                    direct JSX in App.tsx and    │
   │                                    SessionCard.tsx fills the    │
   │                                    gap                          │
   │                                                                   │
   │  packages/client/src/App.tsx                                     │
   │    ├─ FlowDashboard rendered 2× (lines 1053, 1094)               │
   │    ├─ FlowArchitect rendered 3× (lines 1020, 1040, 1081)        │
   │    └─ ~250 LOC of flow-related conditionals + callbacks          │
   │                                                                   │
   │  vite-plugin (Layer 1, shipped)                                  │
   │    ├─ ✅ emits predicates as named imports                        │
   │    └─ ✅ build-time validation of manifest references            │
   │                                                                   │
   │  scripts/sync-versions.js (Layer 1, shipped)                     │
   │    └─ ✅ preserves non-semver overrides                          │
   └──────────────────────────────────────────────────────────────────┘
```

### Constraints

- **Frozen slot prop contracts (v0.x).** Adding fields to `DashboardSession` is not a slot-contract change. Extending slot prop signatures *would* be — explicitly avoided.
- **Single repo.** Cross-repo move to pi-flows is out of scope.
- **No protocol breakage.** New session fields must be optional.
- **Bridge process owns flow-state truth.** The flow event listener already runs in the bridge and produces `FlowState`/`ArchitectState`. The shell currently re-derives this from forwarded events; the bridge can carry the computed state directly via the existing session payload.
- **Plugins are publicly published to npm.** They have `publishConfig.access: "public"`. They're meant to be installable as `npm install @blackbelt-technology/pi-dashboard-*-plugin`. This rules out monorepo-only solutions like TypeScript path aliases as the sole strategy — the published tarballs must resolve correctly without a monorepo around them.

### Stakeholders

- Dashboard release process (CI breakage on every post-release `develop` push).
- Plugin authors (jj-plugin gets retroactive predicate filtering once Layer 0 lands; future plugins inherit a clean slot contract).
- Future cross-repo move to pi-flows (leaves flows-plugin in a state where the move is a `git mv` of working code, not a refactor of broken code).

## Goals / Non-Goals

**Goals:**

- End the CI publish/republish hazard caused by deep relative imports across the plugin/client boundary. Permanent fix, not another quickfix pin.
- Make `flows-plugin`'s manifest claims fully wired and rendered through the slot system, including the heavy components (`FlowDashboard`, `FlowArchitect`, `FlowAgentDetail`, `FlowArchitectDetail`, `FlowSummary`).
- Retire the duplicated flow JSX in `App.tsx` (3× FlowArchitect, 2× FlowDashboard) so a single slot consumer call replaces N conditional branches.
- Reach a state where the only blocker between this repo and the pi-flows cross-repo move is the React build pipeline in pi-flows itself — not architectural debt in the plugin code.

**Non-Goals:**

- Cross-repo move to pi-flows. pi-flows has zero React tooling; standing that up is independently large.
- Pluggable reducer registry. The shell's `event-reducer.ts` keeps importing `reduceFlowEvent` / `reduceArchitectEvent` from `flows-plugin` (workspace import).
- Hard-cut elimination of `packages/client/src/components/{moved files}`. They become re-export shims; downstream client imports keep working without churn.
- Slot prop contract changes. The frozen v0.x contracts are preserved exactly. The augmentation rides through `DashboardSession`.
- Protocol-level changes. No new gateway message types, no new REST endpoints.
- Full UI library extraction (Path Y). Possible future evolution, not this change.

## Decisions

### Decision 1: Bundle the remaining work into one coordinated landing

**Choice:** Land Layer 0 (client-utils + markdown-content) + Layer 2 (plugin internals) + Layer 3 (shell surgery) in a single change. Layer 1 already shipped separately.

**Rationale:** Layers 0, 2, and 3 have hard dependencies:
- Layer 0 must land before Layer 2 — flows-plugin's components can't be safely refactored while their imports still cross-package-leak.
- Layer 2 must land before Layer 3 — App.tsx can't switch to slot consumers until the components support `{session}` signatures.
- Layer 3 must land with Layer 2 — Layer 2's claims are inert without the shell removing direct imports.

Splitting them across releases recreates each individual failure mode in turn.

**Alternatives considered:** Three sequential changes — viable but each release between landings is fragile. Rejected.

### Decision 2: Two packages — `client-utils` + `markdown-content`

**Choice:** Layer 0 creates two workspace packages, not one:

```
   client-utils         ─ small, low-dep utilities
                          (~14 source files; React + @mdi only)
                          consumed by every plugin

   markdown-content     ─ MarkdownContent + its tendrils
                          (~8 source files; markdown stack: react-markdown,
                          remark-*, rehype-*, katex, syntax-highlighter,
                          mermaid; ~1.1 MB at install)
                          consumed only by plugins that render markdown
                          depends on client-utils for primitives
                          (DialogPortal, useZoomPan, ZoomControls)
```

**Rationale:** `MarkdownContent` is heavy (~1.1 MB of npm deps via `react-markdown`/`rehype-katex`/`mermaid`/`react-syntax-highlighter`). It's used by `flows-plugin` (in `FlowAgentDetail` and `FlowArchitect`) but NOT by `jj-plugin`. With one combined package, jj-plugin's `node_modules` would carry the markdown tree at install time even though it never imports markdown rendering. The split keeps jj-plugin (and any future settings-only plugin) light.

The cost is two packages instead of one, but the boundaries are crisp:
- A plugin's `package.json` directly tells you whether it renders markdown (presence/absence of the `markdown-content` dep).
- Future plugins only opt into `markdown-content` if they actually need it.
- Bundle size: per-subpath exports + Vite tree-shaking handle runtime cost. The split solves install-time cost.

**Alternatives considered:**

- *One combined package* — simpler ceremony but jj-plugin and future plugins pay markdown's install cost. Rejected.
- *MarkdownContent stays in `packages/client/`, flows-plugin renders agent text as plain* — eliminates the heavy package entirely but degrades flow agent UX. Rejected because flow agent output is meaningfully markdown today (code blocks, structured tool output).
- *Full UI extraction (`packages/ui` containing all 60+ shared components)* — solves the "promotion ceremony per new plugin" problem permanently, but tripled the change scope. Deferred to a possible future change. The current two-package split is the standard industry pattern (validated against Nx / pnpm / DigitalOcean monorepo guides).

### Decision 3: Add flow state to `DashboardSession` (Path A)

**Choice:** Bridge populates optional `flowState`, `flowStates`, `architectState` fields on the session object. Components self-derive from `session.flowState` etc.

**Rationale:** Three paths were considered:

```
   PATH A — extend DashboardSession                  ✅ chosen
     - bridge fills flowState/architectState
     - components read session.flowState
     - slot props unchanged (still {session})
     - additive: new fields are optional

   PATH B — extend slot prop contracts              ❌ rejected
     - slot consumers pass extra typed payloads
     - breaks frozen v0.x slot contract
     - cascades across all plugins

   PATH C — keep direct JSX                          ❌ rejected
     - "give up" on Layer 2 for content slots
     - eternal hard-coded conditional in App.tsx
     - Layer 3 cross-repo move blocked
```

`FlowState` and `ArchitectState` already live in `packages/shared/src/types.ts:547+` and `:620+` (verified). They were added in earlier work but never made it onto `DashboardSession`. This change makes the connection. No new types; a structural fit that's already half-done.

The bridge already computes `FlowState` per session. Folding it into the session payload is plumbing, not architecture. Older browser tabs ignore the new fields gracefully.

### Decision 4: Two contexts, not one, for callbacks

**Choice:** Two React contexts — `FlowsActionsContext` (per-session-card, carries `flows[]`/`commands[]`/`onFlowAction`) and `FlowActionsContext` (per-active-session, carries the eight flow-control callbacks).

**Rationale:** Different lifecycles and scopes:
- `FlowsActionsContext` data is bulk (all flows defined for the session, command catalog) and per-session-card. Provider wraps `SessionList`/`SessionCard`.
- `FlowActionsContext` is per-active-session-content (callbacks fire only for the active session). Provider wraps the per-session content area.

Combining into a single context forces inactive session cards to re-render when active-session callback identity changes. Two contexts → React's `useContext` only invalidates consumers that actually subscribe.

**Alternatives considered:** Single unified `FlowsContext` — simpler API, worse perf with 50+ session cards mounted. Rejected.

### Decision 5: Re-export shims, not hard-cut, for client-utils + markdown-content

**Choice:** When files move from `packages/client/src/{components,hooks}/...` to `packages/client-utils/src/...` or `packages/markdown-content/src/...`, the original location becomes a thin re-export shim:

```typescript
// packages/client/src/components/AgentCardShell.tsx (post-migration)
export * from "@blackbelt-technology/pi-dashboard-client-utils/AgentCardShell";
```

**Rationale:**

- 55 dashboard-side imports already resolve through the original locations. A hard-cut means 55 import-line edits in one PR — mechanical but adds review surface to a change already touching ~30 files.
- Shims are stable contracts — once written, they don't churn unless the underlying signature changes. They are 1-line files.
- Removes review pressure: shell's import paths stay the same, so reviewers focus on the new packages + plugin re-imports.

**Alternatives considered:**

- *Hard-cut* — cleaner end state but doubles the diff surface and risks merge conflicts with parallel work. Rejected.
- *Mixed* — hard-cut high-volume imports (MarkdownContent 14, DialogPortal 14, useMobile 9 = 37 sites), keep shims for low-volume. Rejected: introduces an inconsistent rule future authors must learn.

### Decision 6: Predicate emission via named import + build-time validation (Layer 1, shipped)

Already shipped in commit `80c99ce`. Documented here for completeness.

### Decision 7: Deduplicate flow JSX before extracting to slots

**Choice:** First commit deduplicates the 3× FlowArchitect / 2× FlowDashboard rendering in App.tsx into single conditional rendering blocks. Second commit replaces those blocks with slot consumer calls.

**Rationale:** The three FlowArchitect call sites have **subtle differences** in `onDismiss` reset behavior:

```
   App.tsx:1020 (architect-detail-open branch)
     onDismiss = () => { selectedId && send(...dismiss...) }

   App.tsx:1040 (flow-detail-agent-open branch, nested)
     onDismiss = () => { setFlowDetailAgent(null); selectedId && send(...) }

   App.tsx:1081 (default branch, neither open)
     onDismiss = () => { selectedId && send(...) }
```

Slot-migrating each branch separately would carry the divergence into the plugin layer (slot consumer renders three times conditionally, each with a different props closure). Dedup-first means a single FlowArchitect render with a single closure that reads the same state used in the conditionals — simpler component, simpler slot consumer.

A parity test (`packages/client/src/__tests__/flow-rendering-parity.test.tsx`) must run before and after dedup to confirm rendering output matches.

**Alternatives considered:** *Migrate slots first, dedup later* — rejected. Risky; duplicates the deferred-cleanup pattern that left flows-plugin half-extracted in the first place.

### Decision 8: Keep flow reducers as workspace import

**Choice:** `event-reducer.ts` continues to do `import { reduceFlowEvent, isFlowEvent } from "@blackbelt-technology/pi-dashboard-flows-plugin/reducer"`. The shell statically depends on flows-plugin's reducer.

**Rationale:** A pluggable reducer registry would be a major architectural change this migration doesn't need. The shell's reducer dispatch is `if (isFlowEvent(e)) state = reduceFlowEvent(state, e)` — a static workspace import keeps that working with zero runtime indirection. The bridge populates `session.flowState` from the same reducer, so the rendering side has the data it needs via `DashboardSession`. Reducer dispatch and rendering layers are decoupled even though both reference the plugin package.

**Alternatives considered:** *Plugin reducer registry* — out of scope. Rejected for this change.

### Decision 9: Three build-pipeline locations need explicit updates

**Choice:** The change explicitly updates three build-pipeline files that aren't auto-discovered:

1. `packages/electron/scripts/bundle-server.mjs` — four hardcoded lists of `["server", "shared", "extension"]`. Add `client-utils` and `markdown-content`.
2. `.github/workflows/publish.yml` — `PACKAGES` array enforces publish ORDER. Add `client-utils` and `markdown-content` BEFORE `flows-plugin` and `jj-plugin`.
3. `packages/client/vite.config.ts` — add path aliases for both new packages so Vite resolves to source `.ts/.tsx` files in dev (matching the existing alias pattern for `pi-dashboard-shared`).

**Rationale:** Investigation surfaced these as silent-failure points. TypeScript's `include` patterns, npm workspaces, and `sync-versions.js` all auto-discover new packages. The three above don't. Missing #1 means the Electron build silently doesn't bundle the new packages and fails at runtime. Missing #2 means the publish step silently skips them. Missing #3 means dev-mode HMR breaks for client-utils edits.

### Decision 10: Test mock-path resilience via shims

**Choice:** Don't migrate `vi.mock("../../hooks/useMobile.js", ...)` paths in 10+ test files. The shim chain saves them — mocking the shim is equivalent to mocking the real module.

**Rationale:** Investigation surfaced that ~10 client-side test files mock the moving files. The shim approach means the original `packages/client/src/hooks/useMobile.tsx` location still exists (as a shim re-exporting from `@blackbelt-technology/pi-dashboard-client-utils/useMobile`). Vitest's `vi.mock("../../hooks/useMobile.js")` matches the shim's path; the mock applies. The real underlying module is never touched at runtime in those tests.

The single risk is dynamic `vi.doMock` calls in `SessionHeader.attached-proposal-summary.test.tsx` and `SessionHeader.resume.test.tsx`. Those need explicit verification that the dynamic re-mock still resolves through the shim chain.

**Alternatives considered:** *Migrate all mock paths to use the package name* — would be cleaner but requires touching 10+ test files in a separate concern. Out of scope here; shim-based resilience is sufficient.

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| **Triple-rendering dedup breaks edge cases.** Three FlowArchitect call sites have subtle prop differences. Collapsing them could regress UX. | Medium | Parity test snapshots all three states before dedup, re-runs after. Plus manual gate task for "open flow detail, dismiss summary, drill-down clears". |
| **Bridge augmentation lost on reconnect.** A flow active on session X must still appear when the browser reconnects mid-flow. | Medium | Server's `sessions_snapshot` rebuilds from `MemorySessionManager` (latest bridge push). Test: kill browser → bridge keeps running → reconnect → first snapshot must contain `session.flowState`. |
| **Underestimated file list.** Original "12 files" in the brief was incomplete. Investigation found 17 files needed (12 + useMediaQuery + decorator-utils + 3 from markdown-content's tendrils). | Low | Tasks.md and specs explicitly enumerate the full list. |
| **Mock-path silent regression.** 10+ test files use `vi.mock` on moving files. Re-export shims keep them working but require explicit verification on dynamic `vi.doMock` cases. | Low | Layer 0 verification tasks include running the SessionHeader.* tests after shim creation; failure surfaces immediately. |
| **plugin-registry.tsx absolute paths churn.** Pre-existing issue: the generated registry has machine-specific absolute paths committed to git. Layer 0 doesn't make this worse but every regeneration creates noise. | Low | Out of scope. Documented as a separate concern. Future change can address. |
| **bundle-server.mjs hidden dependency.** Four hardcoded lists. Missing one means silent Electron-runtime failure. | Medium | Decision 9 explicitly enumerates the three pipeline locations. Tasks include updating all four lists. |
| **Re-export shims hide the layering shift.** Future contributors might re-add code into the original location not realizing it's now a shim. | Low | New `no-cross-package-deep-imports` lint catches the inverse error (plugins importing back into client/). Shim files contain a 1-line comment noting the move. |
| **CI publish ordering misconfigured.** A misconfigured workflow step republishes a dependent before its dependencies. | Medium | The contract test `publish-workflow-contract.test.ts` pins the order: client-utils → markdown-content → plugins. Failing test = failing PR. |
| **DashboardSession size grows.** Three new optional fields → larger WS payloads. | Low | Fields are optional and only populated when a flow is active. Snapshot delta diffing on the client side already exists. Worst case bounded by flow agent count. |
| **Markdown stack at install time.** ~1.1 MB of deps moves with `markdown-content`. | Low | Two-package split (Decision 2) means only flows-plugin (and future markdown-rendering plugins) pay this cost. jj-plugin and any future settings-only plugin stay light. |
| **Plugin promotion ceremony for future plugins.** Each new plugin that needs an additional shared component requires a small extraction PR. | Acknowledged | Industry consensus (validated against Nx, pnpm docs, DigitalOcean monorepo guide, eslint-plugin-import rule #1154) — this is the standard pattern. If the ceremony cost becomes painful in 6-12 months, evolve to full `packages/ui` extraction or Module Federation in a separate change. |

## Migration Plan

### Sequencing inside this change

```
   Layer 1 (already shipped)
     ✅ Vite plugin emits predicates (commit 80c99ce)
     ✅ sync-versions.js preserves overrides (commit 80c99ce)

   Layer 0 — Foundation (NEXT)
     A. Create packages/client-utils/ + tsconfig + package.json
     B. Create packages/markdown-content/ + tsconfig + package.json
     C. git mv files (preserve history)
     D. Re-export shims at original locations
     E. Update flows-plugin + jj-plugin imports (deep relative → package name)
     F. Add no-cross-package-deep-imports lint
     G. Update vite.config.ts aliases
     H. Update bundle-server.mjs four lists
     I. Update publish.yml PACKAGES array + contract test

   Layer 2 — Plugin internals
     A. Add optional flowState/flowStates/architectState to DashboardSession
     B. Bridge folds these into session payloads
     C. Server replays via sessions_snapshot
     D. Adapt 7 components to {session} entry signatures
     E. Create FlowsActionsContext + FlowActionsContext
     F. Export hasActiveFlow / hasActiveArchitect predicates
     G. Restore flows-plugin manifest claims

   Layer 3 — Shell surgery
     A. Deduplicate 3× FlowArchitect → 1× with combined gating
     B. Deduplicate 2× FlowDashboard → 1× with combined gating
     C. Wire FlowsActionsProvider + FlowActionsProvider in App.tsx
     D. Remove direct flow JSX from App.tsx, SessionCard.tsx, SessionHeader.tsx
     E. Add session-card-no-double-flow regression test
     F. Extend no-jsx-slot-nullish-fallback SCAN_FILES to include MobileShell.tsx

   Layer 4 — Verification
     A. Full test suite green
     B. Build clean (no TS errors)
     C. Manual gate: spawn a flow, verify identical UX before/after
     D. Manual gate: kill+reattach browser mid-flow, flow state survives
     E. pnpm pack of flows-plugin → tarball has no deep relative paths
     F. Documentation updates (AGENTS.md, file-index, CHANGELOG)
```

### Rollback strategy

The change is divided into **independently revertible commits** by layer.

If Layer 3 breaks: revert Layer 3 commits to return to direct-JSX behavior; Layers 0, 2 stay (improvements). Layer 2's bridge augmentation is additive — components that don't read the new fields are unaffected.

Layer 0 file moves are harder to revert mechanically (~17 file moves), but the package extraction is a pure factor — any commit-revert returns symbols to original locations. CI catches partial revert immediately because the deep imports re-fail.

### Coordination with concurrent work

- **`extract-client-utils-package`, `migrate-flows-jsx-to-slots`, `migrate-flows-content-slots`** — obsoleted by this change. Archive after this lands.
- **`wire-plugin-registry-into-shell`** — its remaining tasks (manual gates) become trivial once this lands.
- **`extract-flows-as-plugin`** — its deferred tasks (§7 in tasks.md) folded into this change.
- **`extract-{git,openspec,subagents}-as-plugin`** — future plugin extractions inherit the patterns established here.
- **pi-flows#expose-as-dashboard-plugin** — out of scope. After this lands, that work becomes a `git mv` of working code.

## Open Questions

- **Is `markdown-content` the right name?** Alternatives considered: `rich-text` (more general, leaves room for non-markdown formats), `chat-content` (describes its origin), `document-renderer` (descriptive but generic). The proposal picks `markdown-content` because it matches the source filename and primary export. Defer to spec phase if a different name is preferred.
- **Should the bridge fold `flowState` into the session payload only when it changes, or every register/snapshot?** First-pass: every register/snapshot includes the latest known `FlowState`. Differential pushing is a later optimization.
- **Is `hasActiveArchitect` predicate the right name?** Mirrors `hasActiveFlow`, but architect lifecycle differs (shows during flow design, not flow execution). May want `hasArchitectState` to avoid implying "running". Defer to spec phase.
- **Do parity tests stick around long-term?** `flow-rendering-parity.test.tsx` exists to guard the dedup; once dedup ships and stabilizes, the test loses signal. Recommendation: keep for one minor version then archive.
