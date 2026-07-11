## 1. Shared name validation (`isValidRoleName`)

- [ ] 1.1 Write failing unit tests in `packages/shared` for `isValidRoleName(name, existing)`: accepts `doubt-verifier-1`, `review`, `a_b`; rejects `""`, `"  "`, `doubt/verifier`, `doubt verifier`, `@fast`, `-lead` (non-alnum start), `.hidden`, and any name already in `existing`.
- [ ] 1.2 Implement `isValidRoleName` in `@blackbelt-technology/pi-dashboard-shared` returning `{ ok: boolean; reason?: string }`; regex `^[A-Za-z0-9][A-Za-z0-9_-]*$` + collision check. Export from the shared barrel.
- [ ] 1.3 Verify: `npm test` shared package green.

## 2. Protocol additions (`builtinRoleNames`, `role_remove`)

- [ ] 2.1 Write failing tests: `roles:get-all` payload includes `builtinRoleNames` equal to `DEFAULT_ROLE_NAMES`; a `role_remove` message for a custom role triggers `removeRoleFromSchema` and a follow-up `roles_list`; a `role_remove` for a built-in name is rejected (no write, `success:false`).
- [ ] 2.2 Add `builtinRoleNames: string[]` to the `roles_list` payload type (shared) and populate it in the `roles:get-all` handler (`role-manager.ts`) from `DEFAULT_ROLE_NAMES`.
- [ ] 2.3 Add the `role_remove` message type (shared) and a `roles:remove` handler (`role-manager.ts`): re-validate the name, reject built-ins, else `removeRoleFromSchema` + `saveRoleConfig`, set `success`.
- [ ] 2.4 Route `role_remove` in `bridge.ts` (emit `roles:remove`; on success re-emit `roles_list` with `builtinRoleNames`), mirroring the `role_set` routing block.
- [ ] 2.5 Verify: `npm test` extension package green; unrelated `providers.json` keys preserved (atomic write).

## 3. Client — Built-in/Custom grouping + render union

- [ ] 3.1 Write failing tests for a pure `computeRoleGroups(rolesMap, pending, builtinRoleNames)` helper: returns `{ builtin: string[], custom: string[] }` over the union `keys(rolesMap) ∪ keys(pending)`, deduped, built-ins ordered by `builtinRoleNames`, custom names sorted stably; a pending-only custom name appears in `custom`.
- [ ] 3.2 Implement `computeRoleGroups` (exported for test) and render two labelled groups in `RolesSettingsSection.tsx`; read `builtinRoleNames` from plugin config (default `[]` → everything renders as one flat group for back-compat).
- [ ] 3.3 Verify: `RolesSettingsSection` renders built-in and custom groups; a pending-only custom name shows a dirty marker before Save.

## 4. Client — Add-custom-role flow

- [ ] 4.1 Write failing tests: clicking **＋ Add custom role** reveals a name input; typing an invalid name shows the ✗ hint and disables confirm; a valid name opens the model picker; selecting a model stages `pending[name]` and closes the input; the new pill renders in the Custom group with a dirty marker; unified Save flushes one `role_set` carrying the full `provider/id`.
- [ ] 4.2 Implement the add flow in `RolesSettingsSection.tsx`: `+ Add custom role` → inline `@`-prefixed input using `isValidRoleName(name, effectiveNames)` for the live hint → on valid + Enter/✓, open `ui:model-selector` scoped to the new name → on select call the existing `setRole(name, modelLabel)` staging path.
- [ ] 4.3 Verify: no `role_set` dispatches until Save; cancel (✕/Escape) adds nothing.

## 5. Client — Remove custom role

- [ ] 5.1 Write failing tests: custom pills render a **×**; built-in pills do NOT; clicking **×** calls `window.confirm`, and on confirm dispatches `role_remove { role }` and drops any `pending[role]`; on cancel does nothing.
- [ ] 5.2 Implement the **×** affordance on custom pills only (name ∉ `builtinRoleNames`); wire the confirm + `role_remove` dispatch + pending cleanup.
- [ ] 5.3 Verify: removing a custom role updates the grid after the `roles_list` ack; built-in pills never expose removal.

## 6. Integration + gates

- [ ] 6.1 Full `npm test` green; confirm pre-existing roles/model-selector suites (`RolesSettingsSection`, `model-selector`, `role-model-tools`, `role-manager`) stay green.
- [ ] 6.2 `openspec validate add-custom-roles-ui` passes.
- [ ] 6.3 Manual/E2E (deferred to ship): in the dashboard, add `@doubt-verifier-1` (haiku) and `@doubt-verifier-x` (opus), Save, spawn a subagent with `model: "@doubt-verifier-x"`, confirm resolution; remove `@doubt-verifier-1` and confirm it purges from presets.
- [ ] 6.4 Run `security-hardening` (validation trust boundary — client + bridge) and `doubt-driven-review` (the `role_remove` purge blast radius) checkpoints before commit.

## Discipline Skills

- `security-hardening` — role name is user input written to global `providers.json`; validate on both client and bridge (tasks 1, 2.3).
- `doubt-driven-review` — `role_remove` purges across every preset irreversibly; review the confirm gate + blast radius (tasks 2.3, 5).
