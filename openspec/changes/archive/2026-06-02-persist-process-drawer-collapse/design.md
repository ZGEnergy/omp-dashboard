# Design

## Context

The PROCESS subcard's background-processes drawer (`ProcessList.tsx`) is a controlled component; its `expanded` state is owned by `SessionCard.tsx` via the `useDrawerExpansion` hook. Today:

```ts
function useDrawerExpansion(activityEmpty, drawerNonEmpty) {
  const [override, setOverride] = useState<boolean | null>(null);
  const contextualDefault = activityEmpty && drawerNonEmpty;   // Decision 4
  const expanded = override ?? contextualDefault;
  const onToggle = useCallback(() => {
    setOverride(prev => !(prev ?? contextualDefault));
  }, [contextualDefault]);
  return { expanded, onToggle };
}
```

`override` is component-instance-only — lost on remount, never persisted.

We want: collapsed by default + per-session persistence + cross-device sync + auto-prune on session delete.

## Goals / Non-Goals

**Goals**
- Drawer starts collapsed when no stored choice exists.
- User's open/collapse choice persists per session, survives reload, syncs to all connected clients.
- Stale keys self-clean when a session is deleted.

**Non-Goals**
- A global "always collapse" setting (rejected: user chose per-session).
- A Settings-panel checkbox for this (rejected: it is a per-card affordance, not a global pref).
- Extending `DisplayPrefs` (rejected: semantic pollution — see Decision 2).

## Decisions

### Decision 1 — Reuse the per-session `.meta.json` transport, not localStorage

The existing `displayPrefsOverride` per-session lane already gives us everything: server persistence, cross-device sync (via session snapshot broadcast), and **automatic pruning** (the meta file is deleted with the session). localStorage would be browser-local and would need its own stale-key reaping. Mirror the proven lane.

```
  WS set_session_process_drawer { sessionId, collapsed }
        │
        ▼
  session-meta-handler ──▶ meta-persistence.setProcessDrawerCollapsed
        │                          │
        │                   <session>.meta.json#processDrawerCollapsed
        │                          │  (deleted with session ⇒ auto-prune)
        ▼                          ▼
  session object rebroadcast ──▶ client reads session.processDrawerCollapsed
```

### Decision 2 — Parallel field on Session, NOT inside DisplayPrefs

`DisplayPrefs` is explicitly "Display preferences for the chat / stream view." The drawer is a session-CARD element. Every `DisplayPrefs` field auto-renders a checkbox in Settings ▸ Chat display and a toggle in `ChatViewMenu`; folding the drawer bit in there would leak a confusing, mis-categorized checkbox into two surfaces and force an arbitrary value into all three `DISPLAY_PRESETS`. A dedicated `Session.processDrawerCollapsed?: boolean` rides the same meta transport without that pollution.

### Decision 3 — Resolution is `session.processDrawerCollapsed ?? true`

No global pref entry needed. Absent value ⇒ `true` (collapsed). This is the entire default-collapsed behavior; the old `activityEmpty && drawerNonEmpty` contextual branch is removed.

```
expanded = !(session.processDrawerCollapsed ?? true)
```

A user toggle writes the explicit boolean; thereafter resolution returns the stored value.

### Decision 4 — Optimistic local flip + WS persist

`onToggle` flips a local state immediately (no round-trip latency on the chevron) AND sends `set_session_process_drawer`. The authoritative value arrives back on the next session-snapshot broadcast and reconciles. Mirrors how `set_session_display_prefs` toggles behave.

## Risks / Trade-offs

- **Dependency ordering.** This modifies a requirement introduced by the still-in-progress `redesign-process-list-activity-bar` (31/34). If that change is re-scoped, this delta's MODIFIED target may drift. Mitigation: land/archive that change first, or fold these edits into it.
- **Optimistic/authoritative reconciliation flicker.** If the WS write fails, local state and server state diverge until the next snapshot. Acceptable for a cosmetic toggle; the next broadcast self-heals.

## Open Questions

- Should the per-row toggle also be reflected in the mobile sheet variant (`expanded={true}` hardcoded today)? Likely out of scope — the mobile sheet always shows full content by design.
