## Why

When pi's `Read` tool reads an image file, the image is displayed inline in the terminal but the dashboard only shows the text string `"Read image file [image/png]"`. Users generating or reviewing images (e.g., via nano-banana) have no way to see results without switching to the terminal. The dashboard should display images inline in tool results, matching the terminal experience.

## What Changes

- **Event reducer**: Extract image content blocks from `tool_execution_end` event data (already present in `data.result.content`) and store them on `ChatMessage`. Currently `extractContentBlockText` discards `type: "image"` blocks.
- **State replay**: Update `state-replay.ts` to extract image content blocks from persisted `toolResult` messages (currently only extracts `type === "text"`, discards image blocks).
- **ReadToolRenderer**: Detect image results and render `<img>` tags instead of the code block.
- **ToolCallStep**: Auto-expand tool calls that have image results so images are visible without clicking.

Note: The bridge's `extractSerializable` already passes the full `result` object through, and the event store's `truncateStrings` already preserves `data` fields with sibling `mimeType`. No changes needed in bridge or server.

## Capabilities

### New Capabilities
- `inline-image-tool-results`: Display base64 image content from tool results (Read tool) as inline images in the dashboard chat view, auto-expanded by default.

### Modified Capabilities
- `tool-renderers`: ReadToolRenderer gains image detection and inline rendering. ToolCallStep auto-expands for image results.

## Impact

- **Shared** (`src/shared/state-replay.ts`): Extract image blocks from persisted toolResult messages.
- **Client reducer** (`src/client/lib/event-reducer.ts`): Parse and store image attachments on ChatMessage for tool results.
- **Client renderer** (`src/client/components/tool-renderers/ReadToolRenderer.tsx`): Render inline images.
- **Client component** (`src/client/components/ToolCallStep.tsx`): Default to expanded when images are present.
- **No bridge, protocol, or server changes needed.**
