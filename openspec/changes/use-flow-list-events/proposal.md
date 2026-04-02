## Why

The dashboard currently uses fragile heuristics to discover available flows — filtering `pi.getCommands()` by `source === "extension"` and excluding a hardcoded set of management command names. It also reimplements pi-flows' management commands (`/flows:new`, `/flows:edit`, `/flows:delete`) in `flows-mgmt.ts` because there was no event-based API to access them. pi-flows now exposes `flow:list-flows`, `flows:new-request`, and `flows:edit-request` events, making most of these workarounds unnecessary.

## What Changes

- Replace the `pi.getCommands()` heuristic with `flow:list-flows` event to get the actual flow list with metadata (`name`, `description`, `source`, `taskRequired`)
- Add a new `flows_list` protocol message flowing from bridge → server → browser
- Route `/flows:new` and `/flows:edit` via direct event emission (`flows:new-request`, `flows:edit-request`) in the bridge's `sessionPrompt` instead of the `sendUserMessage` → input interceptor roundtrip
- Remove `flows-mgmt.ts` entirely — pi-flows handles all management commands natively via registered command handlers and events
- Remove `flow-commands.ts` client-side heuristic (hardcoded exclusion set)
- Remove `MANAGEMENT_COMMANDS` set from `bridge.ts`
- Update client components (`SessionFlowActions`, `SessionHeader`) to consume the new `flows_list` data

## Capabilities

### New Capabilities
- `flow-list-protocol`: Protocol message and data flow for forwarding pi-flows' `flow:list-flows` event data through bridge → server → browser

### Modified Capabilities
- `flow-trigger`: Flow launcher now uses `flows_list` message instead of filtering `commands_list`. Task-required flows get proper metadata.
- `flow-event-bridge`: Bridge routes management commands via direct event emission instead of input interceptor. `flows-mgmt.ts` workaround removed.
- `command-routing`: Management command routing simplified — `/flows:new` and `/flows:edit` emit events directly; `/flows:delete` also routed via event or falls through to pi-flows' registered handler.

## Impact

- **Bridge extension** (`src/extension/bridge.ts`): Simplified sessionPrompt routing, new `flows_list` message emission on connect/rediscover
- **Bridge extension** (`src/extension/flows-mgmt.ts`): Deleted entirely
- **Shared protocol** (`src/shared/protocol.ts`, `src/shared/browser-protocol.ts`): New `flows_list` message type
- **Server** (`src/server/`): Forward `flows_list` from extension to browser
- **Client** (`src/client/`): `SessionFlowActions`, `SessionHeader`, `FlowLaunchDialog` consume `flows_list` instead of deriving flows from commands
- **Client** (`src/client/lib/flow-commands.ts`): Deleted
- **Tests**: Update bridge, flow-commands, and flows-mgmt tests
