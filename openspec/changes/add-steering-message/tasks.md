## 1. Protocol types

- [ ] 1.1 Add optional `delivery?: "steer" | "followUp"` to `SendPromptToExtensionMessage` in `packages/shared/src/protocol.ts`.
- [ ] 1.2 Add optional `delivery?: "steer" | "followUp"` to `SendPromptToBrowserMessage` in `packages/shared/src/browser-protocol.ts`.

## 2. Bridge — steering delivery

- [ ] 2.1 Add optional `delivery` parameter to `sessionPrompt` callback type and `CommandHandlerOptions` interface.
- [ ] 2.2 In `command-handler.ts` `case "send_prompt"`: pass `msg.delivery` to `sessionPrompt` for slash commands.
- [ ] 2.3 In `command-handler.ts` passthrough branch: when `msg.delivery === "steer"`, skip `enqueueIfStreaming` and call `sendUserMessageWithImages` with `deliverAs: "steer"` directly. When `"followUp"` or undefined, keep existing behavior.
- [ ] 2.4 In `bridge.ts` `sessionPrompt` handler: when `delivery === "steer"`, call `pi.sendUserMessage(text, { deliverAs: "steer" })`. When `"followUp"` or undefined, keep existing `{ deliverAs: "followUp" }` behavior.
- [ ] 2.5 No changes to `PromptQueue` — steering messages bypass the bridge queue and go directly to pi's internal steering queue.

## 3. Client — delivery mode selection

- [ ] 3.1 `useSessionActions` / `handleSend`: accept optional `delivery` parameter, include in `send_prompt` payload.
- [ ] 3.2 `event-reducer`: add `delivery?: "steer" | "followUp"` to `PendingPrompt` interface.
- [ ] 3.3 `CommandInput`: Enter key sends `delivery: "steer"`, Alt+Enter sends `delivery: "followUp"`. Send button defaults to steer.
- [ ] 3.4 `ChatView` pending-prompt chip: show "(steering)" or "(follow-up)" label based on `pendingPrompt.delivery`.
- [ ] 3.5 `App.tsx`: pass `delivery` through from `queuedTexts` computation (if needed for chip dedup).
