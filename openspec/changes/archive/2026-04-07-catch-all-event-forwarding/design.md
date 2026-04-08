## Context

The bridge extension in `src/extension/bridge.ts` subscribes to a hardcoded whitelist of 12 pi core event types and forwards them to the dashboard server. Flow/subagent events are handled separately in `src/extension/flow-event-wiring.ts` via explicit channel maps on `pi.events`. Any event not in these lists is invisible to the dashboard.

Pi's extension API has two event systems:
1. **`pi.on(event, handler)`** — Core lifecycle events (27 typed overloads). No wildcard support; backed by `Map<string, handler[]>` with `get(event.type)` lookup.
2. **`pi.events`** (EventBus) — Custom/flow events. Wraps Node.js `EventEmitter` with `on(channel, handler)` and `emit(channel, data)`. No `onAny()`.

The client-side already handles unknown events: the event reducer creates `rawEvent` messages for unrecognized types, and `RawEventCard` renders them as collapsed expandable JSON cards.

## Goals / Non-Goals

**Goals:**
- Forward all pi core events (except payload-heavy exclusions) to the dashboard server
- Intercept all `pi.events` EventBus emissions to catch custom extension events
- Keep existing special-case handling (model_select enrichment, OpenSpec detection) intact
- Simplify flow-event-wiring by unifying EventBus forwarding into a single intercept

**Non-Goals:**
- Changing the server or client rendering — both already handle arbitrary event types
- Capturing events from a hypothetical third event mechanism pi might add in the future
- Forwarding `context` events (full message arrays) or `before_provider_request` (raw API payloads) — too large

## Decisions

### 1. Subscribe to all pi core event types explicitly

**Decision**: Replace the 12-item `eventTypes` array with a comprehensive list of all pi core events from the typed API, minus two exclusions (`context`, `before_provider_request`).

**Rationale**: Pi's `on()` has no wildcard. The only way to catch core events is explicit subscription. All 27 types are known from `types.d.ts`. Subscribing as a passive observer (returning `undefined`) is safe — the runner ignores void returns for interceptor events.

**Alternative considered**: Monkey-patching the internal `extension.handlers` Map — rejected because it's captured in a closure with no external access.

**Structure**: Split into two groups in the code:
- **Enriched events**: Events with special handling (model_select, tool_execution_start for OpenSpec, agent_end for OpenSpec cleanup). These keep their existing callback bodies.
- **Pass-through events**: All remaining core events. Use a single loop with a generic forward-only handler that calls `mapEventToProtocol()` + `connection.send()`.

### 2. Monkey-patch `pi.events.emit` for EventBus catch-all

**Decision**: Wrap `pi.events.emit` to intercept all EventBus emissions. For channels that have a known rename mapping (flow/subagent maps), use the mapped `eventType`. For unknown channels, use the channel name directly as `eventType`.

**Rationale**: This catches flow events, subagent events, AND any custom events from other extensions — all with a single intercept point. The `pi.events` object is directly accessible from the extension API.

**Alternative considered**: Keep explicit per-channel subscriptions — rejected because it can't catch unknown/custom events from other extensions.

**Implementation**:
```ts
const origEmit = pi.events.emit.bind(pi.events);
pi.events.emit = (channel: string, data: unknown) => {
  // Forward to dashboard (with rename mapping if known)
  if (isSessionReady()) {
    const eventType = EVENT_BUS_MAP[channel] ?? channel;
    connection.send({ type: "event_forward", sessionId, event: { eventType, timestamp: Date.now(), data } });
  }
  // Call original emit
  origEmit(channel, data);
};
```

### 3. Unify EVENT_BUS_MAP from flow-event-wiring

**Decision**: Merge `FLOW_EVENT_MAP` and `SUBAGENT_EVENT_MAP` into a single `EVENT_BUS_MAP` constant used by the EventBus intercept. The `flow-event-wiring.ts` module retains its non-forwarding responsibilities (resend commands/flows on `flow:rediscover` and `flow:complete`), but the forwarding loops are removed — the monkey-patch handles that.

**Rationale**: Avoids duplicate forwarding. Keeps the rename mappings explicit and centralized.

### 4. Exclude `context` and `before_provider_request`

**Decision**: Do not subscribe to these two event types. They carry full message arrays and raw API payloads respectively, which can be tens of KB per event.

**Rationale**: The server's `MemoryEventStore` has payload truncation, but forwarding these events adds transport overhead with no dashboard value. They contain LLM conversation history and provider-specific request shapes that aren't useful for monitoring.

## Risks / Trade-offs

- **[Noise]** Events like `resources_discover`, `before_agent_start`, `session_before_*` will now appear in the event stream. → Mitigated: `RawEventCard` renders collapsed by default; events are stored but don't clutter the chat view.
- **[Payload size]** `before_agent_start` contains the prompt and system prompt. → Mitigated: Server-side `MemoryEventStore` truncation caps oversized payloads. Also, these events are infrequent (once per agent start).
- **[Monkey-patch fragility]** Wrapping `pi.events.emit` could break if pi changes the EventBus API. → Mitigated: The wrapper delegates to the original function; if the signature changes, the worst case is a runtime error logged per event, not a crash.
- **[Duplicate forwarding during transition]** If `flow-event-wiring.ts` forwarding loops aren't removed, events would be sent twice. → Mitigated: The task plan explicitly removes the forwarding loops while keeping the non-forwarding listeners.
