## 1. State replay: Extract image blocks from persisted sessions

- [x] 1.1 Update `state-replay.ts` to extract `type: "image"` content blocks from `toolResult` messages and include as `images` field on synthesized `tool_execution_end` events.
- [x] 1.2 Write tests for state replay covering: toolResult with image block, toolResult with text-only, toolResult with mixed content.

## 2. Event reducer: Store images on ChatMessage

- [x] 2.1 Extract `type: "image"` blocks from `data.result.content` in the `tool_execution_end` case of `event-reducer.ts` and store as `images` on the corresponding ChatMessage.
- [x] 2.2 Write tests for event reducer covering: tool_execution_end with image content populates ChatMessage.images, without images leaves undefined.

## 3. ReadToolRenderer: Render inline images

- [x] 3.1 Add optional `images?: ChatImage[]` to `ToolRendererProps` and thread it through from `ToolCallStep`.
- [x] 3.2 Update `ReadToolRenderer.tsx` to render `<img>` tags (max-width 512px, rounded, bordered) when images are present, falling back to syntax-highlighted code block when absent.
- [x] 3.3 Update `ToolCallStep.tsx` to default `expanded` to `true` when images are present on the ChatMessage.
- [x] 3.4 Write tests covering: image attachment renders img element, text-only renders code block, image tool call is auto-expanded.
