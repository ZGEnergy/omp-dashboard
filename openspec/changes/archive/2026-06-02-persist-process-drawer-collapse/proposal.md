## Why

The background-processes drawer in the PROCESS subcard auto-expands whenever a session has background processes and no in-flight activity bar above them (the "pure-orphan" state — `contextualDefault = activityEmpty && drawerNonEmpty`, introduced by `redesign-process-list-activity-bar` Decision 4). In practice this means a session that is merely *holding* a few leaked dev-server PGIDs greets the user with a fully-expanded list every load. The user wants the opposite: the drawer SHOULD start collapsed, and the user's open/collapse choice SHOULD persist across reloads and sync across devices.

Today the per-card `override` lives only in component-instance state (`useState(null)` in `useDrawerExpansion`) — it resets on remount and is never persisted.

## What Changes

- **Default flips to collapsed.** Remove the `activityEmpty && drawerNonEmpty` auto-expand. A session with no stored choice renders the drawer collapsed. The always-visible `⚠ N background processes` summary row still surfaces the count, so collapsed ≠ hidden.
- **Per-session collapse state persists server-side.** The drawer's expanded/collapsed choice becomes a per-session boolean (`processDrawerCollapsed`) stored in the session's `.meta.json`, mirroring the existing `displayPrefsOverride` transport. It survives reload, syncs to every connected client via the session snapshot broadcast, and is pruned automatically when the session is deleted (its meta file goes with it).
- **New WS message.** `set_session_process_drawer { sessionId, collapsed }` carries the user's toggle from client → server-meta, mirroring `set_session_display_prefs`.

This explicitly supersedes "Decision 4" (contextual default-open) of `redesign-process-list-activity-bar`.

## Capabilities

### Modified Capabilities

- `session-process-tracking`: The drawer's initial expansion state is no longer contextual. Absent a stored per-session choice the drawer renders collapsed. A user toggle persists to `<session>.meta.json#processDrawerCollapsed`, is broadcast on the session object, and is honored on reload and on every connected client.

## Impact

**Depends on:** `redesign-process-list-activity-bar` (introduces the drawer + `useDrawerExpansion` + the "contextual default" requirement this change modifies). Land or archive that change first, or fold these edits in after it.

**Code touched:**
- `packages/shared/src/browser-protocol.ts` — add `processDrawerCollapsed?: boolean` to the `Session` shape; add client→server message `set_session_process_drawer { sessionId, collapsed }`.
- `packages/server/src/meta-persistence.ts` — add `setProcessDrawerCollapsed(sessionId, collapsed)`; load the field into the Session on scan (mirror `displayPrefsOverride`).
- `packages/server/src/browser-handlers/session-meta-handler.ts` — handle `set_session_process_drawer` → meta-persistence write + rebroadcast.
- `packages/server/src/server.ts` — wire the new field through `sessionManager.onChange` persistence path like `setDisplayPrefsOverride`.
- `packages/client/src/components/SessionCard.tsx` — `useDrawerExpansion` default becomes `session.processDrawerCollapsed ?? true` (collapsed); drop the `activityEmpty && drawerNonEmpty` branch; `onToggle` optimistically flips local state AND sends `set_session_process_drawer`.
- Tests: update `SessionCard.test.tsx` (default-collapsed + persistence send), `meta-persistence` test, `session-meta-handler` test.

**Not touched:**
- `ProcessList.tsx` — stays a controlled component (`expanded` / `onToggle` props unchanged).
- The bridge PGID scanner and the `⚠ N background processes` summary-row rendering.
- `DisplayPrefs` — deliberately NOT extended; the drawer toggle rides a parallel per-session lane on the same meta transport, keeping it out of the chat-display vocabulary (no stray checkbox in Settings ▸ Chat display).
