## Context

The dashboard architecture pushes every reusable UI component through `UI_PRIMITIVE_KEYS` + `UiPrimitiveMap` (typed contract) and a runtime `registerUiPrimitive`/`useUiPrimitive` pair. `IntentRenderer` (`packages/dashboard-plugin-runtime/src/intent-renderer.tsx`) resolves server-emitted JSON intent trees against this registry, so any primitive becomes available to every connected client identically (multi-client coherence).

`ModelSelector` (`packages/client/src/components/ModelSelector.tsx`, ~210 lines) already implements the full model-picker UX with provider filter, typeahead, keyboard navigation, pending-state with 10s safety timeout. It is consumed by `StatusBar.tsx` directly. The plugin boundary forbids `builtins-plugin` from importing client internals, so today `BuiltInRolesSettings` duplicates ~80 lines of inferior picker logic.

The duplication is also the source of a live bug (see `proposal.md`): the bespoke picker parses `provider/id` only to throw away `provider` two hops downstream, breaking architect spawn.

`flow-architect.md` line 4 declares `model: @planning`. pi-flows `execution.ts:213-220` resolves this via `getModelRole("planning") → modelId`, then prefers `modelRegistry.find(provider, id)` when `modelId.split("/")` yields ≥2 parts. If the persisted value is bare (`"deepseek-v4-flash"`), the find path is skipped and the broad `getAll().find()` either misses (custom-proxy ids like `cc/deepseek-v4-flash`) or picks the wrong provider when the same id exists on multiple providers.

## Goals / Non-Goals

**Goals:**
- Eliminate the duplicate inline picker in `BuiltInRolesSettings`.
- Persist role values in a form `pi-flows/execution.ts` can resolve unambiguously (full `"provider/modelId"`).
- Keep `ModelSelector`'s public surface unchanged so `StatusBar` is not touched.
- Expose `ModelSelector` to all current and future plugins via the documented primitive registry path.

**Non-Goals:**
- Refactoring `ModelSelector` itself.
- Changing the WS protocol shape of `role_set` (we keep `provider` for forward-compat though it becomes redundant).
- Editing `bridge.ts` or pi-flows `role-manager.ts` — the fix flows through the model id field they already pass verbatim.
- Touching pi-flows or pi-anthropic-messages source.

## Decisions

### D1 — Primitive key & contract

Add to `packages/shared/src/dashboard-plugin/ui-primitives.ts`:

```ts
UI_PRIMITIVE_KEYS.modelSelector = "ui:model-selector"

interface UiModelSelectorProps {
  current?: string;                              // "provider/id" form
  models?: ModelInfo[];                          // from shared types.ts
  onSelect: (modelLabel: string) => void;        // emits "provider/id"
}

UiPrimitiveMap["ui:model-selector"]: ComponentType<UiModelSelectorProps>
```

Mirror of `ModelSelector`'s effective public props (`current`, `models`, `onSelect`). The deprecated role/preset props on `ModelSelector` itself stay where they are — not part of the primitive contract.

**Alternative considered:** widen the contract with `placeholder` / `disabled` / variant flags. Rejected — YAGNI; can be added non-breakingly later.

### D2 — Where to register the impl

Register in the client's `main.tsx` next to existing `registerUiPrimitive` calls. This keeps the dashboard as the single owner of all primitive implementations and aligns with `plugin-ui-primitive-registry` spec's "Frozen primitive key set" / "Typed primitive contract map" requirements.

**Alternative considered:** export `ModelSelector` from a new `@blackbelt-technology/pi-dashboard-web` subpath and import directly in `builtins-plugin`. Rejected — bypasses the primitive registry, blocks `IntentRenderer` usage, and contradicts the existing convention.

### D3 — Storage shape & migration

Persisted role value flips from bare `modelId` (current: `"deepseek-v4-flash"`) to `"provider/modelId"` (new: `"proxy/cc/deepseek-v4-flash"`).

- **Forward path:** `BuiltInRolesSettings` passes `modelLabel` (already `provider/id`) as the `modelId` field in `role_set`. `bridge.ts` and `role-manager.ts` are untouched — they store whatever string arrives. `execution.ts` already prefers `modelRegistry.find(parts[0], parts.slice(1).join("/"))` when `parts.length >= 2`. Bug fixed for new picks.
- **Read-time migration (display):** in `BuiltInRolesSettings`, when `rolesMap[role]` is missing a `/`, look up the first model whose `.id === stored` in the live `models` list and synthesize `${provider}/${stored}` for the UI's `current` prop.
- **Auto-write migration (NEW):** when the live `models` list and a `liveSessionId` are both available AND a role's stored value is bare AND `inferProviderForBareId` finds a confident match, dispatch the existing `role_set` WS message ONCE per (sessionId, role) tuple to canonicalise the persisted value. The write travels the same path as a user click — no new protocol, no new file mutation surface. Roles with no confident match (no live model has `m.id === stored`) are left untouched.

**Why write-through is required:** pi-ai ships a built-in catalogue under `/home/.../node_modules/@earendil-works/pi-ai/dist/models.generated.js` that registers `deepseek-v4-flash` under `provider: "deepseek"`. The pi process runs `getAll().find()` over a list where built-ins are inserted before custom proxy models (`internal-registry.ts:115-145`), so bare `deepseek-v4-flash` resolves to the pi-ai built-in's `deepseek` provider — which has no API key for users who configured only a custom `proxy` provider. Read-only migration cannot save them; pi-flows resolves from disk before the dashboard's display layer ever runs. The write must happen the first time the dashboard sees the bare value plus a confident match.

**Alternative considered:** active rewrite of `providers.json` directly from the dashboard server. Rejected — touches state outside the dashboard's domain (pi-flows owns that file). Routing through `role_set` keeps the existing single-writer invariant (only pi-flows ever writes the file).

### D4 — `provider` field on `role_set` WS message

Keep sending `provider` (extracted from the label) on the message for backward-compat with any external listener, but **do not rely on it**. The authoritative carrier is now `modelId` containing the full `provider/id` string. A future cleanup pass may drop the redundant field; out of scope here.

### D5 — `RolesSettingsSection` UI shape

Today: a static grid of role pills; clicking a pill expands an inline picker below. Tomorrow: clicking a pill opens `ModelSelector` rendered in-place (dropdown overlay). The `ModelSelector` already manages its own open/close + outside-click behavior; the host just toggles `editingRole` and passes `current`/`onSelect`. Removes ~80 lines of duplicated picker JSX.

## Risks / Trade-offs

- **[Risk] First-render flicker before models arrive** → Mitigation: `ModelSelector` already handles `models === undefined` (renders plain label, not clickable). Same fallback applies in plugin context.
- **[Risk] Two providers expose identical model ids and migration picks the wrong one** → Mitigation: migration is read-only; if user notices, re-picking writes the correct `provider/id`. Far better than today's silent wrong-provider match in `getAll().find()`.
- **[Risk] pi-flows' future maintainers see the schema drift between protocol comment (`"provider/modelId"`) and historic bare-id reality** → Mitigation: this change closes the drift in the canonical write path. We accept that legacy bare-id rows persist until their next save.
- **[Trade-off] `UiPrimitiveMap` now depends on `ModelInfo` from shared types** → Acceptable: `ModelInfo` is already in the public shared types and used across packages.

## Migration Plan

1. Land the primitive key + contract (no behavior change).
2. Register the impl in `main.tsx`.
3. Switch `RolesSettingsSection` to use it.
4. Ship. Existing role entries continue to resolve as today; users who re-pick a role write the canonical form.

Rollback: revert the three commits. No data migration to undo (we never wrote new data; only the dashboard's write path changed).

## Open Questions

- Should the new primitive be opt-in for plugin-friendliness, or do we mark it `"ui:model-selector"` v1 immediately stable? **Tentative answer:** stable v1 — the underlying `ModelSelector` has been in use for months.
