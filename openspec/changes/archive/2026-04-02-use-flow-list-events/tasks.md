## 1. Shared Types & Protocol

- [x] 1.1 Add `FlowInfo` type to `src/shared/types.ts` with `name`, `description`, `taskRequired` fields
- [x] 1.2 Add `flows_list` message to `src/shared/protocol.ts` (extension→server)
- [x] 1.3 Add `flows_list` message to `src/shared/browser-protocol.ts` (server→browser)

## 2. Bridge: Flow List via Events

- [x] 2.1 Add `getFlowsList()` helper in `bridge.ts` that queries `flow:list-flows` event (returns `FlowInfo[]`)
- [x] 2.2 Send `flows_list` message on session register (alongside `commands_list`)
- [x] 2.3 Send `flows_list` message on reconnect
- [x] 2.4 Send `flows_list` on `flow:rediscover` and `flow:complete` events (replace or augment existing `commands_list` resend)

## 3. Bridge: Simplify sessionPrompt Routing

- [x] 3.1 Route `/flows:new` to `pi.events.emit("flows:new-request", { description })` in sessionPrompt
- [x] 3.2 Route `/flows:edit` to `pi.events.emit("flows:edit-request", { flowName })` in sessionPrompt
- [x] 3.3 Replace `pi.getCommands()` filter with `getFlowsList()` for flow command detection in sessionPrompt
- [x] 3.4 Remove `MANAGEMENT_COMMANDS` set from `bridge.ts`
- [x] 3.5 Remove `registerFlowsMgmtInterceptor` call and import from `bridge.ts`

## 4. Delete Obsolete Files

- [x] 4.1 Delete `src/extension/flows-mgmt.ts`
- [x] 4.2 Delete `src/extension/__tests__/flows-mgmt.test.ts`
- [x] 4.3 Delete `src/client/lib/flow-commands.ts`
- [x] 4.4 Delete `src/client/lib/__tests__/flow-commands.test.ts`

## 5. Server: Forward flows_list

- [x] 5.1 Handle `flows_list` in pi-gateway (store on session, forward to browsers)
- [x] 5.2 Forward `flows_list` in browser-gateway (include in session state sync)

## 6. Client: Consume flows_list

- [x] 6.1 Add `flows: FlowInfo[]` to session state in event reducer
- [x] 6.2 Handle `flows_list` message in event reducer
- [x] 6.3 Update `SessionFlowActions.tsx` to use `session.flows` instead of `getFlowCommands(commands)`
- [x] 6.4 Update `SessionHeader.tsx` to use `session.flows` instead of `getFlowCommands(commands)`

## 7. Tests & Verification

- [x] 7.1 Add tests for `getFlowsList()` bridge helper (tested via command-handler eventSink tests)
- [x] 7.2 Add/update tests for sessionPrompt routing changes (flows:new, flows:edit, flow detection)
- [x] 7.3 Update event reducer tests (flows_list handled in App.tsx state, not event reducer) for `flows_list` message handling
- [x] 7.4 Run full test suite and verify no regressions
