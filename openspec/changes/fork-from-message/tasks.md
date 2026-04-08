## 1. Entry ID Propagation

- [ ] 1.1 Add `entryId` to `message_start` and `message_end` event data in `src/shared/state-replay.ts` (pass `entry.id` through `makeEvent`)
- [ ] 1.2 Add optional `entryId?: string` to `ChatMessage` interface in `src/client/lib/event-reducer.ts`
- [ ] 1.3 Populate `entryId` from `data.entryId` in the event reducer for `message_start` (user) and `message_end` (assistant) cases
- [ ] 1.4 Write tests for `replayEntriesAsEvents` verifying `entryId` is present in generated events
- [ ] 1.5 Write tests for event reducer verifying `entryId` propagates to ChatMessage

## 2. Protocol Extension

- [ ] 2.1 Add optional `entryId?: string` to `ResumeSessionBrowserMessage` in `src/shared/browser-protocol.ts`

## 3. Server-Side Branched Fork

- [ ] 3.1 In `handleResumeSession` (`src/server/browser-handlers/session-action-handler.ts`), when `mode === "fork"` and `entryId` is present, import and use `SessionManager.open(sessionFile).createBranchedSession(entryId)` to create a pruned session file
- [ ] 3.2 Pass the pruned session file path to `spawnPiSession` instead of the original
- [ ] 3.3 Handle errors (invalid entryId, file not found) and return `resume_result` with `success: false`
- [ ] 3.4 Write tests for the branched fork path (mock SessionManager)

## 4. Client UI

- [ ] 4.1 Extend `handleResumeSession` in `src/client/hooks/useSessionActions.ts` to accept optional `entryId` parameter and include it in the WebSocket message
- [ ] 4.2 Add a fork button (git-branch icon) to user and assistant messages in `src/client/components/ChatView.tsx`, visible on hover, hidden when `entryId` is undefined
- [ ] 4.3 Wire fork button click to call `handleResumeSession(sessionId, "fork", entryId)`
- [ ] 4.4 Verify fork button does not appear on toolResult, thinking, or other message types
