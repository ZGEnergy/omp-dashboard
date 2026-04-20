## Context

The dashboard is a React + WebSocket client that communicates with a Node.js server, which in turn communicates with pi sessions via a bridge extension. Several UX issues span client rendering bugs, state synchronization gaps between server and client, and missing command interception in the extension layer. All fixes are contained to existing modules with no new architectural patterns.

## Goals / Non-Goals

**Goals:**
- Fix all identified rendering/UX bugs in a single batch
- Improve model selection UX with better search
- Ensure state stays in sync after settings changes (no restart needed)
- Make `/skill` commands work from dashboard the same way they do in pi CLI

**Non-Goals:**
- Linux Electron first-run crash (deferred — needs investigation with logs)
- `/tree` or rewind functionality (existing fork-from-message is sufficient)
- New roles management panel
- Package predownload suggestions

## Decisions

### 1. Terminal tab close button — CSS fix only

The close button uses Tailwind's `opacity-0 group-hover:opacity-100` pattern but the parent `<div>` is missing the `group` class. One-class fix, no structural change.

### 2. Terminal route consolidation — redirect, don't remove

The legacy `/terminal/:id` route and keep-alive `terminalViews` array in `App.tsx` serve a fullscreen terminal view. Rather than removing the route entirely (which could break deep links), change `useMessageHandler.ts` to navigate to `/folder/:cwd/terminals` when `terminal_created` fires. The old route can be deprecated later.

**Alternative considered:** Remove `/terminal/:id` entirely. Rejected because it requires verifying no other code references it and could break bookmarks.

### 3. Provider save → model refresh via REST-triggered WebSocket broadcast

After `PUT /api/providers` succeeds on the server, the server broadcasts a `credentials_updated` message to all connected pi sessions via the pi gateway. The bridge extension already handles `credentials_updated` by refreshing the model registry and pushing `models_list` back. This reuses the existing OAuth credential refresh path.

**Server change:** In the providers PUT handler, after writing the config, call `piGateway.broadcast({ type: "credentials_updated" })`.

**Alternative considered:** Client-side polling for model changes after save. Rejected because the `credentials_updated` → `models_list` pipeline already exists and just needs to be triggered.

### 4. Package card instant update — event-driven refresh in useInstalledPackages

`useInstalledPackages` currently only refreshes when explicitly called. Add a `pi-package-event` DOM event listener that triggers a re-fetch on any `package_operation_complete` with `success: true`. This makes ALL instances of the hook (both in `PackageBrowser` and `GlobalPackagesSection`) stay in sync regardless of which component initiated the operation.

**Alternative considered:** Shared context/store for installed packages. Rejected as over-engineering — the event listener pattern is simpler and already used by `usePackageOperations`.

### 5. Device code flow — button instead of auto-open

Replace the immediate `window.open(data.verificationUri, "_blank")` in `ProviderAuthSection.tsx` with a modal showing the device code, a copyable URL, and an explicit "Open Registration Page" button. The user code is already displayed; only the auto-open behavior changes.

### 6. Model search — multi-token AND + provider dropdown

**Search logic:** Split the filter string on whitespace, require ALL tokens to match somewhere in `${provider}/${id}`. This is a one-line filter change.

**Provider dropdown:** Extract unique providers from the models list, render a `<select>` above the text filter with "All Providers" as default. When a provider is selected, pre-filter models before the text search applies.

**Alternative considered:** Pill-based provider tags in the input. Rejected for being higher effort with no clear UX benefit over a simple dropdown.

### 7. /skill command interception in bridge.ts sessionPrompt

In the `sessionPrompt` callback in `bridge.ts`, before the fallback `sendUserMessage`:

1. Check if the text matches `/skill:<name>` pattern
2. Call `pi.getCommands()` to find the matching command with `source: "skill"`
3. If found and `path` is set, read the SKILL.md file via `fs.readFileSync`
4. Send the SKILL.md content prepended to the user's message (or as context) via `pi.sendUserMessage`

This mirrors how the pi CLI activates skills — loading the skill file content into the conversation context.

**Alternative considered:** Emitting a pi event to trigger the skill handler natively. Rejected because the extension API doesn't expose a `triggerCommand` method, and `sendUserMessage` with the SKILL.md content achieves the same result.

### 8. Fork loses last assistant message — event-reducer replay fix

Root cause: When a forked session replays events, `message_end` fires but `streamingText` is empty because replay doesn't include incremental `message_update` deltas — only the final `message_end` with the complete `data.message` object. The current code checks `if (next.streamingText)` and when it's empty, falls through to a `turnSeparator` instead of rendering the message.

The `message_end` event already carries the full assistant message in `data.message.content`. The fix: when `streamingText` is empty, extract text content from `msg.content` (same extraction logic already used in `message_update`) and use that as the message content.

```
message_end handler:
  1. if streamingText → use streamingText (current live behavior, unchanged)
  2. else if msg.content has text → extract and use it (NEW: replay/fork fix)
  3. else if lastMsg is toolResult → add turnSeparator (existing, unchanged)
```

This is safe because the text extraction is the same logic used in `message_update` and the fallback order preserves existing behavior for tool-only turns.

## Risks / Trade-offs

- **[credentials_updated broadcast]** Broadcasting to all sessions on every provider save could cause brief model list flicker if many sessions are open. → Mitigation: This is an infrequent operation (settings save) so the broadcast cost is negligible.
- **[SKILL.md injection via sendUserMessage]** The skill content is sent as a user message rather than through pi's native command pipeline, so skill activation won't appear in pi's command logs. → Acceptable trade-off for dashboard UX. Can be refined later if pi exposes a command trigger API.
- **[useInstalledPackages event listener]** Every instance of the hook will re-fetch on any package event, causing parallel API calls. → Mitigation: Package operations are infrequent. Could add a debounce if needed later.
