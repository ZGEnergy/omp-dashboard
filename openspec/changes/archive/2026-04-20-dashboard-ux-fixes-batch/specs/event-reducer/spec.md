## MODIFIED Requirements

### Requirement: message_end extracts content from message object during replay
When a `message_end` event fires and `streamingText` is empty (as happens during event replay for forked or resumed sessions), the reducer SHALL extract text content from `data.message.content` and create an assistant message. The reducer SHALL NOT fall through to the `turnSeparator` path when the message contains text content.

#### Scenario: Forked session replays last assistant message
- **WHEN** a forked session replays events including a `message_end` with assistant text content
- **AND** no prior `message_update` events populated `streamingText`
- **THEN** the assistant message text is extracted from `data.message.content`
- **AND** an assistant message bubble is rendered in the chat view

#### Scenario: Tool-only turn still shows separator
- **WHEN** a `message_end` fires with no `streamingText`
- **AND** `data.message.content` contains no text (tool-use-only turn)
- **AND** the last message was a `toolResult`
- **THEN** a `turnSeparator` is added (existing behavior preserved)

#### Scenario: Live streaming continues to use streamingText
- **WHEN** a `message_end` fires during live streaming
- **AND** `streamingText` has accumulated text from `message_update` events
- **THEN** the assistant message uses `streamingText` content (existing behavior unchanged)
