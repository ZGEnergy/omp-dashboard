# Fix pi-flows end-to-end

## Why

A user installs `pi-flows` + `@pi/anthropic-messages` + the dashboard, runs `/flows`, and four things break in concert:

1. **Abort doesn't work.** Parent abort fires, child sessions individually abort, but the parallel batch in `flow-execution.ts:331` (`await Promise.all(batch.map(executeAgentStep))`) does not race the AbortSignal. The UI stays "running" until every in-flight agent observes the signal at its next iteration boundary.
2. **Tools aren't intercepted for non-Claude model ids.** `pi-anthropic-messages` gates on `/claude/i.test(ctx.model.id)`. Proxy providers (9Router, custom OpenAI-compatible bases, etc.) report model ids without "claude" in them and silently skip the rename hook — subagents send raw `read` / `ask_user` to Anthropic, get rejected or `_ide`-mangled, and dispatch fails with "Tool X not found".
3. **The dashboard's flows-anthropic-bridge plugin is dead code.** `plugin-bridge-register.ts` writes the bridge entry to `settings.json#dashboardPluginBridges`, but pi-coding-agent ≤ 0.74 only loads extensions from `settings.json#packages[]`. The bridge never imports, never runs its probe, never broadcasts status, never serves the env-var gate overrides. The `/api/flows-anthropic-bridge/status` panel always shows "no sessions reporting". (This subsumes the pending `fix-flows-anthropic-bridge-resolution` change.)
4. **`/roles` UI is hardcoded inside the model selector** with no slot mount point. The user wants it rendered as a row ABOVE the model selector so plugins can contribute. Today it ships only as a `RoleInfo` prop drilled into `ModelSelector.tsx:172-220`.

Plus a fifth latent bug uncovered during the investigation:

5. **Remote clients silently miss plugin slots.** The plugin registry is baked into `dist/client/` at Vite build time and shipped with the bundle. A stale cached `index.html` on a browser/zrok client keeps loading the old registry — no manifest reconciliation, no banner, no diagnostic. Installing or upgrading a plugin and only rebuilding the server leaves remote clients invisibly out of sync.

Standalone pi-flows (no dashboard) already wires `@pi/anthropic-messages` into every subagent via a module-level `extraAgentExtensions` array in `flow-engine/index.ts:62`. So pi-flows by itself is fine. **The breakage is everywhere the dashboard layer intermediates.** This change repairs that layer end-to-end.

## What Changes

- **Abort race fix.** Wrap the parallel agent batch in `flow-execution.ts` with `Promise.race` against an abort-signal promise so the parent loop unblocks as soon as the signal fires, and emit a synthesized cancelled result for any agent still in flight. Children still call `session.abort()` via the existing listener — the wrapper only fixes the parent's wait.
- **Widen the anthropic-messages gate.** Drop the `/claude/i` regex from `pi-anthropic-messages/extensions/index.ts:99`. Gate on `ctx.model.api === "anthropic-messages"` alone, plus the existing env overrides `PI_ANTHROPIC_MESSAGES_FORCE_CANONICAL` / `PI_ANTHROPIC_MESSAGES_DISABLE_CANONICAL`. Add a per-provider opt-out list read from the dashboard plugin's `flows-anthropic-bridge-plugin` config (already exists as `configSchema.json`).
- **Write plugin bridges into `settings.json#packages[]`.** Extend `plugin-bridge-register.ts` so `registerPluginBridge` / `deregisterPluginBridge` manage both `dashboardPluginBridges[dashboard-<id>]` (forward-compatible) AND `packages[]` (the key pi actually reads). Atomic write, marker-comment on the packages entry for ownership, non-destructive of user entries. **BREAKING for plugin authors** who relied on the old write being a no-op: bridge entries that previously did nothing now actually load.
- **Roles via settings-section (reuse existing plugin pattern).** Move the role-editing UI out of `ModelSelector.tsx:150-220` into a bundled built-in plugin contribution claiming the existing `settings-section` slot with `tab: "general"`. This is the same pattern every other plugin (`honcho-plugin`, `jj-plugin`, `flows-anthropic-bridge-plugin`, `demo-plugin`) already uses for configuration UI — no new slot id is added. The model selector dropdown MAY retain a small read-only "active roles" summary line for at-a-glance visibility, but all editing (set, preset save/load/delete) lives in Settings → General → Roles.
- **Plugin-manifest staleness detection.** Server emits `GET /api/plugins/manifest` returning `{ hash, plugins: [{id, version, claims}] }`. The client embeds the build-time hash in `plugin-registry.tsx`, compares on mount, and shows a non-blocking banner ("New plugin contributions available — refresh to load") when hashes differ. Also broadcast `plugin_manifest_changed` over WS when server-side plugin discovery rescans (e.g. after install).
- **Observability.** `/api/health` already includes `plugins[]` per current spec; extend each entry with `bridgeLoadedFrom: "packages[]" | "dashboardPluginBridges" | "none"` and `lastProbe: { status, peers }` from the flows-anthropic-bridge so a single curl can diagnose all four failure modes.

- **Drop flow slash commands from the dashboard.** The dashboard plugin manifest currently claims `command-route` for `/flows`, `/flows:new`, `/flows:edit`, `/flows:delete`. Remove these four claims. Every command already has an equivalent button surface in the dashboard (`SessionFlowActions` subcard for new/list, `FlowDashboard` Abort button, edit/delete inside `FlowsListRoute` dialog). The dashboard becomes button-driven for flow operations; slash commands remain available in TUI / standalone pi-flows where they belong. This is a deliberate **dashboard-only simplification** — pi-flows continues to register `/flows*` commands for TUI users.

Out of scope, kept for follow-ups:
- Upstream patch to `pi-coding-agent` to read `dashboardPluginBridges` natively (would remove the `packages[]` duplication this change introduces).
- Schema-adapter translation in `pi-anthropic-messages` (canonical-shaped → pi-shaped tool args). Tracked separately; not blocking the four user-reported failures.

## Capabilities

### New Capabilities
- `plugin-manifest-staleness`: server-side manifest hash endpoint + client staleness detection + WS broadcast on rescan
- `flow-abort-race`: parallel-batch abort race contract for pi-flows orchestration (lives in dashboard plugin layer that hosts pi-flows runtime expectations)

### Modified Capabilities
- `dashboard-plugin-loader`: plugin-bridge-register MUST write to both `dashboardPluginBridges` and `packages[]`; `/api/health.plugins[]` MUST expose `bridgeLoadedFrom` + `lastProbe`
- `model-selector`: roles editing UI MUST move out of the model dropdown and surface via a `settings-section` plugin contribution; the dropdown MAY retain a read-only roles summary line
- `flow-trigger`: dashboard MUST NOT register `/flows*` slash commands; flow operations driven exclusively from button UI (`SessionFlowActions`, `FlowDashboard` controls)

## Impact

- **Affected code (dashboard repo):**
  - `packages/shared/src/plugin-bridge-register.ts` — dual write to `packages[]` + ownership marker
  - `packages/client/src/components/ModelSelector.tsx` — remove inline roles editing; keep optional read-only summary line
  - `packages/builtins-plugin/` (new bundled plugin) — contributes `settings-section` claim with `tab: "general"` rendering the extracted roles UI as `BuiltInRolesSettings`
  - `packages/builtins-plugin/src/RolesSettingsSection.tsx` — extracted roles editing UI (former `ModelSelector` inline block)
  - `packages/server/src/routes/plugin-routes.ts` (or new `plugin-manifest-routes.ts`) — `GET /api/plugins/manifest`
  - `packages/dashboard-plugin-runtime/src/vite-plugin/index.ts` — emit build-time manifest hash into `plugin-registry.tsx`
  - `packages/client/src/components/PluginStalenessBanner.tsx` — new
  - `packages/server/src/server.ts` — broadcast `plugin_manifest_changed`
  - `packages/server/src/routes/system-routes.ts` (`/api/health`) — extend `plugins[]` shape
- **Affected upstream packages (outside this repo, coordinated changes):**
  - `pi-flows/extensions/flow-engine/flow-execution.ts` — `Promise.race`-wrapped parallel batch
  - `pi-anthropic-messages/extensions/index.ts` — drop `/claude/i` from `isClaudeAnthropicMessages`, rename to `isAnthropicMessagesGated`
- **Affected protocol (`packages/shared/src/browser-protocol.ts`):** new `plugin_manifest_changed` message; extended `health` REST shape
- **Backward compatibility:**
  - Plugin authors with bridge entries that previously did nothing will see their bridge now actually load. Mitigation: opt-out env `PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE=1` for one minor.
  - Removing `/claude/i` widens activation; existing OpenAI-compatible models that happen to use `anthropic-messages` API will now also be transformed. Env override `PI_ANTHROPIC_MESSAGES_DISABLE_CANONICAL=1` already exists as escape hatch.
  - Roles slot extraction preserves visual + interaction parity; tests in `__tests__/ModelSelector.test.tsx` MUST still pass with no UX regression.
- **Migration:**
  - One-shot reconciliation on server start: read existing `dashboardPluginBridges`, if matching `packages[]` entry missing, add it under the same `dashboard-<id>` marker.
  - Remote clients connected before this change ships will see the staleness banner on first refresh after deploy.
- **Tests:**
  - Repo-lint: forbid bare `<a>` in `RolesRow` (existing lint already covers external anchors).
  - Pure tests: `Promise.race` abort wrapper; gate predicate (anthropic-messages + env matrix); manifest hash equality + drift; slot-id round trip.
  - Integration: spawn a flow, hit `/api/abort`, assert `Promise.all` resolves within 100 ms of signal.
  - Integration: install bridge plugin, restart server, assert `~/.pi/agent/settings.json#packages[]` contains the bridge path AND `/api/flows-anthropic-bridge/status` reports `active`.
