## 1. Primitive key and contract

- [x] 1.1 Add `modelSelector: "ui:model-selector"` to `UI_PRIMITIVE_KEYS` in `packages/shared/src/dashboard-plugin/ui-primitives.ts`.
- [x] 1.2 Add `UiModelSelectorProps` interface (`current?: string; models?: ModelInfo[]; onSelect: (modelLabel: string) => void`) and the `"ui:model-selector": ComponentType<UiModelSelectorProps>` entry in `UiPrimitiveMap`. Import `ModelInfo` from the shared types barrel.
- [x] 1.3 Run `npm run build -w @blackbelt-technology/pi-dashboard-shared` (or repo equivalent) and verify the regenerated `dist/dashboard-plugin/ui-primitives.d.ts` exports the new key/contract.

## 2. Client registration

- [x] 2.1 In `packages/client/src/main.tsx` (or wherever `registerUiPrimitive` calls live), import `ModelSelector` from `./components/ModelSelector.js` and call `registerUiPrimitive(registry, "ui:model-selector", ModelSelector)` before `<App>` mounts.
- [x] 2.2 Verify no TypeScript error surfaces from the "Dashboard registers all declared primitives at startup" requirement (build the client).

## 3. Consume in builtins-plugin

- [x] 3.1 In `packages/builtins-plugin/src/RolesSettingsSection.tsx`, import `useUiPrimitive` from the dashboard-plugin-runtime context export already in use. Resolve `const ModelSelectorPrimitive = useUiPrimitive("ui:model-selector")` near the top of `BuiltInRolesSettings`.
- [x] 3.2 Replace the inline model-picker JSX (the `{editingRole && ( … )}` block with the filter input + `filteredModels.slice(0,200).map(…)`) with a rendering of `<ModelSelectorPrimitive current={currentLabelForRole} models={models} onSelect={handleSelectForEditingRole} />`.
- [x] 3.3 Remove now-dead local state and helpers: `filter`, `setFilter`, `modelStrings`, `filteredModels`. Keep `editingRole` and preset state — they remain part of the host's responsibility.
- [x] 3.4 In `setRole`, change the WS payload to send `modelId: modelLabel` (the full `"provider/id"` string). Keep the `provider` field for forward-compat by parsing it locally from the label. Bridge.ts and pi-flows are untouched.

## 4. Read-time migration helper

- [x] 4.1 Add a small pure helper `inferProviderForBareId(stored: string, models: ModelInfo[]): string` inside `RolesSettingsSection.tsx`. When `stored` contains `/`, return `stored`. Otherwise, find the first `m` in `models` with `m.id === stored` and return `"${m.provider}/${stored}"`. If no match, return `stored` unchanged.
- [x] 4.2 Use the helper to compute `currentLabelForRole` for each role pill (for the pill's display) and for the `current` prop passed into the primitive.
- [x] 4.3 The helper SHALL be exported (named export) so unit tests can drive it directly.

## 5. Tests

- [x] 5.1 In `packages/builtins-plugin/src/__tests__/RolesSettingsSection.test.tsx`, add cases:
      - Bare-id role + matching live model → pill renders with synthesized `provider/id` label, no write.
      - Bare-id role + no live model → pill renders bare value as plain text; no throw.
      - Slash-form role → pill renders verbatim.
      - Picking a model dispatches `role_set` with `modelId` = full `provider/id` string.
- [x] 5.2 In `packages/shared/src/dashboard-plugin/__tests__/` (or the closest existing primitives test), add a compile-time assertion that `UiPrimitiveMap["ui:model-selector"]` resolves to the expected `ComponentType<UiModelSelectorProps>` shape.
- [x] 5.3 Run the full repo test suite (`npm test 2>&1 | tee /tmp/pi-test.log; grep -nE "FAIL|✗|✘" /tmp/pi-test.log`) and verify nothing else broke.

## 6. Build and verify in dashboard

- [x] 6.1 `npm run build` to rebuild the client with the new primitive registration.
- [x] 6.2 `curl -X POST http://localhost:8000/api/restart` to restart the dashboard server.
- [x] 6.3 `npm run reload` to reload connected pi sessions so they pick up no-op extension changes (defensive).
- [x] 6.4 Open the dashboard, go to Settings → General → pi-flows Roles, click `@planning`, pick a model with a provider prefix. Confirm `~/.pi/agent/providers.json#roles.planning` now contains the `provider/id` string.
- [x] 6.5 Manually trigger a flow that spawns the architect (or any agent declaring `model: @planning`) and confirm the architect uses the resolved provider (no `Model "<id>" not found in registry` error).

## 7. Cleanup and docs

- [x] 7.1 Update `AGENTS.md` "Key Files" only if a new architectural file was added (it wasn't — skip).
- [x] 7.2 Add a row to the matching `docs/file-index-<area>.md` for the new primitive contract; follow the caveman style rule.
- [x] 7.3 Cross-check `docs/plugin-ui-primitives.md` — if it lists primitives, append `ui:model-selector` with the one-line contract.
