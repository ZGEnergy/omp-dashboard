## Why

The `ask_user` tool's `input` method only displays the `title` field in the dashboard UI. When the LLM needs to ask a detailed question, it either puts everything in `title` (ugly, no markdown) or invents a `question` field that gets silently dropped. The existing `message` parameter is described as "Additional context (for confirm)" so the LLM doesn't use it for other methods.

The result: the user sees "Check startup log from portable" but not the detailed instructions with code blocks that were meant to accompany it.

The ConfirmRenderer already supports a `message` body (title as heading, message as markdown body below). The InputRenderer, SelectRenderer, and MultiselectRenderer lack this entirely.

## What Changes

Propagate the `message` field through the full pipeline for all `ask_user` methods (not just confirm):

1. **ask-user-tool.ts** — Update `message` description to apply to all methods; pass it through `opts` in execute for input/select/multiselect
2. **ui-proxy.ts** — Extract `message` from opts and include in the `extension_ui_request` params for input/select/multiselect methods
3. **InputRenderer.tsx** — Add markdown message body below the title (same pattern as ConfirmRenderer)
4. **SelectRenderer.tsx** — Add markdown message body below the title
5. **MultiselectRenderer.tsx** — Add markdown message body below the title

## Capabilities

- `ask-user-tool` — Tool schema and execute logic
- `ui-proxy` — Extension-to-dashboard UI request forwarding
- `interactive-renderers` — Dashboard client interactive dialog components

## Scope

- 5 files changed, each with small additive edits
- No new dependencies
- Backward compatible: `message` is optional, existing tool calls without it are unaffected
- No changes to the pi SDK's `ctx.ui` interface signatures (message passes through the existing `opts` bag)
