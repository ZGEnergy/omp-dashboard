## Context

pi-flows stores edit-mode (`flows.editFlow`) as a two-tier setting resolved at session start (`edit-flow-config.ts`, verified):

```
isEditFlowEnabled(cwd) = projectFlag(<cwd>/.pi/settings.json)
                      ?? globalFlag(~/.pi/agent/settings.json)
                      ?? false          // project overrides global
setEditFlowFlag(cwd)   → always writes <cwd>/.pi/settings.json (never global)
```

The dashboard bolted a **third** store on top: `~/.pi/dashboard/config.json#plugins.flows.editFlow` (a single global bool), reconciled into every session by a per-session `useEffect` in `SessionFlowActionsClaim`. That reconcile short-circuits on `flows.length === 0` (never activates in a fresh cwd) and stamps the same global value into every open project's file (destroys manual per-project values).

Since the earlier draft of this change, #232 (`folder-resource-activation-toggle`) landed and changed the terrain:
- The DirectorySettings surface (`/folder/:cwd/settings`) is now the established home for folder-scoped "installed but active?" controls.
- `POST /api/resources/reload { scope: "local"|"global", cwd? }` exists, tested, and reloads affected sessions via the universal `/reload` interceptor (`handleSendPrompt` — headless→respawn, TUI→prompt), which works on all session types and in Electron.
- The route pattern for scope-aware settings writes exists (`resource-activation-routes.ts`).

The folder card/sidebar is simultaneously being **compacted** (`focus-driven-folder-compaction`, `accordion-workspace-folders`), so new per-folder controls must not land on the card.

Constraint: the flows-plugin is **decoupled** — it contributes UI only through slots.

## Goals / Non-Goals

**Goals:**
- Per-cwd edit-mode control on the folder settings page (no folder-card / session-card clutter), working at zero flows and with zero open sessions.
- Global default keeps a UI (retargeted to pi's real global layer), and the dashboard keeps **no private copy**.
- Toggling applies live via the landed folder-scoped reload endpoint.
- A **generic** `folder-settings-section` slot, so any plugin gains a per-cwd settings surface (not a flows-only hack).

**Non-Goals:**
- Changing pi-flows (resolution + `session_start` reconcile already correct).
- A session-card edit-mode switch (deprecated; superseded by this design).
- Toggling pi *resources* (that is #232's domain; `flows.editFlow` is a custom settings key, not a resource array entry).
- Selecting a default/attached flow per cwd (separate feature).

## Decisions

### Decision 1: Socket = new generic `folder-settings-section` slot on DirectorySettings
Add the slot (react-only, multiplicity many, props `{ cwd }`) and host it in `DirectorySettings`. flows-plugin claims it with the edit-mode toggle.
- **Alternative — session-card flows subcard switch (the earlier draft):** rejected — clutters a surface being compacted, requires a live session, and ties a cwd-scoped setting to a session-scoped control.
- **Alternative — `sidebar-folder-section`:** rejected — that is the folder card itself; same clutter objection.
- **Why a shell change is now acceptable:** the earlier draft rejected DirectorySettings because "a decoupled plugin cannot contribute there without a shell change". The shell change is now a one-slot generic capability with multiple prospective consumers (kb, memory, automation), matching how `settings-section` already works for the global page.

### Decision 2: Write path = server-side scope-aware JSON merge (not the session event)
A new server route (pattern: `resource-activation-routes.ts`) exposes GET `{ project, global, effective }` and PUT `{ scope: "project"|"global", enabled }`. The write is a format-preserving JSON merge of `flows.editFlow` into `<cwd>/.pi/settings.json` or `~/.pi/agent/settings.json`.
- **Why not `flow_management { set-edit-mode }` (the earlier draft's path)?** It requires a connected session for that cwd; the folder settings page must work session-less (bootstrap case). One write path is simpler than two; pi-flows re-reads the file at `session_start` regardless of who wrote it.
- `flows.editFlow` is a custom key, so pi's `SettingsManager` typed setters (resource arrays) don't apply; the merge is ~10 lines and test-covered.

### Decision 3: Reload = landed `POST /api/resources/reload { scope: "local", cwd }`
After a project-scope write, the client calls the existing endpoint; it reloads every connected session whose cwd matches (no-op when none). Global-scope writes offer the `{ scope: "global" }` variant. This inherits the universal reload primitive's cross-platform behavior (headless RPC, tmux, Windows Terminal, Electron) — no new reload mechanism, and the endpoint already idle-routes via the session-action interceptor.
- Supersedes the earlier draft's client-side `send_prompt { text: "/reload" }` + idle-gating tasks: the server endpoint wraps the same primitive.

### Decision 4: Effective-value read-back replaces the private config everywhere
- The folder toggle displays `effective` with a "from global" hint when `project` is unset.
- `SessionFlowActionsClaim`'s `editMode` gating (New/Edit action visibility) switches from `usePluginConfig` to the effective read-back for the session's cwd.
- `FlowsSettings` keeps its global toggle UI but reads/writes the `global` scope via the same route.
- `configSchema.json` drops `editFlow`; the reconcile `useEffect` is deleted. No dashboard-private copy remains.

## Risks / Trade-offs

- **Format preservation on settings.json merge** → read-modify-write preserving unknown keys; tests cover file-absent, key-absent, and foreign-keys-present cases.
- **Trust gating** → pi-flows honors the project file only for trusted projects; in an untrusted project the write persists but `isEditFlowEnabled` may ignore it. The toggle shows effective state from file contents, which may overstate effect in untrusted cwds — document; do not block the write.
- **Reload interrupts work** → the landed endpoint routes through the session-action interceptor; behavior matches package-install reloads users already know. Document that toggling reloads affected sessions.
- **Stale dashboard config values** → old `plugins.flows.editFlow` becomes inert; no migration write; rollback = revert, old key resumes being read.
- **Slot scope creep** → `folder-settings-section` is react-only/many with a `{ cwd }` prop only; no descriptor tier until a second consumer needs it.

## Migration Plan

1. Ship slot + route + flows-plugin claim + config/reconcile removal in one change.
2. No data migration: existing `plugins.flows.editFlow` ignored going forward; users re-set global via the retargeted FlowsSettings (writes `~/.pi/agent/settings.json`).
3. Rollback: revert the change.

## Open Questions

- Should the global-scope write also offer the global reload (`{ scope: "global" }` reloads all sessions), or leave global changes to apply at next session start? (Lean: offer it, default off.)
- Does `DirectorySettings` need a section-ordering convention once multiple plugins claim the slot (priority field like other slots)? (Lean: reuse the existing claim `priority`.)
