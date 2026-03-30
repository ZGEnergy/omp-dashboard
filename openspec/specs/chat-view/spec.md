## ADDED Requirements

### Requirement: Optimistic pending card in chat
The chat view SHALL render an optimistic user message card at the bottom of the message list when `state.pendingPrompt` is set. The card SHALL use the same styling as a regular user message card but include an animated spinning icon to indicate processing.

#### Scenario: Pending card rendered
- **WHEN** `state.pendingPrompt` is defined
- **THEN** the chat view SHALL render a user-styled card at the bottom with the prompt text and a spinning loader icon

#### Scenario: Pending card removed on server event
- **WHEN** `state.pendingPrompt` becomes undefined (server confirmed or cancelled)
- **THEN** the optimistic card SHALL no longer be rendered

#### Scenario: Auto-scroll to pending card when following
- **WHEN** a pending card appears AND the user is at or near the bottom (within 50px)
- **THEN** the chat view SHALL auto-scroll to show the pending card

#### Scenario: No auto-scroll to pending card when scroll-locked
- **WHEN** a pending card appears AND the user has scrolled up (more than 50px from bottom)
- **THEN** the chat view SHALL NOT auto-scroll

### Requirement: Bash output event rendering
The chat view SHALL render `bash_output` events as styled cards in the message stream. Each card SHALL display:
- The command in monospace font
- The output in a pre-formatted scrollable block (max-height with overflow scroll)
- Exit code indicator: green for 0, red for non-zero
- A "silent" badge (e.g., "!!") when `excludeFromContext` is `true`, indicating output was not sent to the LLM

#### Scenario: Successful command rendered
- **WHEN** a `bash_output` event with `exitCode: 0` and `excludeFromContext: false` is in the event stream
- **THEN** the chat view SHALL render a card with the command, output, and green exit indicator

#### Scenario: Failed command rendered
- **WHEN** a `bash_output` event with `exitCode: 1` is in the event stream
- **THEN** the chat view SHALL render a card with a red exit code indicator

#### Scenario: Silent command badge
- **WHEN** a `bash_output` event with `excludeFromContext: true` is in the event stream
- **THEN** the card SHALL show a "!!" or "silent" badge to distinguish it from LLM-sent commands

### Requirement: Command feedback event rendering
The chat view SHALL render `command_feedback` events as inline status cards:
- `started`: Subtle info card with command name (e.g., "⏳ /compact in progress")
- `completed`: Success card
- `error`: Error card with the error message

#### Scenario: Started feedback rendered
- **WHEN** a `command_feedback` event with `status: "started"` is in the event stream
- **THEN** the chat view SHALL render an info-style card

#### Scenario: Error feedback rendered
- **WHEN** a `command_feedback` event with `status: "error"` is in the event stream
- **THEN** the chat view SHALL render an error-style card with the message
