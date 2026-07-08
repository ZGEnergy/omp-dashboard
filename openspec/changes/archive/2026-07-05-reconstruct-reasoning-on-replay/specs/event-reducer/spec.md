## ADDED Requirements

### Requirement: Reasoning rows reconstructed from message content on replay
The reducer SHALL build `role:"thinking"` rows from a finalized assistant
message's content blocks when reconstructing a session on the replay path
(`isLive` is false). For each `message_end` whose `data.message.content`
contains `{ type: "thinking" }` blocks, the reducer SHALL push one
`role:"thinking"` ChatMessage per non-empty block, reading the text from the
block's `thinking` field (falling back to `text`), with `streamedLive: false`.
Reconstructed rows SHALL be pushed before the assistant text row so a plain
`[thinking, text]` message renders reasoning first; tool-bearing messages SHALL
be positioned by the existing content-order reorder pass. The reducer SHALL NOT
reconstruct on the live path (`isLive` true), where `thinking_end` already
created the rows.

This closes the gap where the cold-load path (`state-replay.ts`) emits no
`thinking_*` events, so reopened sessions previously showed no reasoning. The
reasoning text is present inline in the persisted message content and requires
no server round-trip.

#### Scenario: Reopened session rebuilds reasoning before the answer
- **GIVEN** a replayed `message_end` (`isLive` false) whose `message.content` is
  `[{ type: "thinking", thinking: "R" }, { type: "text", text: "A" }]`
- **WHEN** the reducer processes it
- **THEN** `messages` SHALL contain a `role:"thinking"` row with content `"R"`
  immediately followed by a `role:"assistant"` row with content `"A"`
- **AND** the thinking row SHALL have `streamedLive: false`

#### Scenario: Multiple thinking blocks preserved in content order
- **GIVEN** a replayed `message_end` whose `message.content` has thinking blocks
  `"First"` then `"Second"` followed by a text block
- **THEN** two `role:"thinking"` rows SHALL be created with content `"First"`
  then `"Second"`

#### Scenario: Live path is not double-created
- **GIVEN** a live turn (`isLive` true) that emitted `thinking_end` with content
  `"streamed reasoning"` (which pushed one `role:"thinking"` row)
- **WHEN** the terminal `message_end` arrives carrying the same
  `{ type: "thinking", thinking: "streamed reasoning" }` block in its content
- **THEN** exactly one `role:"thinking"` row SHALL exist (no duplicate)
