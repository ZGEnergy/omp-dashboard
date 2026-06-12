# Tasks

## 1. Core bridge primitive (`bridge-followup-queue`)
- [ ] 1.1 Add `enqueueSystemFollowup(text)` in `packages/extension/src/bridge.ts` — ungated push to `bridgeFollowUp` (respect `FOLLOWUP_QUEUE_CAP`, `isDraining`), then `setTimeout(() => drainFollowupQueue(0), 0)` → verify: unit test pushes after `agent_end` (gate closed) and asserts one fresh-turn `sendUserMessage`
- [ ] 1.2 Register `pi.events.on("dashboard:enqueue-followup", e => enqueueSystemFollowup(e.text))` → verify: emitting the event ships the entry
- [ ] 1.3 Test: user follow-up + system follow-up at same `agent_end` ship one-per-`agent_end`, no double `sendUserMessage` race → verify: call-count assertions on stub pi
- [ ] 1.4 Document the `dashboard:enqueue-followup` event contract in `docs/` (delegate to docs subagent, caveman style) → verify: split row added

## 2. Plugin scaffold (`pi-dashboard-goal-plugin`)
- [ ] 2.1 Create `packages/goal-plugin/` with `package.json` (publish name `pi-dashboard-goal-plugin`, deps: dashboard-plugin-runtime, pi-dashboard-shared, @mdi/js, @mdi/react; peer React 19) → verify: `npm install` resolves, workspace picks it up
- [ ] 2.2 Write `pi-dashboard-plugin` manifest: `id:"goal"`, `displayName:"Goal"`, `priority:100`, `bridge`/`server`/`client` entries → verify: `GET /api/plugins` lists it after restart
- [ ] 2.3 Confirm manifest validates against `manifest-validator` → verify: loader logs no validation error

## 3. Vendored judge core (bridge)
- [ ] 3.1 Copy + adapt `judge-service.ts`, `goal-manager.ts`, `goal-state.ts`, `continuation-prompt.ts` from `@ricoyudog/pi-goal-hermes` into `packages/goal-plugin/src/bridge/`; header comment records source commit → verify: typecheck passes, no TUI imports remain
- [ ] 3.2 Wire judge model + `maxTurns` (default 20) via `getPluginConfig` → verify: config override changes model id

## 4. Plugin bridge entry
- [ ] 4.1 `bridge/index.ts`: `pi.on("turn_end")` captures last assistant text; `pi.on("agent_end")` runs `evaluateWithJudge` → verify: judge invoked once per turn when goal active
- [ ] 4.2 On "continue" verdict emit `pi.events.emit("dashboard:enqueue-followup", { text })` — NO `pi.sendUserMessage` → verify: test asserts zero direct sends
- [ ] 4.3 On every status transition emit a `goal_status` snapshot to the plugin server (via the connection the bridge holds) → verify: server receives set/active/continuing/paused/done/cleared
- [ ] 4.4 `session_start` reload handling: active goal → pause reason `"reload"` → verify: reload test pauses, broadcasts paused
- [ ] 4.5 Abort/error handling: Ctrl+C / assistant `error|aborted` → pause with reason → verify: aborted-turn test pauses

## 5. Plugin server entry
- [ ] 5.1 `server/index.ts`: cache latest `goal_status` per session; `broadcastToSubscribers` on change → verify: subscriber receives latest on change
- [ ] 5.2 Replay cached snapshot on browser (re)subscribe → verify: late subscriber gets current state
- [ ] 5.3 `registerBrowserHandler("plugin_action", …)` for set/pause/resume/done/clear/subgoal; forward set/control intents to bridge via `pi.events` where needed → verify: each action mutates state + rebroadcasts
- [ ] 5.4 `registerPiHandler` (if the bridge reports status over the pi channel) wired → verify: status round-trips bridge→server

## 6. Plugin client
- [ ] 6.1 Own reducer keyed on the plugin `goal_status` message (via `useSessionEvents`) → verify: reducer unit test maps snapshot → state
- [ ] 6.2 `GoalChip` slot component: `● Pursuing n/m` / `⏸ Paused` / `✓ Achieved`; hidden when no goal → verify: render test per status
- [ ] 6.3 "Set Goal" control (input + pause/resume/clear buttons) dispatching `plugin_action` over the action bridge → verify: click dispatches expected payload
- [ ] 6.4 Compose existing dashboard tokens/primitives only (no new visual primitives) → verify: visual check via browser skill

## 7. Integration + collision safety
- [ ] 7.1 End-to-end: set goal from UI → loop runs headless → chip updates → judge "done" stops it → verify: manual run in a dashboard-spawned session
- [ ] 7.2 Collision test: queue a user follow-up mid-goal-turn → exactly one fresh turn per `agent_end`, no double-prompt → verify: assertion + manual
- [ ] 7.3 Works in terminal-hosted session for UI control (no slash dependency) → verify: tmux session set/pause from web UI
- [ ] 7.4 Graceful: uninstall plugin → no chip, no continuations, user follow-ups intact → verify: restart without plugin

## 8. Docs + publish
- [ ] 8.1 Add `packages/goal-plugin/` row to `docs/file-index-plugins.md` (delegate to docs subagent, caveman style) → verify: row present, alphabetical
- [ ] 8.2 README/plugin note: activation, judge model config, v1 scope (no typed `/goal`) → verify: matches `publishing-plugins.md` conventions
- [ ] 8.3 Confirm workspace publish flow includes the package → verify: `npm publish -ws` dry-run lists it
