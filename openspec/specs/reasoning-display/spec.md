## Purpose

Displays model reasoning/thinking content in the chat view as collapsible blocks, with live streaming support during generation.

## ADDED Requirements

### Requirement: Streaming thinking accumulation
The event reducer SHALL accumulate thinking content from `assistantMessageEvent` with `type: "thinking_delta"` into a `streamingThinking` field on `SessionState`. On `thinking_start`, the field SHALL be initialized to empty string. On each `thinking_delta`, the delta text SHALL be appended.

#### Scenario: Thinking delta arrives
- **WHEN** a `message_update` event contains `assistantMessageEvent.type === "thinking_delta"` with `delta` text
- **THEN** `state.streamingThinking` SHALL have the delta appended to its current value

#### Scenario: Thinking start resets accumulator
- **WHEN** a `message_update` event contains `assistantMessageEvent.type === "thinking_start"`
- **THEN** `state.streamingThinking` SHALL be set to empty string

### Requirement: Thinking block completion creates message
When a `thinking_end` event arrives, the reducer SHALL create a `ChatMessage` with `role: "thinking"` containing the accumulated thinking text, and reset `streamingThinking` to empty string.

#### Scenario: Thinking end flushes to message
- **WHEN** a `message_update` event contains `assistantMessageEvent.type === "thinking_end"`
- **THEN** a new message with `role: "thinking"` and content equal to the accumulated `streamingThinking` SHALL be appended to `state.messages`
- **AND** `state.streamingThinking` SHALL be reset to empty string

#### Scenario: Empty thinking block produces no message
- **WHEN** `thinking_end` arrives but `streamingThinking` is empty
- **THEN** no thinking message SHALL be created

### Requirement: Full thinking text storage
The reducer SHALL store the complete thinking text without truncation in the thinking message's `content` field.

#### Scenario: Long reasoning preserved
- **WHEN** a thinking block contains 10,000+ characters
- **THEN** the full text SHALL be stored in the message content

### Requirement: Thinking blocks render as collapsible chat items
The ChatView SHALL render messages with `role: "thinking"` as collapsible blocks, collapsed by default, with a brain icon and "Reasoning" label.

#### Scenario: Thinking message displayed collapsed
- **WHEN** a thinking message exists in the messages array
- **THEN** it SHALL render as a collapsed block with a brain icon and "Reasoning" label
- **AND** clicking it SHALL expand to show the full reasoning text

#### Scenario: Streaming thinking displayed
- **WHEN** `state.streamingThinking` is non-empty
- **THEN** a live reasoning block SHALL be displayed showing the streaming text with a visual streaming indicator

### Requirement: ChatMessage type supports thinking role
The `ChatMessage` interface SHALL include `"thinking"` as a valid `role` value.

#### Scenario: Type definition
- **WHEN** a ChatMessage is created with `role: "thinking"`
- **THEN** it SHALL be valid according to the TypeScript type definition
