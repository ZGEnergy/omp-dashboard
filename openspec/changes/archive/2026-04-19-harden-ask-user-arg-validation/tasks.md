## 1. Schema

- [x] 1.1 Replace the flat `Type.Object` `parameters` in `packages/extension/src/ask-user-tool.ts` with a discriminated `Type.Union` over `confirm` / `select` / `multiselect` / `input`, where `title` is required on every branch and `options` is a non-empty array on `select`/`multiselect` (`minItems: 2` for select, `minItems: 1` for multiselect).
- [x] 1.2 Confirm `message` remains `Optional` on every branch (preserves `ask-user-message-body` behavior).

## 2. prepareArguments rescue

- [x] 2.1 Extend `prepareArguments` to unwrap `{ method, params: "<json>" }` by parsing `params` and merging fields into the top-level args.
- [x] 2.2 Extend `prepareArguments` to unwrap `{ method, params: { … } }` (object form) by spreading into args.
- [x] 2.3 Extend `prepareArguments` to copy `question` into `title` when `title` is absent.
- [x] 2.4 Keep the existing `options` JSON-string rescue; ensure the new rescues run before it.

## 3. Runtime guard in execute

- [x] 3.1 Throw a descriptive error if `method` is `select` or `multiselect` and the effective `options` array is empty or missing.

## 4. Tests

- [x] 4.1 Update `packages/extension/src/__tests__/ask-user-tool.test.ts` to cover new rescue: `{method:"select", params:"{\"title\":\"X\",\"options\":[\"a\",\"b\"]}"}` resolves to `ctx.ui.select("X", ["a","b"], …)`.
- [x] 4.2 Cover the object-form rescue: `{method:"select", params:{title:"X", options:["a","b"]}}`.
- [x] 4.3 Cover the `question`→`title` rename.
- [x] 4.4 Cover the empty-options guard: `{method:"select", options:[]}` throws with a message that mentions `options` and suggests `input`.
- [x] 4.5 Update or remove the existing test asserting `ctx.ui.select("Pick", [], undefined)` is allowed — behavior is now a thrown error.

## 5. Manual verification

- [x] 5.1 Extension workspace tests green (`npx vitest run packages/extension` → 329/329 passed). Full `npm test` skipped per user (would break session).
- [x] 5.2 `npm run reload` to push the bridge change to connected sessions.
- [x] 5.3 Verified in this session: (a) live `ask_user` call rendered a full select dialog (title + message + 4 options) and round-tripped the user's choice; (b) offline demo script exercised all rescue shapes (`{method,params:"<json>"}`, `question`→`title`) and both guard paths (empty/missing `options`) — rescues repaired correctly, guard threw with the expected "requires a non-empty \"options\" array" message.
