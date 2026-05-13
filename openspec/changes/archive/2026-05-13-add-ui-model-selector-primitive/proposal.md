## Why

`BuiltInRolesSettings` (in `builtins-plugin`) ships its own bespoke inline model picker that lists models as flat `provider/id` strings, splits on the first `/` to derive `(provider, modelId)`, and sends `role_set` with both fields. Two downstream callers silently drop `provider`:

1. Bridge extension at `packages/extension/src/bridge.ts:471-473` destructures only `{role, modelId}`.
2. pi-flows `role-manager.ts` at line 130-135 also reads only `{role, modelId}` and persists the bare id.

Result: the persisted role value loses its provider prefix. When the architect spawns with `model: @planning`, pi-flows' `execution.ts:213-220` cannot resolve the model — `parts.length >= 2` is false, the fallback `getAll().find(m => m.id === modelId)` either misses (custom-proxy ids carry path prefixes like `cc/deepseek-v4-flash`) or matches the wrong provider when the same id exists across providers. Architect spawn fails with `Model "<id>" not found in registry` or uses wrong credentials.

The dashboard already has a fully-featured `ModelSelector` component (`packages/client/src/components/ModelSelector.tsx`) with built-in provider filter, used by `StatusBar`. The plugin boundary forbids importing it directly. The blessed path — `UI_PRIMITIVE_KEYS` + `useUiPrimitive` — is missing a `ui:model-selector` entry.

## What Changes

- Add `modelSelector: "ui:model-selector"` to `UI_PRIMITIVE_KEYS` and a matching `UiModelSelectorProps` contract to `UiPrimitiveMap`.
- Register the existing `ModelSelector` component as the implementation in the client's main entry.
- Replace the inline picker in `BuiltInRolesSettings` with `useUiPrimitive("ui:model-selector")`, removing ~80 lines of duplicated picker UI.
- Persisted role value migrates from bare `modelId` to full `"provider/modelId"` string. **BREAKING** for direct readers of `~/.pi/agent/providers.json#roles`, but transparent to pi-flows because `execution.ts` already handles both forms.
- Read-time migration: when loading roles that contain bare ids, best-effort prefix the first matching provider; on next save it normalizes.
- No edits to `bridge.ts` or pi-flows `role-manager.ts` — they pass `modelId` through verbatim, which now happens to be the full `"provider/modelId"` string.

## Capabilities

### New Capabilities
- _(none)_

### Modified Capabilities
- `plugin-ui-primitive-registry`: adds `ui:model-selector` to the frozen primitive key set, its `UiModelSelectorProps` contract, and the registration obligation for the client.
- `model-selector`: adds the requirement that the same component is reachable from plugins via the primitive registry, not only from `StatusBar`.

## Impact

- **Code**: `packages/shared/src/dashboard-plugin/ui-primitives.ts` (extend keys+map), `packages/client/src/main.tsx` (register impl), `packages/builtins-plugin/src/RolesSettingsSection.tsx` (consume primitive, send full `provider/modelId` string).
- **Tests**: extend `packages/shared/src/__tests__/no-primitive-direct-import.test.ts` allowlist if needed; add a builtins-plugin test for the new picker path; verify `intent-renderer.test.tsx` still passes.
- **Persistence**: `~/.pi/agent/providers.json#roles` values change shape (bare id → `provider/id`). Migration helper handles legacy entries on read.
- **Dependencies**: none new. `ModelInfo` already exported from shared types.
- **Downstream**: pi-flows `execution.ts` lookup unchanged — already prefers `modelRegistry.find(provider, id)` when `/` present. pi-anthropic-messages unaffected.
