# Fork from Message

## Problem

Currently the dashboard only supports forking an entire session (from the latest entry). Pi's TUI has a tree selector that lets you pick any message to fork from. The dashboard lacks this — there's no way to fork from a specific point in the conversation.

## Solution

Add a "Fork from here" button on user and assistant messages in ChatView. When clicked, the server creates a pruned session file (root → target entry) using pi's `SessionManager.createBranchedSession(entryId)`, then spawns `pi --fork` on that pruned file.

## Scope

- Propagate `entryId` from session entries through events to client chat messages
- Extend the `resume_session` protocol message with an optional `entryId`
- Server-side: when `entryId` is present, create a branched session file before forking
- Client-side: render a fork button on user/assistant turn boundaries in ChatView

## Out of Scope

- Full tree picker UI (pi's TUI-style tree selector)
- Branch visualization (showing which sessions are forks of which)
- Forking from tool calls or model changes

## Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/shared/state-replay.ts` | Attach `entryId` to `message_start` and `message_end` events |
| 2 | `src/shared/protocol.ts` | Add `entryId` to event forward payload (if not already flexible) |
| 3 | `src/client/lib/event-reducer.ts` | Store `entryId` on `ChatMessage` type |
| 4 | `src/shared/browser-protocol.ts` | Add optional `entryId` to `ResumeSessionBrowserMessage` |
| 5 | `src/server/browser-handlers/session-action-handler.ts` | If `entryId` present → `SessionManager.open()` → `createBranchedSession(entryId)` → fork from pruned file |
| 6 | `src/client/hooks/useSessionActions.ts` | Extend `handleResumeSession` to accept optional `entryId` |
| 7 | `src/client/components/ChatView.tsx` | Add "Fork" button on user/assistant messages |

## Risks

- `SessionManager` import on server side — need to verify the pi SDK is available as a dependency
- Entry ID stability across replays — IDs are UUIDs set at creation time, should be stable
