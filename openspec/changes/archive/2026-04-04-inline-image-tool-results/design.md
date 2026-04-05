## Context

Pi's `Read` tool can read image files (jpg, png, gif, webp). The tool result is `{content: [{type: "text", text: "Read image file [image/png]"}, {type: "image", data: "<base64>", mimeType: "image/png"}], details: {}}`. The bridge's `extractSerializable` passes this through, and the event store's `truncateStrings` already preserves base64 `data` fields with sibling `mimeType`. However, the client-side `extractContentBlockText` function discards `type: "image"` blocks, so only the text string is displayed.

For persisted sessions, `state-replay.ts` also only extracts `type: "text"` content blocks from `toolResult` messages.

## Goals / Non-Goals

**Goals:**
- Display images inline in the dashboard when `Read` tool reads an image file
- Auto-expand tool call steps that contain images (visible without clicking)
- Support the same image types pi supports: jpg, png, gif, webp
- Work for both live events and replayed sessions

**Non-Goals:**
- Bridge or server-side changes (data already flows through correctly)
- Supporting image results from tools other than `Read`
- Thumbnailing or server-side image processing

## Decisions

### 1. Extract images from existing `data.result.content` in the event reducer

The image data is already present on `tool_execution_end` events as `data.result.content[].{type:"image", data, mimeType}`. The reducer just needs to extract these alongside the text, reusing the existing `ChatImage` type and `images` field on `ChatMessage`.

**Why not change the bridge?** The data already flows through correctly. Adding extraction in the bridge would duplicate logic and increase the forwarded payload size unnecessarily (the content array is already there).

### 2. Extract images in state-replay for persisted sessions

`state-replay.ts` synthesizes events from persisted session entries. The `toolResult` messages in persisted data have the same `content` array structure. We'll extract `type: "image"` blocks and include them as an `images` field on the synthesized `tool_execution_end` event data.

### 3. Auto-expand ToolCallStep when images are present

`ToolCallStep` defaults to collapsed (`expanded = false`). When the tool result has images, it should default to expanded so users see the image immediately without clicking. This is a simple initial state change based on whether images are present.

### 4. Render images in ReadToolRenderer

When `images` are present on the tool result, render `<img>` tags with max-width 512px. When no images, fall through to existing syntax-highlighted code block.

## Risks / Trade-offs

- **[Memory]** Large images increase client memory. → Mitigation: Pi already resizes images before returning them. The event store's existing LRU eviction handles server memory.
- **[Auto-expand UX]** Always expanding image tool calls could be noisy in sessions with many image reads. → Acceptable trade-off: image reads are infrequent, and users expect to see the image.
