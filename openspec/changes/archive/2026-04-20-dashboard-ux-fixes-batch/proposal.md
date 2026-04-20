## Why

The dashboard has accumulated a batch of UX bugs and missing features that hurt daily usability: terminal tab close buttons are invisible, saving providers doesn't refresh the model list until restart, package installs don't update card state, model search is too limited, the `/skill` command doesn't inject SKILL.md content, the GitHub OAuth device code flow auto-opens the browser without user consent, and forking from a message loses the last assistant message (shows only a separator line).

## What Changes

- **Terminal tab close X invisible**: Add missing `group` CSS class to tab container in `TerminalsView.tsx` so the `group-hover:opacity-100` close button actually appears on hover.
- **Terminal route consolidation**: Remove legacy `/terminal/:id` fullscreen route; redirect `terminal_created` navigation to the tabbed `/folder/:cwd/terminals` route.
- **Provider save → model refresh**: After saving LLM providers in Settings, broadcast a `credentials_updated` event to all sessions so the model registry refreshes and the Default Model selector populates without restart.
- **Package card instant update**: Make `useInstalledPackages` listen for global `pi-package-event` DOM events and auto-refresh on any successful operation, so `PackageBrowser`'s own installed state updates immediately.
- **GitHub device code: no auto-open**: Replace `window.open(verificationUri)` with a visible "Open Registration" button + copyable URL, giving the user control.
- **Model search improvement**: Replace single-substring `.includes(q)` with multi-token AND matching (space-separated tokens), and add a provider filter dropdown above the model list in `ModelSelector.tsx`.
- **/skill command SKILL.md injection**: In `bridge.ts` `sessionPrompt`, detect `/skill:xxx` commands, look up the skill's path from `pi.getCommands()`, read the SKILL.md file, and prepend its content to the user message so the LLM receives the skill context.
- **Fork loses last assistant message**: In `event-reducer.ts` `message_end` handler, when `streamingText` is empty (replay scenario), extract text content directly from `data.message.content` instead of falling through to the `turnSeparator` path. This fixes forked sessions showing a line instead of the last assistant message.

## Capabilities

### New Capabilities

_None — all changes modify existing capabilities._

### Modified Capabilities

- `terminals-view`: Tab close button visibility fix + consolidate terminal navigation to tab view only.
- `settings-panel`: Provider save triggers model refresh across all sessions and updates Default Model selector.
- `package-install`: Installed packages list auto-refreshes on any successful install/remove/update operation globally.
- `provider-auth-ui`: Device code flow shows explicit button instead of auto-opening browser.
- `model-selector`: Multi-token AND search + separate provider filter dropdown.
- `bridge-extension`: `/skill` commands intercepted and SKILL.md content injected into message context.
- `event-reducer`: `message_end` handler falls back to extracting text from the message object when `streamingText` is empty (replay/fork scenario).

## Impact

- **Client components**: `TerminalsView.tsx`, `SettingsPanel.tsx`, `ModelSelector.tsx`, `ProviderAuthSection.tsx`, `PackageBrowser.tsx`
- **Client lib**: `event-reducer.ts` (message_end replay fix)
- **Client hooks**: `useInstalledPackages.ts`, `useMessageHandler.ts`
- **Extension**: `bridge.ts` (sessionPrompt skill interception)
- **Server**: Provider save API needs to broadcast `credentials_updated` to connected sessions
- **Shared protocol**: No new message types needed — uses existing `credentials_updated` and `models_list`
