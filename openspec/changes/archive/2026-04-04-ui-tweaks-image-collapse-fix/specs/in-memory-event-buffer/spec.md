## ADDED Requirements

### Requirement: Image data preservation during truncation
The event store string truncation SHALL preserve base64 image data fields. When truncating object fields, if a key is `"data"` and the parent object contains a `"mimeType"` key, the value SHALL NOT be truncated.

#### Scenario: Image base64 data preserved
- **WHEN** a `message_start` event contains a user message with an image content block `{ type: "image", data: "<200KB base64>", mimeType: "image/png" }`
- **THEN** the event store SHALL store the full `data` string without truncation

#### Scenario: Non-image data fields still truncated
- **WHEN** an event contains an object with `{ data: "<large string>" }` but no `mimeType` key
- **THEN** the `data` field SHALL be truncated per the normal max string size limit

#### Scenario: Other string fields still truncated alongside images
- **WHEN** a `message_start` event contains both an image content block and a large `thinking` field
- **THEN** the `data` field in the image block SHALL be preserved AND the `thinking` field SHALL be truncated normally
