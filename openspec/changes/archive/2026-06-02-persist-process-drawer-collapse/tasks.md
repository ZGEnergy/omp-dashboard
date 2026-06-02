# Tasks

## 1. Shared protocol
- [x] 1.1 Add `processDrawerCollapsed?: boolean` to the `Session` shape (actual: `DashboardSession` in `packages/shared/src/types.ts`).
- [x] 1.2 Add client→server message `set_session_process_drawer { sessionId: string; collapsed: boolean }` to the message union (`browser-protocol.ts`).

## 2. Server persistence
- [x] 2.1 `meta-persistence.ts`: add `setProcessDrawerCollapsed(sessionFile, collapsed)`; persist under `<session>.meta.json#processDrawerCollapsed`. (Field added to `SessionMeta` in `session-meta.ts`.)
- [x] 2.2 `session-scanner.ts`: load `processDrawerCollapsed` into the Session on scan (mirror `displayPrefsOverride`).
- [x] 2.3 `session-meta-handler.ts`: `handleSetSessionProcessDrawer` → write via meta-persistence + rebroadcast session; dispatch wired in `browser-gateway.ts`.
- [x] 2.4 `server.ts`: wire the field through the `sessionManager.onChange` persistence path (mirror `displayPrefsOverride`).

## 3. Client
- [x] 3.1 `SessionCard.tsx` `useDrawerExpansion`: default = `!(session.processDrawerCollapsed ?? true)`; removed the `activityEmpty && drawerNonEmpty` contextual branch; reconciles authoritative value via `useEffect`.
- [x] 3.2 `onToggle`: optimistic local flip + send `set_session_process_drawer` over WS (threaded App→SessionList→SessionCard as `onSetProcessDrawer`/`onSetProcessDrawerCollapsed`).

## 4. Tests
- [x] 4.1 `SessionCard.test.tsx`: drawer collapsed by default; renders per stored value; toggle flips optimistically + calls `onSetProcessDrawerCollapsed`; reconciles cross-client broadcast.
- [x] 4.2 `meta-persistence.test.ts`: round-trips `processDrawerCollapsed`, preserves sibling fields.
- [x] 4.3 `session-meta-handler.test.ts`: `handleSetSessionProcessDrawer` persists + rebroadcasts; no-ops unknown session.

## 5. Verify
- [x] 5.1 `npm test 2>&1 | tee /tmp/pi-test.log` green (7099 passed, 19 skipped).
- [x] 5.2 Runtime-verified on live dashboard: WS `set_session_process_drawer { collapsed: true }` → server broadcast `session_updated { processDrawerCollapsed: true }` (cross-client sync) + written to `<session>.meta.json` (persists across reload) + reflected in `/api/sessions` read-back. Test residue cleaned up.
- [x] 5.3 Verified by construction: the value lives only in `<session>.meta.json`, which is deleted with the session — no orphan key can persist. Confirmed the field is confined to (and removable from) the meta file.
