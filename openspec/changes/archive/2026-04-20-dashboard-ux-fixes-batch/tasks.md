## 1. Terminal Tab Close Button & Route Fix

- [x] 1.1 Add `group` class to terminal tab container div in `packages/client/src/components/TerminalsView.tsx` (line ~97, the `<div key={t.id}>` element)
- [x] 1.2 In `packages/client/src/hooks/useMessageHandler.ts`, change `terminal_created` handler to navigate to `/folder/${encodeFolderPath(msg.terminal.cwd)}/terminals` instead of `/terminal/${msg.terminal.id}`, passing the new terminal ID as the active terminal
- [x] 1.3 Wire `activeTerminalId` prop in `TerminalsView` usage within `App.tsx` folderViewContent to accept the newly created terminal ID from navigation state or URL param

## 2. Provider Save → Model Refresh

- [x] 2.1 In the server's provider PUT handler (`packages/server/src/`), after successfully writing provider config, broadcast `credentials_updated` message to all connected pi sessions via the pi gateway
- [x] 2.2 Verify the existing `credentials_updated` handler in `packages/extension/src/bridge.ts` (~line 213) correctly refreshes the model registry and pushes `models_list` — no changes expected, just confirm the path works end-to-end

## 3. Package Card Instant Update

- [x] 3.1 In `packages/client/src/hooks/useInstalledPackages.ts`, add a `pi-package-event` DOM event listener that calls `refresh()` when any `package_operation_complete` event fires with `success: true`
- [x] 3.2 Add cleanup for the event listener in the hook's useEffect return

## 4. Device Code Flow — No Auto-Open

- [x] 4.1 In `packages/client/src/components/ProviderAuthSection.tsx`, remove the `window.open(data.verificationUri, "_blank")` call from `startDeviceCode`
- [x] 4.2 In the device code modal, add an explicit "Open Registration Page" button that calls `window.open(verificationUri, "_blank")` on click
- [x] 4.3 Ensure the verification URL is displayed as a copyable link in the modal

## 5. Model Selector — Multi-Token Search & Provider Filter

- [x] 5.1 In `packages/client/src/components/ModelSelector.tsx`, replace the single `.includes(q)` filter with multi-token AND matching: split filter on whitespace, require every token to match in `provider/id`
- [x] 5.2 Extract unique provider names from the models list into a sorted array
- [x] 5.3 Add a `providerFilter` state and a `<select>` dropdown above or beside the text filter input with "All Providers" as default + one option per unique provider
- [x] 5.4 Apply provider filter before text filter: when a provider is selected, pre-filter models to that provider, then apply multi-token text search
- [x] 5.5 Add the same provider filter + multi-token search to the Default Model selector in `packages/client/src/components/SettingsPanel.tsx` (replace the flat SelectField with a `DefaultModelSelector` component that has provider dropdown + text filter)

## 6. Fork Loses Last Assistant Message

- [x] 6.1 In `packages/client/src/lib/event-reducer.ts` `message_end` handler, after the `if (next.streamingText)` block, add an `else` branch that extracts text from `msg.content` (array of content blocks with `type: "text"` or plain string) using the same logic as `message_update`
- [x] 6.2 When extracted text is non-empty, push an assistant message with that content and the `entryId` from `data.entryId`
- [x] 6.3 Keep the existing `turnSeparator` fallback as a final else for tool-only turns with no text content

## 7. /skill Command SKILL.md Injection

- [x] 7.1 Root cause: `expandPromptTemplateFromDisk` in `prompt-expander.ts` only scans local `.pi/skills/` — misses globally installed skills and package skills
- [x] 7.2 Fix: add `pi` param to `expandPromptTemplateFromDisk`; when local scan misses, fall back to `pi.getCommands()` to find the skill path from any source (global, packages, etc.)
- [x] 7.3 Pass `pi` from `bridge.ts` `sessionPrompt` to `expandPromptTemplateFromDisk(text, cwd, pi)`
- [x] 7.4 If skill not found via either method, fall through to existing behavior (send text as-is)
