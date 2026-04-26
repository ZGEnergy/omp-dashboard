## Why

The dashboard currently has ~350 LOC of code that's tightly coupled to the npm package `@tintinweb/pi-subagents`:

| File | What it does |
|---|---|
| `packages/client/src/components/tool-renderers/AgentToolRenderer.tsx` (189 LOC) | Custom React renderer for the `Agent` tool with `AgentDetails` interface, status mapping, stats line. |
| `packages/client/src/components/tool-renderers/SteerSubagentRenderer.tsx` (27 LOC) | Renderer for `steer_subagent`. |
| `packages/client/src/components/tool-renderers/GetSubagentResultRenderer.tsx` (30 LOC) | Renderer for `get_subagent_result`. |
| `packages/client/src/components/agent-card-utils.ts` (42 LOC) | Helpers shared by the renderers. |
| `packages/client/src/components/tool-renderers/registry.ts` | Hardcodes 3 entries for the renderers. |
| `packages/client/src/lib/event-reducer.ts` | `SubagentState` interface, `subagents: Map` in SessionState, ~50 LOC of `subagent_created`/`started`/`completed`/`failed` handlers. |
| `packages/extension/src/flow-event-wiring.ts:43-49` | `SUBAGENT_EVENT_MAP` translating `subagents:*` → `subagent_*` event types. |
| `packages/shared/src/recommended-extensions.ts:99-114` | Recommended-extension entry that explicitly says "the dashboard has custom card UI for it." |

This is the same shape of coupling as OpenSpec and pi-flows rendering — first-party-but-baked-in. The umbrella proposal `dashboard-plugin-architecture` introduces the slot taxonomy and plugin loader; this change uses it to **move pi-subagents-specific code into a first-class plugin package** at `packages/subagents-plugin/` that claims the `tool-renderer` slot.

After this lands:

- The dashboard works without the plugin (the three tool calls render via `GenericToolRenderer` instead of the agent card UI; subagent reducer slice is absent so the `SubagentState` map is empty).
- The plugin can later be moved into the `@tintinweb/pi-subagents` npm package as a `dashboard/` subpath, once the plugin loader gains `node_modules` scanning (Future Work documented in the umbrella). At that point, the dashboard's `recommended-extensions.ts` entry no longer needs the "custom card UI" caveat — the UI ships with the package itself.

This change DEPENDS ON `dashboard-plugin-architecture` and `add-dashboard-shell-slots-runtime` being implemented first, including the **`tool-renderer` slot** and the **reducer-slice registration mechanism** (introduced by `extract-flows-as-plugin`'s changes to `event-reducer.ts`).

## What Changes

- **NEW**: `packages/subagents-plugin/` package with `pi-dashboard-plugin` manifest:
  - `client/AgentToolRenderer.tsx` (moved)
  - `client/SteerSubagentRenderer.tsx` (moved)
  - `client/GetSubagentResultRenderer.tsx` (moved)
  - `client/agent-card-utils.ts` (moved)
  - `client/subagent-reducer.ts` (NEW — extracted from `event-reducer.ts`: `SubagentState` type, the four event handlers, registers itself via `pluginContext.registerReducerSlice`)
  - `bridge/subagent-event-map.ts` (moved from `flow-event-wiring.ts`'s `SUBAGENT_EVENT_MAP`)
- **MOVE** (not copy): every pi-subagents-specific file from `packages/{client,extension,shared}/` into `packages/subagents-plugin/`. Use `git mv` for history preservation.
- **NEW**: Slot claims in the manifest:
  - `tool-renderer` `toolName: "Agent"` → `AgentToolRenderer`
  - `tool-renderer` `toolName: "get_subagent_result"` → `GetSubagentResultRenderer`
  - `tool-renderer` `toolName: "steer_subagent"` → `SteerSubagentRenderer`
- **REMOVE** from `packages/client/src/components/tool-renderers/registry.ts`: the three hardcoded `["Agent", AgentToolRenderer]` etc. entries (now provided by the plugin).
- **REMOVE** from `packages/client/src/lib/event-reducer.ts`: `SubagentState`, `subagents` in `SessionState`, the four event handlers (~80 LOC). Replaced by plugin-registered reducer slice.
- **REMOVE** from `packages/extension/src/flow-event-wiring.ts`: `SUBAGENT_EVENT_MAP` (now provided by plugin's bridge entry).
- **UPDATE** `packages/shared/src/recommended-extensions.ts`: drop the "the dashboard has custom card UI for it" line; the plugin (when present) provides the card UI directly. Keep the extension entry — pi-subagents is still a recommended pi extension.
- **NEW**: Plugin manifest declares `pi-dashboard-plugin.targetPackage: "@tintinweb/pi-subagents"` (informational metadata) so the future `node_modules` scan knows the plugin is associated with that upstream package — useful for warning the user when one is installed without the other.

## Capabilities

### New Capabilities

None. This change is a refactor that uses `dashboard-shell-slots` and `dashboard-plugin-loader` already established by the umbrella, plus the `tool-renderer` slot added in the same umbrella.

### Modified Capabilities

- `agent-tool-rendering`: ownership shifts from the dashboard core to the `subagents-plugin` package. The capability spec moves from `openspec/specs/agent-tool-rendering/` to `packages/subagents-plugin/specs/` and becomes plugin-internal documentation.
- `event-reducer`: `subagent_*` event handling moves from the core reducer to a plugin-registered slice (the registration mechanism itself is added by `extract-flows-as-plugin`).

## Impact

- `packages/client/src/components/tool-renderers/registry.ts` — three lines removed, plugin now registers them.
- `packages/client/src/components/tool-renderers/types.ts:18` — comment about `AgentDetails` updated to reference the plugin.
- `packages/client/src/lib/event-reducer.ts` — `SubagentState`, the `subagents` map, and the four handlers removed (~80 LOC).
- `packages/extension/src/flow-event-wiring.ts` — `SUBAGENT_EVENT_MAP` removed (~7 lines).
- `packages/shared/src/recommended-extensions.ts` — minor update to entry description.
- `packages/subagents-plugin/` — NEW package with the moved files plus reducer-slice registration.
- ~6 test files (in `packages/client/src/components/__tests__/` and `packages/client/src/lib/__tests__/`) — paths in import statements update; behavioral assertions unchanged.
- `AGENTS.md` Key Files — replace internal subagent entries with the plugin package and its manifest.
- `docs/architecture.md` — add a sentence noting that subagent UI is now plugin-provided.

## The PR-back-to-`@tintinweb/pi-subagents` path

The user's stated long-term goal is for this plugin to eventually live in the `@tintinweb/pi-subagents` npm package itself, contributed via PR. The plugin manifest format is intentionally compatible with that:

```
   Today (Phase 1 of plugin loader): manifest discovery is monorepo-only
   ────────────────────────────────────────────────────────────────────
   packages/subagents-plugin/package.json
     "pi-dashboard-plugin": {
       "id": "subagents",
       "targetPackage": "@tintinweb/pi-subagents",
       "claims": [...]
     }

   Future (when plugin loader gains node_modules discovery):
   ────────────────────────────────────────────────────────
   node_modules/@tintinweb/pi-subagents/dashboard/package.json
     (or @tintinweb/pi-subagents/package.json directly)
     "pi-dashboard-plugin": {
       "id": "subagents",
       "claims": [...]
     }
```

The proposed flow:

1. **This change** moves the code into `packages/subagents-plugin/` in this monorepo. Validates the plugin contract; iterates while the API is unstable.
2. **Stabilization period** — plugin runs in production for ≥1 release cycle. Manifest contract proves it can survive new tool name additions, version bumps in `@tintinweb/pi-subagents`, etc.
3. **`node_modules` scanning lands** in the dashboard plugin loader (Future Work in the umbrella; tracked separately).
4. **PR to `@tintinweb/pi-subagents`** copies the plugin into a `dashboard/` subdirectory of that package, adds the `pi-dashboard-plugin` field to its `package.json`. The dashboard's monorepo plugin is removed; `@tintinweb/pi-subagents` is now self-contained.
5. **Optional final step**: the dashboard's `recommended-extensions.ts` entry no longer says "the dashboard has custom card UI" — installing the npm package alone is sufficient.

This validates the plugin architecture works for arbitrary external authors. It also means dashboard maintainers don't need to track every change in `@tintinweb/pi-subagents` — the plugin lives with the upstream code and ships in lockstep.

## Migration Risks

- **Reducer slice timing.** `subagent_*` events arrive in event-reducer order. If the plugin's reducer slice isn't registered before the first event, state is dropped. Validation: plugin client entry must register its slice synchronously on import; the loader's generated `plugin-registry.tsx` imports plugins before any session subscription begins.
- **Tool renderer fallback.** If the plugin is absent, `GenericToolRenderer` renders `Agent` / `get_subagent_result` / `steer_subagent` calls. This is a UX regression vs. today (no agent card). Acceptable because the plugin is `strongly-suggested` in `recommended-extensions.ts`; the missing UI is a clear signal to install. Document this in release notes.
- **AgentDetails type leak.** `event-reducer.ts` and `tool-renderers/types.ts` reference `AgentDetails` (the structured metadata pi-subagents emits via `partialResult.details`). The plugin owns this type now. Re-export from `@blackbelt-technology/subagents-plugin/types` for any consumer that still needs it; the dashboard core no longer imports it.
- **Tests.** Six client test files import the renderer modules directly; their import paths update to the new package. Behavior tests stay the same.
- **`recommended-extensions.ts` UX.** Today the entry says the dashboard has "custom card UI." After extraction, the card UI ships with the plugin. If a user installs `@tintinweb/pi-subagents` but not `subagents-plugin`, the extension's tools work in chat but render via `GenericToolRenderer`. Recommended-extensions UI in the Settings page should signal "plugin missing, install for full UI" — minor follow-up tracked in this change's tasks.

## References

- Umbrella: `openspec/changes/dashboard-plugin-architecture/` — defines `tool-renderer` slot and Future Work for `node_modules` scanning.
- Sibling extractions:
  - `openspec/changes/extract-openspec-as-plugin/`
  - `openspec/changes/extract-flows-as-plugin/` (introduces the reducer-slice registration mechanism this plugin uses)
- Upstream: [`@tintinweb/pi-subagents`](https://www.npmjs.com/package/@tintinweb/pi-subagents) — the npm package whose tools this plugin renders.
- Layout scan: `openspec/changes/dashboard-plugin-architecture/design.md` §"Current dashboard layout" for the broader picture.

## Slot wiring guardrail

When this change wires new slot consumers into `App.tsx` (or any other shell file) inside a `??` fallback chain, the JSX element MUST be gated on a `getClaims(...).length > 0` check **before** construction. See `fix-slot-fallback-masks-content` for the rationale, the lint test that enforces the convention, and the exact production-bug shape that motivated it. Add the shell file path to `SCAN_FILES` in `packages/client/src/__tests__/no-jsx-slot-nullish-fallback.test.ts` if this change touches a file outside `App.tsx`.
