## ADDED Requirements

### Requirement: Plugins SHALL emit UI intents via the bridge instead of running React code in the client

Plugin server entries SHALL describe per-session UI contributions as JSON `IntentNode` trees and broadcast them via `ServerPluginContext.broadcastToSubscribers` with message type `"plugin_intents"`. The plugin's client-side code (if any) SHALL NOT call `useUiPrimitive(...)` and SHALL NOT import shell components directly. The shell, on each connected client, SHALL render incoming intents by resolving primitive names through its local primitive registry.

Plugins that ALREADY emit intent broadcasts (after migration) SHALL NOT also register React component claims for the same slot — the migration is per-claim, not parallel. Plugins that have NOT yet migrated MAY keep their refs-registry claims; the slot consumer renders the legacy claim until the intent path is wired.

#### Scenario: Plugin broadcasts an intent, every connected client receives it

- **WHEN** a plugin running on the server calls `ctx.broadcastToSubscribers({type:"plugin_intents", pluginId:"flows", sessionId:"abc", slot:"session-card-action-bar", intent:{primitive:"action-list", props:{actions:[...]}}})` 
- **THEN** every connected client subscribed to session "abc" SHALL receive the message via the existing WebSocket fanout
- **AND** each client's `useMessageHandler` SHALL dispatch on `case "plugin_intents"` to store the intent in the local IntentStore
- **AND** each client's `SessionCardActionBarSlot` for session "abc" SHALL render the action-list intent via IntentRenderer
- **AND** the rendered UI SHALL be identical across all clients

#### Scenario: Intent with nested primitives

- **WHEN** the intent payload is `{primitive:"agent-card", props:{name:"Explore", body:{primitive:"markdown", props:{content:"..."}}}}`
- **THEN** IntentRenderer SHALL resolve "agent-card" from the registry and render with `name` as a string, AND resolve "markdown" from the registry for the `body` prop, passing its rendered React element as the AgentCardShell's body prop

#### Scenario: Plugin clears its contribution by emitting null intent

- **WHEN** plugin broadcasts `{type:"plugin_intents", pluginId:"flows", sessionId:"abc", slot:"content-view", intent:null}`
- **THEN** every client SHALL remove the previously-cached intent for that key from its IntentStore
- **AND** the slot SHALL no longer render anything from that plugin for that session

### Requirement: Intent trees SHALL declare action handlers as data, not function refs

Action handlers (e.g. onClick, onSubmit) SHALL appear in the intent tree as `ActionDescriptor` objects: `{pluginId, action, payload?}`. When the user triggers the action, the client SHALL send `{type:"plugin_action", pluginId, sessionId, action, payload}` back via WebSocket. The server SHALL route this to the plugin's registered handler.

Function references SHALL NOT cross the wire. Intent trees SHALL be JSON-serializable.

#### Scenario: User clicks a button, action round-trips to server

- **GIVEN** a rendered intent `{primitive:"button", props:{label:"Run"}, actions:{onClick:{pluginId:"flows", action:"flow.run", payload:{flow:"X"}}}}`
- **WHEN** the user clicks the button
- **THEN** the client SHALL send `{type:"plugin_action", pluginId:"flows", sessionId:..., action:"flow.run", payload:{flow:"X"}}` to the server via WebSocket
- **AND** the server SHALL dispatch the message to the plugin's `plugin_action` handler registered via `ctx.registerBrowserHandler("plugin_action", ...)`
- **AND** the plugin SHALL be able to mutate its state and emit new intent broadcasts in response

#### Scenario: Action from one client reflects in every client

- **GIVEN** two clients A and B both rendering the same intent with an onClick action
- **WHEN** client A's user clicks the button
- **THEN** the plugin handles the action server-side
- **AND** any state change broadcasts via `plugin_intents` reach BOTH clients
- **AND** both clients update their UI simultaneously

### Requirement: Reverse channel SHALL use `registerBrowserHandler` API

`ServerPluginContext.registerBrowserHandler(type, handler)` (currently stubbed as `(_type, _handler) => {}` in server.ts:1244) SHALL be wired through `browserGateway`'s message dispatch. Plugins SHALL register handlers for their action message types at activation.

#### Scenario: Plugin registers a browser handler at activation

- **WHEN** flows-plugin's `registerPlugin(ctx)` function calls `ctx.registerBrowserHandler("plugin_action", handler)`
- **THEN** every `plugin_action` message arriving at the browser gateway with `pluginId === "flows"` SHALL be dispatched to the registered handler
- **AND** the handler receives `(msg: { sessionId, action, payload })` and may emit further broadcasts

### Requirement: Server SHALL replay current intents on client subscribe

When a client subscribes to a session, the server SHALL replay the CURRENT intent state for that session (the latest broadcast intent per (pluginId, slot)) so reconnecting clients are not stranded with empty UI.

#### Scenario: Reconnecting client receives current intents

- **GIVEN** plugin "flows" has broadcast an intent for slot "content-header-sticky" on session "abc"
- **AND** a client that was disconnected during the broadcast
- **WHEN** the client reconnects and sends `{type:"subscribe", sessionId:"abc"}`
- **THEN** the server SHALL replay the most recent `plugin_intents` message for each (pluginId, slot) for session "abc"
- **AND** the reconnecting client renders the same UI as already-connected clients without waiting for the next state change

### Requirement: Unknown primitive names SHALL render a safe error placeholder

If an intent references a primitive name not registered in the client's primitive registry (e.g. a plugin emits "fancy-graph" but the client has no impl), IntentRenderer SHALL render a small inline error placeholder identifying the unknown primitive. It SHALL NOT throw, white-screen, or crash other slot contributions.

#### Scenario: Unknown primitive renders placeholder

- **GIVEN** an intent `{primitive:"undefined-primitive", props:{}}`
- **WHEN** IntentRenderer attempts to resolve "undefined-primitive" from the registry
- **THEN** the registry returns null (via `useUiPrimitiveOrNull`)
- **AND** IntentRenderer renders an `<UnknownPrimitive name="undefined-primitive" pluginId="..." />` element
- **AND** other slot consumers and other plugin contributions render normally
