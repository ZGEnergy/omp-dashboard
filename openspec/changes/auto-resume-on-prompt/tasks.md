## 1. Shared Types & Protocol

- [ ] 1.1 Add `resuming?: boolean` to `DashboardSession` in `src/shared/types.ts`
- [ ] 1.2 Add `AutoResumeNavigateMessage` (`{ type: "auto_resume_navigate", oldSessionId, newSessionId }`) to `ServerToBrowserMessage` union in `src/shared/browser-protocol.ts`

## 2. Pending Resume Registry

- [ ] 2.1 Create `src/server/pending-resume-registry.ts` with `PendingResumeRegistry` interface and factory function (Map<cwd, PendingResume>, 30s expiry, record/consume/dispose methods) — follow `PendingForkRegistry` pattern
- [ ] 2.2 Write tests for `PendingResumeRegistry`: record, consume, expiry timeout, overwrite on same cwd, dispose

## 3. Server-Side Auto-Resume Logic

- [ ] 3.1 Instantiate `PendingResumeRegistry` in `browser-gateway.ts` (or accept as dependency)
- [ ] 3.2 In `send_prompt` handler: detect ended session, validate sessionFile exists, record pending resume, set `resuming: true` on session, broadcast `session_updated`, spawn pi with continue mode. On spawn failure: clear pending resume and reset `resuming` flag.
- [ ] 3.3 In `server.ts` `session_register` handler: after existing logic, check `pendingResumeRegistry.consume(cwd)`. If entry exists: send queued prompt to new session, hide old session (`hidden: true`, `resuming: false`), broadcast `session_updated` for old session, broadcast `auto_resume_navigate`.
- [ ] 3.4 Add `onTimeout` callback to `PendingResumeRegistry` entries — on expiry, clear `resuming` flag on old session and broadcast `session_updated`

## 4. Client-Side Navigation

- [ ] 4.1 In `App.tsx` message handler: handle `auto_resume_navigate` — call `navigate(`/session/${msg.newSessionId}`)` 
- [ ] 4.2 Ensure auto-subscribe fires for the new session (existing `session_added` handler already subscribes active sessions)

## 5. Session Card Visual Indicator

- [ ] 5.1 In `SessionCard.tsx` `ActivityIndicator`: add check for `session.resuming` — return `<span className="text-yellow-400">Resuming…</span>` before the ended check
- [ ] 5.2 In `SessionCard.tsx` status dot: when `session.resuming` is true, use pulsing yellow dot class (`bg-yellow-500 animate-pulse`) instead of ended grey

## 6. Testing

- [ ] 6.1 Write integration test: `send_prompt` to ended session triggers resume flow (sets resuming, spawns, queues prompt)
- [ ] 6.2 Write integration test: `session_register` with pending resume flushes prompt, hides old session, sends navigate message
- [ ] 6.3 Write test: spawn failure clears resuming flag and pending entry
