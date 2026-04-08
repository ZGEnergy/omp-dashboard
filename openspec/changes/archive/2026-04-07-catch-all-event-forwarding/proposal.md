## Why

The bridge extension forwards only a hardcoded whitelist of 12 pi core event types to the dashboard server. Any event outside this list — from other extensions, future pi core additions, or custom tool interactions — is silently dropped. This creates blind spots: the dashboard can appear "stuck" when untracked activity is happening (e.g., an unknown extension tool executing), and debugging session behavior requires guessing what events were missed. The bridge should be a dumb transport that delivers everything; the server and client should decide what matters.

## What Changes

- **Bridge becomes a pass-through**: Instead of a curated whitelist, the bridge subscribes to ALL known pi core event types (27 types) and monkey-patches `pi.events.emit` to capture all EventBus traffic (flow events, subagent events, custom extension events). Every event gets forwarded as `event_forward` — the bridge no longer decides what's "relevant".
- **Special handling preserved inline**: The few events that need enrichment (e.g., `model_select` gets `thinkingLevel` added, `tool_execution_start` triggers OpenSpec detection) keep their extra logic, but the forwarding itself is unconditional.
- **Large/noisy events excluded**: `context` and `before_provider_request` are skipped — they carry full message arrays and raw API payloads that would overwhelm the transport. All other event types are forwarded.
- **Client already handles unknown events**: The `RawEventCard` component (expandable JSON card, collapsed by default) and the event reducer's `rawEvent` message role are already implemented. No client changes needed.

## Capabilities

### New Capabilities
- `catch-all-event-forwarding`: Bridge subscribes to all pi core event types and intercepts EventBus emissions, forwarding everything to the dashboard server. Replaces the current whitelist approach.

### Modified Capabilities
- `bridge-extension`: The event subscription model changes from explicit whitelist to catch-all. Special-case enrichment logic (model_select, OpenSpec detection) is preserved but the forwarding decision is removed.
- `flow-event-bridge`: Flow/subagent events from `pi.events` are now captured by the generic EventBus intercept rather than individual channel subscriptions. The `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` are still used for eventType naming, but registration is unified.

## Impact

- **`src/extension/bridge.ts`**: Core event subscription loop rewritten — replaces 12-item whitelist with full type list (~27 types minus 2 exclusions). EventBus monkey-patch added.
- **`src/extension/flow-event-wiring.ts`**: May be simplified or absorbed — the EventBus intercept in bridge.ts can handle flow event forwarding generically, though the eventType rename mappings still need to live somewhere.
- **Server/client**: No changes needed. The protocol (`DashboardEvent.eventType: string`) is already open-ended. The client's event reducer handles known types with dedicated logic and falls through to `rawEvent` for everything else. The `RawEventCard` renderer is already shipped.
- **Payload size**: Events like `before_agent_start` (contains prompts) and `resources_discover` (extension paths) may be larger than current traffic. The server's `MemoryEventStore` payload truncation already caps oversized events.
- **No breaking changes**: Existing event handling is additive — all currently-forwarded events continue to work identically.
