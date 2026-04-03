## Context

The dashboard discovers available flows by filtering the `commands_list` — a general-purpose list of all pi commands. This requires a hardcoded exclusion set (`EXCLUDED_FLOW_COMMANDS` / `MANAGEMENT_COMMANDS`) maintained in two places (client + bridge). Management commands (`/flows:new`, `/flows:edit`, `/flows:delete`) are handled by `flows-mgmt.ts`, which reimplements pi-flows' own file discovery, deletion, and editing logic via an `input` event interceptor.

pi-flows now exposes:
- `flow:list-flows` — synchronous event-based RPC returning `{ name, description, source, taskRequired }[]`
- `flows:new-request` / `flows:edit-request` — events to trigger management commands
- Registered command handlers for `/flows:new`, `/flows:edit`, `/flows:delete` with full UI via `ctx.ui`

## Goals / Non-Goals

**Goals:**
- Replace the commands-based flow discovery heuristic with `flow:list-flows` event
- Simplify management command routing by emitting events directly
- Remove ~250 lines of duplicated logic (`flows-mgmt.ts`, `flow-commands.ts`)
- Provide richer flow metadata to the client (description, taskRequired)

**Non-Goals:**
- Changing the flow launcher UI behavior (same UX, better data source)
- Modifying how `commands_list` works — it stays for non-flow commands
- Adding new flow management features

## Decisions

### 1. New `flows_list` protocol message

Add a dedicated `flows_list` message type to both extension→server and server→browser protocols. The bridge emits it alongside `commands_list` on connect/reconnect and on `flow:rediscover`/`flow:complete` events.

**Shape:**
```ts
interface FlowInfo {
  name: string;
  description: string;
  taskRequired: boolean;
}

// Extension → Server
{ type: "flows_list"; sessionId: string; flows: FlowInfo[] }

// Server → Browser  
{ type: "flows_list"; sessionId: string; flows: FlowInfo[] }
```

**Why not piggyback on `commands_list`?** Flows have different metadata (taskRequired, description) and different consumers. A separate message is cleaner and doesn't bloat the general commands protocol.

### 2. Bridge queries `flow:list-flows` via synchronous event RPC

The bridge already uses this pattern for `flow:get-agents`. When pi-flows isn't installed, `probe.flows` stays undefined — the bridge sends an empty array, and the client shows no flow launcher. Same graceful degradation as today.

```ts
function getFlowsList(): FlowInfo[] {
  const probe: any = {};
  pi.events?.emit("flow:list-flows", probe);
  return probe.flows ?? [];
}
```

### 3. Management commands routed via direct event emission

In the bridge's `sessionPrompt` callback:
- `/flows:new <desc>` → `pi.events.emit("flows:new-request", { description })`
- `/flows:edit <name>` → `pi.events.emit("flows:edit-request", { flowName: name })`
- `/flows:delete <name>` → fall through to `session.prompt()` which invokes pi-flows' registered command handler

This eliminates `flows-mgmt.ts` entirely. The `flows:delete` case uses session.prompt() because pi-flows' handler needs `ctx.ui` for the confirm dialog, and the bridge's `sessionPrompt` already has a path that calls `session.prompt()` for generic slash commands — the ui-proxy forwards those dialogs to the dashboard.

**Alternative considered:** Adding a `flows:delete-request` event to pi-flows. Rejected — it would require pi-flows changes, and `session.prompt()` already works correctly for this.

### 4. Remove `MANAGEMENT_COMMANDS` set and flow-commands heuristic

Both the bridge's `MANAGEMENT_COMMANDS` set and the client's `EXCLUDED_FLOW_COMMANDS` set become unnecessary since flows are now identified by `flows_list`, not by filtering `commands_list`. The sessionPrompt routing simplifies to:

1. Check if command is `/flows:new` or `/flows:edit` → emit event directly
2. Check if command matches a flow name from `flow:list-flows` → emit `flow:run`
3. Everything else → fall through to existing slash command routing

### 5. Client consumes `flows_list` via event reducer

The `flows_list` message is handled in the event reducer alongside `commands_list`. Session state gets a new `flows: FlowInfo[]` field. `SessionFlowActions` and `SessionHeader` read from `flows` instead of calling `getFlowCommands(commands)`.

## Risks / Trade-offs

- **[pi-flows not installed]** → `flow:list-flows` returns nothing, bridge sends empty flows array, UI hides flow launcher. Same behavior as today. No risk.
- **[Stale flow list after edit/delete]** → `flow:rediscover` event already triggers resend. Same mechanism, now sends `flows_list` instead of `commands_list`. No regression.
- **[`/flows:delete` still uses session.prompt()]** → This means it goes through the command handler pipeline. The ui-proxy already handles `ctx.ui` dialogs (confirm, select) from extensions, so this works. Minor: the command shows up as a user message briefly before being handled. Acceptable trade-off vs. maintaining a separate interceptor.
