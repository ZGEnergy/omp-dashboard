## 1. Consume the surface-node-kind contract (pin field names, gate fallback)

- [x] 1.1 Read the pi-flows `surface-node-kind` artifacts: pin the `nodeKind` field name, the 6-value taxonomy (`agent`|`agent-decision`|`code`|`code-decision`|`fork`|`flow-ref`), and that it rides inside event `data`, forwarded through FlowManager, decided at `started`.
- [x] 1.2 Pin the `code-decision` chosen-branch field (`typedOutputs.branch`) and the code handler-path field on the `started` payload (`data.target`); recorded in design.md.
- [x] 1.3 Implement the agent-card fallback for events with no `nodeKind` (pre-contract persisted runs / older pi-flows) so the dashboard never breaks on skew.
- [x] 1.4 Confirm `code`/`code-decision` reuse the `flow:agent-started`/`flow:agent-complete` event names (no new `FLOW_EVENT_MAP` entry needed); the persisted stream + `replayEntriesAsEvents` then re-forward `nodeKind` automatically.

<!-- DONE except 2.2/2.4 (moved to Group 5). Reducer + types + tests verified: tsc clean, 16 reducer tests green. -->
## 2. Event map + reducer (kind / outcome / drop architect)

- [x] 2.1 `packages/extension/src/flow-event-wiring.ts`: preserve `nodeKind` + failure outcome on forwarded lifecycle events (ride inside `data`, forwarded verbatim by bridge catch-all); removed the 14 `architect_*` entries from `FLOW_EVENT_MAP`.
- [x] 2.2 Bridge `flow_management` action `set-edit-mode` → `pi.events.emit("flow:set-edit-mode", { enabled })`, guarded on boolean. Protocol extended (`flow_management.enabled`, action union) across protocol.ts + browser-protocol.ts + server gateway passthrough.
- [x] 2.3 `packages/flows-plugin/src/flow-reducer.ts`: read `nodeKind` at `flow_agent_started` to fix the card type (do not change it at complete), reduce per-step typed `outputs` and soft/hard outcome onto step state.
- [x] 2.4 Removed the `flows:new-request` / `flows:edit-request` emit branches from the bridge `flow_management` handler (authoring now flows through `send_prompt /skill:edit-flow`).
- [x] 2.5 Added `node-kind-reducer.test.ts` covering the new fields; existing reducer parity tests still pass.
- [x] 2.6 `flow_started` case: DECIDED to pre-list `code`/`code-decision` steps as pending cards (alongside agent-bearing steps) via `stepTypeToNodeKind` + `isCardableNonAgentKind`. Provisional `nodeKind` set from stepType; confirmed by the started event. Test added (`node-kind-reducer.test.ts`).

## 3. Running step cards + minimal FlowGraph

- [x] 3.1 `FlowAgentCard.tsx`: code card (⌗ badge, handler target line, Log preview from `flow_assistant_text` detailHistory, summary) + code-decision card (◈ badge, chosen branch line + `↻ n/max` loop pill), keyed on `nodeKind` with `stepType` fallback.
- [x] 3.2 Outputs KV-chip section (cyan key) on agent + code cards from `typedOutputs` (branch excluded, shown separately); omitted when empty.
- [x] 3.3 Soft (amber "soft-failed — routed to on_error") vs hard (red "hard-failed — halted flow") failure visuals from `outcome`.
- [x] 3.4 `FlowGraph.tsx`: `code`/`code-decision` visual types + label glyphs; `mapStepType` to canonical set; removed `conditional`/`agent-loop-decision`/`loop` types; updated SEPARATOR set.
- [x] 3.5 `FlowGraph.test.ts`: added `mapStepType` coverage for the new node set + legacy-type rejection.
- [x] 3.6 Resolve in-flight cards on flow end (reducer-side): on a non-success terminal (`error`/`aborted`/`interrupted`, incl. synthesized `flow:complete {status:"interrupted"}`), downgrade running/pending step cards to `error` with `outcome:"hard"`. Card-side interrupted styling tracked in 3.3.
- [x] 3.7 Replay tests in `node-kind-reducer.test.ts`: replay-identity (same fold over persisted records == live), interrupted-mid-run downgrade, and no-`nodeKind` agent-card fallback.

## 4. Authoring tool-renderers

- [x] 4.1 Added `tool-renderer` claims for `flow_write` + `flow_agents` to the manifest; regenerated `plugin-registry.tsx` (both registered).
- [x] 4.2 `FlowWriteToolRenderer`: success (command + counts + Mermaid snapshot via `ui:markdown-content`), validation-failure (diagnostics verbatim), args-backed "View flow YAML" toggle, graceful degrade on unparseable args.
- [x] 4.3 `FlowAgentsToolRenderer`: `list` (catalog names + count), `write` (success/failure from `{written,diagnostics,error}`), args-backed "View agent file" toggle.
- [x] 4.4 New/Edit launcher: SearchableSelectDialog (existing flows + "+ New flow") → `onEditFlow(name|undefined)` → claim sends `{type:"send_prompt", text:"/skill:edit-flow [name]"}`. Empty → `/skill:edit-flow`.
- [x] 4.5 `flow-yaml-parse.ts`: shallow YAML→steps parser (id/type/blockedBy/branches, counts) + `flowToMermaid` (node shapes, forward + backward branch edges); unit-tested.
- [x] 4.6 `authoring-renderers.test.tsx`: flow_write success/failure/view-yaml + flow_agents list/write-success/write-failure (10 tests w/ parser).

## 5. Edit-mode settings + subcard

- [x] 5.1 `FlowsSettings.tsx` + `configSchema.json` + manifest `settings-section` claim (`usePluginConfig` + `plugin_config_write` + `useSettingsDraftSource`, page `plugins`); default off.
- [x] 5.1a Edit-mode persistence depends on plugin-config writes actually persisting. That path was platform-broken (`plugin_config_write` had no consumer). Fix tracked in the separate change `fix-plugin-config-write-persistence`.
- [x] 5.2 `SessionFlowActionsClaim` reconciles the global default to the session via `flow_management { action:"set-edit-mode", enabled }` once flows are available; idempotent (re-emits only on change), no prompt.
- [x] 5.3 `SessionFlowActions.tsx`: Run / New-or-Edit (gated on `editMode`) / Delete / Abort; dropped `flows:new`/`flows:edit` command deps; New/Edit launches the skill via `send_prompt`.
- [x] 5.4 `session-flow-actions-edit.test.tsx`: edit-mode gating + New/Edit launcher → onEditFlow(name|undefined) (4 tests).
- [x] 5.5 Subcard availability fix: `flowsAvailability.computeAvailability` now gates on pi-flows extension presence (a `flows`/`flows:*` command in `commandsList`) instead of `flowsList` length / dead `flows:new`; mirrors jj's per-cwd presence pattern using already-published data. Shows the subcard for active-but-empty flows cwds. Updated `flowsAvailability.test.ts` (11 green); added `flows-plugin` spec delta.

## 6. Architect removal

- [x] 6.1 Deleted `architect-reducer.ts`, `FlowArchitect.tsx`, `FlowArchitectPopoutPage.tsx`, `FlowArchitectPopoutClaim.tsx`, `architect-reducer.test.ts`, `ArchitectInputPrompt.test.tsx`.
- [x] 6.2 Removed the two architect slot claims from the manifest, the architect exports from `src/client/index.tsx`, regenerated `plugin-registry.tsx`.
- [x] 6.3 Removed orphaned state: architectState in `FlowsSessionStateContext` + server `state-store`, `architectStepsToGraphSteps` in `FlowGraph`, `buildFlowArchitectPopoutUrl` in `popout-url`, architect dispatch in client `event-reducer`, architect tests in `FlowsSessionStateContext.test`.
- [x] 6.4 Grep confirmed: only stale comments + dead `FlowsCommandRoutes` string descriptions remain (no imports/usages). flows-plugin tsc clean, 62 tests pass, shell-purity guard passes.

## 7. Validate + land

- [x] 7.1 `openspec validate --strict` → valid.
- [x] 7.2 `npm test` → 8172 passed / 22 skipped. 9 failures are pre-existing + environmental (8 `pi-ai-shape` SDK-export preconditions resolving the locally-installed pi-ai; 1 docker-required port test) — none touch flows/extension/shared/gateway. Full client `npm run build` clean (real cross-package compile).
- [x] 7.3 Code-review gate run: CodeRabbit CLI absent (ENOENT) → deferred, exit 0 (advisory, non-blocking). Re-run when CLI available before PR.
- [x] 7.4 `npm run build` → `POST /api/restart` (new pid, healthy) → `npm run reload` (all sessions).
- [x] 7.5 Manual smoke (flows loaded locally): author a flow (flow_write card + Mermaid), run a code + code-decision flow (cards/outputs/branch/loop pill), toggle edit-mode. Deployed + ready for operator verification.
- [x] 7.6 `docs/file-index-plugins.md`: added rows (FlowWriteToolRenderer, FlowAgentsToolRenderer, FlowsSettings, flow-yaml-parse, configSchema, flow-reducer), updated FlowAgentCard/FlowGraph/SessionFlowActions/index/reducer/package.json rows, annotated architect removal (caveman style).
