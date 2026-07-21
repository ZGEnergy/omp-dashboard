# Upstream Sync Conflict Decision Records — Final Verification

Merge base: e75445fce828ada2a037fc0ddbd32ff92c8c2297.
Ours commit: a5eb0ef6b19cfc333ccfe6f7101227ec739858ea.
Upstream commit: 5a06c24d0b62080776acc55560164eda21010d8e.
Decision rule: upstream same-intent behavior wins; ZGE OMP and push behavior stays.

## 1. package.json — Final
Conflict: root dependency ranges diverged at lines 96-105.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: workspace packages target 0.6.1.
Ours behavior: workspace packages target 0.5.4; root keeps htmlparser2@^12.0.0.
Test map: root manifest parse; lockfile synchronization.
Dependency map: root @blackbelt-technology/pi-dashboard-{extension,server,web}; direct htmlparser2.
Selection rationale: adopt upstream 0.6.1 ranges.
Selection rationale: retain htmlparser2@^12.0.0.
Compatibility impact: workspace links match package versions; OMP parser dependency remains available.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Residual risk: htmlparser2 direct dependency lacks current source import.
Residual action: audit htmlparser2 before removal.

## 2. packages/extension/package.json — Final
Conflict: extension dependency ranges diverged at lines 33-44.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: bus client/shared packages target 0.6.1; OpenSpec CLI and model filtering dependencies enter extension.
Ours behavior: bus client/shared target 0.5.4; yaml@^2.9.0 remains direct.
Test map: TUI adapter suite; batch prompt smoke.
Dependency map: src/session-sync.ts uses minimatch; bridge OpenSpec flow uses @fission-ai/openspec; extension retains ws and yaml.
Selection rationale: adopt upstream 0.6.1, OpenSpec, and minimatch requirements.
Selection rationale: retain yaml.
Compatibility impact: extension package aligns workspace protocol; OMP YAML consumers retain dependency.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Focused result: extension full suite passed.
Extension suite files: 104.
Extension suite tests: 1,317.
Focused result: ChatViewMenu suite passed.
ChatViewMenu files: 2.
ChatViewMenu tests: 5.
Residual risk: ChatViewMenu relies on upstream pane measurement.

## 3. packages/server/package.json — Final
Conflict: server dependency ranges diverged at lines 35-48.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: runtime, converter, extension, shared packages target 0.6.1; pi coding agent targets 0.80.10.
Ours behavior: same package family targets 0.5.4; pi coding agent targets 0.80.6.
Test map: auth plugin and push dispatcher suites.
Dependency map: server package consumes plugin runtime, document converter, extension, shared, coding agent; chardet remains direct at line 59.
Selection rationale: adopt upstream ranges.
Selection rationale: retain single chardet@^2.1.0 entry.
Compatibility impact: server runtime matches upstream APIs and lockfile package versions; duplicate chardet key avoided.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Focused result: server gateway/push suites passed.
Server gateway/push files: 3.
Server gateway/push tests: 31.
Residual risk: push dispatch stays gated by unread/viewed state.

## 4. packages/extension/src/bridge.ts — Final
Conflict: bridge imports and TUI adapter registration diverged at lines 31-40, 57-68, 87-95, and 2341-2502.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: bridge imports headless RPC detection, default pi version reader, enabled-model filtering, and extracted TUI adapter.
Ours behavior: bridge keeps inline TUI adapter with OMP sequential batch prompts and multiselect no-op guard.
Test map: tui-prompt-adapter.test.ts; batch smoke.
Dependency map: bridge-context.ts; model-tracker.ts; session-sync.ts; tui-prompt-adapter.ts; prompt-bus.ts.
Selection rationale: use upstream imports and single extracted adapter registration.
Selection rationale: add OMP batch handling inside extracted adapter.
Selection rationale: keep upstream confirm metadata and multiselect guard.
Compatibility impact: no parallel adapters.
Compatibility impact: headless, model-filter, and version-maintenance behavior stays.
Compatibility impact: TUI batch and dashboard first-response-wins behavior stays.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Focused result: extension full suite passed.
Extension suite files: 104.
Extension suite tests: 1,317.
Focused result: ChatViewMenu suite passed.
ChatViewMenu files: 2.
ChatViewMenu tests: 5.
Residual risk: bridge batch smoke uses mocked UI methods.
Residual risk: interactive terminal rendering remains outside focused unit scope.

## 5. packages/server/src/server.ts — Final
Conflict: server imports diverged at lines 29-37 and 84-102.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: auth, pairing, persistence, process, and session modules use moved directories.
Ours behavior: old paths plus OMP auth bypass and full push dispatcher, token registry, FCM, Web Push, VAPID imports.
Test map: auth plugin, push dispatcher, push token registry, and VAPID suites.
Dependency map: auth/auth-plugin.ts; pairing/browser-gateway.ts; persistence/preferences-store.ts; spawn-process/process-manager.ts; session/*; push/*.
Selection rationale: adopt upstream moved paths.
Selection rationale: retain validateWsUpgradeWithoutAuth and all push imports.
Selection rationale: repair push store imports to ../persistence/json-store.js.
Compatibility impact: upstream module layout resolves; trusted-network auth bypass survives; server push registrations survive.
Post-merge compatibility restoration: pairing-browser-gateway.ts retains pairing handlers.
Post-merge compatibility restoration: pairing-browser-gateway.ts suppresses answered prompt replay.
Post-merge compatibility restoration: pairing-browser-gateway.ts bounds bridge retries.
Post-merge compatibility restoration: pairing-browser-gateway.ts caps diagnostic metadata.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Focused result: server gateway/push suites passed.
Server gateway/push files: 3.
Server gateway/push tests: 31.
Residual risk: push dispatch stays gated by unread/viewed state.

## 6. package-lock.json — Final
Conflict: root dependency entry and extension workspace entry diverged at lines 16-25 and 32552-32563.
Commit map: ours a5eb0ef6; upstream 5a06c24d; base e75445fc.
Upstream behavior: lockfile workspace entries target 0.6.1; extension includes OpenSpec and minimatch.
Ours behavior: lockfile targets 0.5.4; root and extension retain htmlparser2 and yaml integrations.
Test map: JSON parse; npm lockfile-only synchronization.
Dependency map: root workspace links; extension bus client/shared, OpenSpec, minimatch, ws, yaml; root htmlparser2.
Selection rationale: merge upstream versions and dependencies.
Selection rationale: retain htmlparser2 and yaml.
Selection rationale: regenerate lockfile with npm.
Compatibility impact: lockfile matches all resolved manifests; npm reports clean dependency graph.
Proof command: npm ci --no-audit --no-fund
Final verify command: UPSTREAM_REF=develop TARGET_BRANCH=main SYNC_BRANCH=sync/upstream-develop-resolution scripts/upstream-sync.sh verify
Proof result: npm ci succeeded.
Gate 0 result: structural checks passed.
Gate 1 result: test suites passed.
Gate 2 result: build passed.
Residual risk: future npm versions can reorder lockfile entries.
