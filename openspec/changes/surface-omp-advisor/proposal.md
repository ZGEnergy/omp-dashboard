# surface-omp-advisor

## Why

OMP v17 ships the harness **advisor**: a second model (the `advisor` model role) that
passively reviews every primary turn and injects `nit | concern | blocker` notes into the
session transcript as `customType: "advisor"` custom messages
(`@oh-my-pi/pi-coding-agent` `src/advisor/advise-tool.ts`, `src/session/agent-session.ts`
`#routeAdvice`). Per-session control exists only as the TUI builtin `/advisor on|off`;
global config keys (`advisor.enabled`, `advisor.subagents`, `advisor.syncBacklog`,
`advisor.immuneTurns`, `tier.advisor`, `modelRoles.advisor`) live in
`~/.omp/agent/config.yml`.

The dashboard already mirrors the global config (Settings → Agent (OMP) page +
Roles section), but the runtime feature is invisible and uncontrollable from the browser:

- **Advisor cards never render.** Live, the bridge already forwards the cards'
  `message_start` / `message_end` events (`agent-session.ts` `#preserveAdvisorCard` emits
  them via `agent.emitExternalEvent`; `packages/extension/src/bridge.ts` forwards both
  event types), but the client reducer only handles `role: "user" | "assistant"`
  (`packages/client/src/lib/event-reducer.ts`) and drops `role: "custom"`. On
  reload/resume, `packages/shared/src/state-replay.ts` skips persisted
  `type: "custom_message"` entries entirely (it only special-cases `type: "custom"` +
  `customType: "flow-event"`).
- **No per-session control channel exists.** The OMP ExtensionAPI
  (`src/extensibility/extensions/types.ts` `ExtensionContext` / `ExtensionActions`), the
  RPC method surface (`src/modes/rpc/rpc-mode.ts`: `set_model`, `set_thinking_level`, … —
  no advisor method, no generic command execution), and the bridge's slash-dispatch
  (extension commands only; `/advisor` is a *builtin*) all lack an advisor path. The
  only control point that works without an upstream harness change is spawn-time argv:
  `omp --advisor` (boolean flag, `src/commands/launch.ts`).

## What Changes

1. **Advisor cards in chat (live + replay).** New `advisor` chat-row role, an
   `AdvisorCard` renderer (collapsed one-line severity summary, expandable severity-railed
   notes — mirrors the TUI `advisor-message.ts` design), reducer mapping for the live
   events, and a `state-replay` mapping so cards survive refresh/resume.
2. **Spawn-time advisor toggle.** `spawn_session` gains optional `advisor?: boolean`
   (same old-server-ignores-unknown-field degradation as `gitWorktreeBase`); the server
   appends `--advisor` to the spawned omp argv and records the choice in the session
   `.meta.json`; the spawn UI gains a checkbox seeded from the mirrored global
   `advisor.enabled` value.
3. **Passive advisor chip.** Session surfaces show a display-only "Advisor" chip when
   the session was spawned with the flag or advisor card activity has been observed in
   the event stream. No control is claimed or implied.
4. **Live per-session toggle — explicitly deferred.** Blocked on an upstream OMP
   addition (advisor control on the ExtensionAPI or RPC surface). The exact upstream ask
   and the ready-to-build protocol design (typed `set_advisor_enabled` following
   `set_thinking_level`) are documented in `design.md` § Deferred track; no code here.

## Impact

- **Affected specs:** new capability `advisor-dashboard-surface`.
- **Affected code:**
  - `packages/shared/src/state-replay.ts` (replay mapping), `browser-protocol.ts`
    (`SpawnSessionBrowserMessage.advisor`, session-metadata field), session metadata types.
  - `packages/client/src/lib/event-reducer.ts` (row role + event mapping),
    `chat-virtual-rows.ts` (row case), new `components/AdvisorCard.tsx`,
    `components/ChatView.tsx` (render branch), `components/SessionList.tsx` /
    `WorktreeSpawnDialog.tsx` (checkbox), session chip surface, `lib/i18n-en-source.json`.
  - `packages/server/src/browser-handlers/session-action-handler.ts` (accept flag),
    `process-manager.ts` (`spawnPiSession` argv builder), `.meta.json` write path.
- **Compatibility:** additive only. New protocol fields are optional; old
  servers/bridges ignore them (established degradation precedent). No
  `packages/extension` (bridge) change required. No OMP/harness change required for this
  change's scope.

## Discipline Skills

- `doubt-driven-review` — the spawn-flag protocol field and session-metadata schema cross
  the browser→server→(harness argv) boundary; review the schema additions before they stand.
