# Fix duplicate inlined screenshot (native image + path to same file)

## Why

A `browser` screenshot rendered in ChatView appears **twice, side-by-side**
("on parallel") on the **live** event path. The image content is correct — the
tool-result renderer is handed the same screenshot twice.

Root cause is in the bridge's tool-result image inliner
(`packages/extension/src/tool-result-image-inliner.ts`). It was designed for the
`browser` skill run **via bash**, whose result is **text-only**:

```
Screenshot saved: /Users/…/.agent-browser/tmp/screenshots/shot.png
```

The inliner finds that absolute path, reads the file, and **appends** a
`type:"image"` content block so the dashboard shows the picture inline.

But the **MCP `browser` tool** (`mcp__pi__browser`) returns a result that
already carries the screenshot as a **native `type:"image"` block** *plus* the
`Screenshot saved: <path>` text. The inliner has no guard for that shape: it
re-reads the path-referenced file and appends a **byte-identical second copy**.

```
MCP browser result (already complete):
  content: [
    { type:"text",  text:"Screenshot saved: /…/shot.png" }
    { type:"image", data:<shot>, mimeType:"image/png" }   ← native
  ]
        │  inlineToolResultImages() reads /…/shot.png and APPENDS
        ▼
  content: [ {text}, {image <shot>}, {image <shot>} ]     ← duplicate
        │  event-reducer.extractToolResultImages → 2 ChatImages
        ▼  ToolResultImages.map() in `flex … flex-wrap`
   [ screenshot ] [ screenshot ]                          ← side-by-side
```

The inliner's own header comment states its invariant — *"exactly one inline
image (not an image plus a dead link)"* — but that only held for text-only
results. Results that already carry the image break it.

## What Changes

1. **De-duplicate at byte granularity.** Before appending an inlined image, the
   inliner collects the base64 payloads of image blocks **already present** in
   the original result. A path whose inlined bytes **match an existing block** is
   treated as already displayed: its path is **stripped** from the text (so it is
   not also linkified) but **no second image block is appended**.

2. **Preserve the genuine mixed case.** A native image plus a path to a
   *different* file (distinct bytes) still inlines both — the byte-identity gate
   only suppresses true duplicates.

3. **Propagate strip-only rewrites.** The bridge applied the inliner's result
   only when `inlinedCount > 0`. The duplicate case strips a path without
   inlining a *new* image (`inlinedCount === 0`), so the bridge now applies the
   rewrite on a **result-identity change** instead. The inliner returns the same
   reference when nothing changed, so identity diff is a safe change signal.

## Impact

- Affected capability: `inline-artifact-image-paths`
- Affected code:
  - `packages/extension/src/tool-result-image-inliner.ts` — byte-dedup guard
  - `packages/extension/src/bridge.ts` — apply rewrite on result-identity change
  - `packages/extension/src/__tests__/tool-result-image-inliner.test.ts` — +2
    regression tests (MCP-shape → 1 image; native + different file → 2 images)
- No client, server, or protocol changes. Behavior is capture-time on the bridge.
- Chosen **byte-identity dedup** over a blunt "skip when any image present" so the
  existing *"preserves pre-existing non-text content blocks"* behavior (native
  image + path to a different file → 2 images) does not regress.
