# Upstream Sync Conflict Decisions

Merge base: e75445fce828ada2a037fc0ddbd32ff92c8c2297.
Ours commit: a5eb0ef6b19cfc333ccfe6f7101227ec739858ea.
Upstream commit: 5a06c24d0b62080776acc55560164eda21010d8e.
Decision rule: upstream same-intent behavior wins; ZGE OMP and push behavior stays.

## 1. package.json
Conflict: root dependency ranges diverged at lines 96-105.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: workspace packages target 0.6.1.
Ours behavior: workspace packages target 0.5.4; root keeps htmlparser2@^12.0.0.
Test map: root manifest parse; lockfile synchronization.
Dependency map: root @blackbelt-technology/pi-dashboard-{extension,server,web}; direct htmlparser2.
Chosen action: adopt upstream 0.6.1 ranges; retain htmlparser2@^12.0.0.
Compatibility impact: workspace links match package versions; OMP parser dependency remains available.
Proof command: node -e "for (const f of ['package.json','packages/extension/package.json','packages/server/package.json','package-lock.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('JSON parse ok')".
Proof result: JSON parse ok.
Residual risk: current source tree lacks direct htmlparser2 import; dependency audit remains follow-up.

## 2. packages/extension/package.json
Conflict: extension dependency ranges diverged at lines 33-44.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: bus client/shared packages target 0.6.1; OpenSpec CLI and model filtering dependencies enter extension.
Ours behavior: bus client/shared target 0.5.4; yaml@^2.9.0 remains direct.
Test map: TUI adapter suite; batch prompt smoke.
Dependency map: src/session-sync.ts uses minimatch; bridge OpenSpec flow uses @fission-ai/openspec; extension retains ws and yaml.
Chosen action: adopt upstream 0.6.1, OpenSpec, and minimatch requirements; retain yaml.
Compatibility impact: extension package aligns workspace protocol; OMP YAML consumers retain dependency.
Proof command: ./node_modules/.bin/vitest run --config /tmp/vitest-minimal.config.ts packages/extension/src/__tests__/tui-prompt-adapter.test.ts.
Proof result: 1 file passed; 13 tests passed.
Residual risk: batch path lacks dedicated repository test; smoke proof covers input plus select sequence.

## 3. packages/server/package.json
Conflict: server dependency ranges diverged at lines 35-48.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: runtime, converter, extension, shared packages target 0.6.1; pi coding agent targets 0.80.10.
Ours behavior: same package family targets 0.5.4; pi coding agent targets 0.80.6.
Test map: auth plugin and push dispatcher suites.
Dependency map: server package consumes plugin runtime, document converter, extension, shared, coding agent; chardet remains direct at line 59.
Chosen action: adopt upstream ranges; retain single chardet@^2.1.0 entry.
Compatibility impact: server runtime matches upstream APIs and lockfile package versions; duplicate chardet key avoided.
Proof command: npm install --package-lock-only --ignore-scripts --no-audit --no-fund.
Proof result: up to date.
Residual risk: npm install workspace dependency graph triggers unrelated ChatViewMenu duplicate build failure under full install.

## 4. packages/extension/src/bridge.ts
Conflict: bridge imports and TUI adapter registration diverged at lines 31-40, 57-68, 87-95, and 2341-2502.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: bridge imports headless RPC detection, default pi version reader, enabled-model filtering, and extracted TUI adapter.
Ours behavior: bridge keeps inline TUI adapter with OMP sequential batch prompts and multiselect no-op guard.
Test map: tui-prompt-adapter.test.ts; batch smoke.
Dependency map: bridge-context.ts, model-tracker.ts, session-sync.ts, tui-prompt-adapter.ts, prompt-bus.ts.
Chosen action: use upstream imports and single extracted adapter registration; add OMP batch handling inside extracted adapter; keep upstream confirm metadata and multiselect guard.
Compatibility impact: no parallel adapters; headless/model-filter/version-maintenance behavior stays; TUI batch and dashboard first-response-wins stay.
Proof command: ./node_modules/.bin/vitest run --config /tmp/vitest-minimal.config.ts packages/extension/src/__tests__/tui-prompt-adapter.test.ts.
Proof result: 1 file passed; 13 tests passed.
Proof command: ./node_modules/.bin/tsx -e 'import { PromptBus } from "./packages/extension/src/prompt-bus.ts"; import { createTuiPromptAdapter } from "./packages/extension/src/tui-prompt-adapter.ts"; (async()=>{ const bus=new PromptBus({timeoutMs:1000}); const ui={input:async()=>"typed",select:async()=>"picked",confirm:async()=>true,editor:async()=>"edited"}; bus.registerAdapter(createTuiPromptAdapter(ui,bus)); const response=await bus.request({pipeline:"command",type:"batch",question:"",metadata:{questions:[{method:"input",title:"Name"},{method:"select",title:"Mode",options:["picked"]}]}}); if(response.cancelled || response.answer!==JSON.stringify([{value:"typed"},{value:"picked"}])) throw new Error(JSON.stringify(response)); console.log("batch smoke ok") })()'.
Proof result: batch smoke ok.
Residual risk: batch smoke uses mocked UI methods; interactive terminal rendering remains outside focused unit scope.

## 5. packages/server/src/server.ts
Conflict: server imports diverged at lines 29-37 and 84-102.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: auth, pairing, persistence, process, and session modules use moved directories.
Ours behavior: old paths plus OMP auth bypass and full push dispatcher, token registry, FCM, Web Push, VAPID imports.
Test map: auth plugin, push dispatcher, push token registry, and VAPID suites.
Dependency map: auth/auth-plugin.ts; pairing/browser-gateway.ts; persistence/preferences-store.ts; spawn-process/process-manager.ts; session/*; push/*.
Chosen action: adopt upstream moved paths; retain validateWsUpgradeWithoutAuth and all push imports; repair push store imports to ../persistence/json-store.js.
Compatibility impact: upstream module layout resolves; trusted-network auth bypass survives; server push registrations survive.
Proof command: ./node_modules/.bin/vitest run --config /tmp/vitest-minimal.config.ts packages/server/src/__tests__/auth-plugin.test.ts packages/server/src/__tests__/push-dispatcher.test.ts packages/server/src/__tests__/push-token-registry.test.ts packages/server/src/__tests__/push-vapid.test.ts.
Proof result: 4 files passed; 46 tests passed.
Residual risk: push transport network delivery remains unexercised; tests use deterministic local transports and files.

## 6. package-lock.json
Conflict: root dependency entry and extension workspace entry diverged at lines 16-25 and 32552-32563.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: lockfile workspace entries target 0.6.1; extension includes OpenSpec and minimatch.
Ours behavior: lockfile targets 0.5.4; root and extension retain htmlparser2 and yaml integrations.
Test map: JSON parse; npm lockfile-only synchronization.
Dependency map: root workspace links; extension bus client/shared, OpenSpec, minimatch, ws, yaml; root htmlparser2.
Chosen action: merge upstream versions and dependencies; retain htmlparser2 and yaml; regenerate lockfile with npm.
Compatibility impact: lockfile matches all resolved manifests; npm reports clean dependency graph.
Proof command: npm install --package-lock-only --ignore-scripts --no-audit --no-fund.
Proof result: up to date in 878ms.
Residual risk: lockfile regeneration reflects current registry metadata; future npm versions may reorder entries.
