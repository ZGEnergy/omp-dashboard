## Context

The `ask_user` tool forwards UI dialogs through a 4-layer pipeline: tool execute → `ctx.ui.*` method → ui-proxy → `extension_ui_request` message → client renderer. The `message` parameter already works end-to-end for `confirm` (ConfirmRenderer displays it as a markdown body below the title). For `input`, `select`, and `multiselect`, the `message` field is dropped at the tool execute layer because those `ctx.ui.*` calls don't pass it through.

The pi SDK's `ctx.ui.input(title, placeholder, opts?)` accepts an opaque `opts` bag that the ui-proxy already receives but ignores (only `signal` is extracted). This `opts` bag is the natural place to thread `message` through without changing any SDK signatures.

## Goals / Non-Goals

**Goals:**
- All `ask_user` methods (confirm, select, multiselect, input) support a `message` body displayed as markdown in the dashboard
- Backward compatible — `message` is optional, existing calls without it render identically
- TUI fallback concatenates `message` into the title string (TUI has no separate body slot)

**Non-Goals:**
- Changing the pi SDK's `ctx.ui` interface signatures
- Adding `message` support to the `editor` or `notify` methods (editor already has `prefill`, notify is fire-and-forget)
- Handling the LLM-invented `question` field (fixing the schema description will steer the LLM to use `message`)

## Decisions

### Thread `message` through the `opts` bag

**Choice:** Pass `message` as `opts.message` in the tool's execute, extract it in the ui-proxy, and include it in the `extension_ui_request` params dict.

**Rationale:** The `opts` parameter already flows through the entire pipeline. No new parameters, no SDK changes. The ui-proxy already receives `opts` for every method — it just needs to extract `message` and add it to the params dict sent to the server.

**Alternative considered:** Adding `message` as a positional parameter to `ctx.ui.input()`. Rejected — would require SDK signature changes and break the existing interface contract.

### Reuse ConfirmRenderer's message pattern

**Choice:** Add `message` display to InputRenderer, SelectRenderer, and MultiselectRenderer using the same pattern as ConfirmRenderer: `<MarkdownContent content={message} />` in a `text-xs text-[var(--text-secondary)]` div below the title.

**Rationale:** Consistent look across all interactive dialogs. ConfirmRenderer already proves the pattern works well with markdown content including code blocks.

## Risks / Trade-offs

- [TUI message display is lossy] In TUI mode, `message` is concatenated with `title` using `\n\n` separator, losing the visual hierarchy. → Acceptable — TUI is a fallback, dashboard is the primary UI.
- [Long messages in collapsed state] The resolved/cancelled state shows only the title (compact one-liner). Message is only visible while pending. → Correct behavior — collapsed state should be minimal.
