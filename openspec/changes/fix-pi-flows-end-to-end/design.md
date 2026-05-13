## Context

Investigation (9 explorer subagents, all claims grounded with file:line quotes) established the full pipeline:

```
User /flows → bridge.ts step-9 slash-dispatch → pi-flows
  → FlowManager → flow-execution.ts (parallel agent batches)
    → execution.ts → createAgentSession() [fresh ExtensionRuntime per child]
      → extraAgentExtensions: [anthropicMessagesAgentFactory, ...]
        → @pi/anthropic-messages: outbound `before_provider_request` rename
                                  + inbound `message_end` reverse rename
        → guard.ts: tool_call allowlist enforcement
      → SDK streamSimple() → provider HTTP (honors AbortSignal)

Bridge layer (dashboard):
  pi.events.emit("*")  → bridge.ts:982 monkey-patched emit
                       → connection.send(event_forward)
                       → pi-gateway → server event-wiring
                       → browser-gateway → client useMessageHandler
                       → SlotConsumer renders contributions
```

Verified ground truth:
- pi-flows **already** auto-wires `@pi/anthropic-messages` via `flow-engine/index.ts:62-69` static `extraAgentExtensions: [anthropicMessagesAgentFactory]`. Standalone (no dashboard) → works.
- The dashboard's `flows-anthropic-bridge-plugin` adds value via env-var gates (`PI_ANTHROPIC_MESSAGES_*`) and the settings status panel, but its bridge file is registered in `settings.json#dashboardPluginBridges` — a key pi-coding-agent ≤ 0.74 doesn't read. The bridge **never runs**.
- `flow-execution.ts:331` raw `await Promise.all(batch.map(executeAgentStep))` — no abort race.
- `pi-anthropic-messages/extensions/index.ts:99` gates with `ctx.model.api === "anthropic-messages" && /claude/i.test(ctx.model.id ?? "")`. Proxy/custom model ids fail the regex.
- `ModelSelector.tsx:172-220` hardcodes roles UI; no slot mount.
- `vite-plugin/index.ts` generates `plugin-registry.tsx` at build time; remote clients receive whatever was baked into `dist/client/`. No staleness check.

Constraints:
- Cannot patch pi-coding-agent SDK in this change (separate repo, separate release cadence). All fixes ride on the dashboard layer + pi-flows + pi-anthropic-messages, which are repos the user controls.
- Must preserve standalone behavior of pi-flows when dashboard is absent.
- Must not regress visual parity of the roles dropdown.

## Goals / Non-Goals

**Goals:**
- Abort propagation from dashboard reaches all in-flight subagents AND unblocks the parent batch within one signal-tick (~10 ms).
- `@pi/anthropic-messages` activates for every anthropic-messages-protocol model, including OAuth proxies with non-Claude model ids.
- Dashboard plugin `bridge` entries actually load in pi sessions (the documented contract finally works).
- Roles row renders ABOVE the model selector via slot system; plugins can contribute.
- Remote clients learn when their plugin bundle is stale and prompt for refresh.
- `/api/health.plugins[]` exposes bridge-load source + last probe so a single curl diagnoses install issues.

**Non-Goals:**
- Schema adapters for canonical-shaped vs pi-shaped tool args (separate change).
- Native `dashboardPluginBridges` reader in pi-coding-agent (upstream).
- Runtime plugin hot-loading without rebuild.
- Multi-tab roles editor (single roles row above selector is the deliverable).
- Replacing the model selector dropdown roles UI with something different — strictly extract-and-mount-via-slot, no UX changes.

## Decisions

### D1. Abort race via Promise.race + signal-promise wrapper

**Decision:** Wrap each parallel batch in `flow-execution.ts` with `Promise.race([batchPromise, signalPromise])` where `signalPromise` rejects with `FlowCancelledError` when `options.signal.aborted`.

**Rationale:**
- Children already have `session.abort()` wired via `addEventListener("abort", ...)` in `execution.ts:507`. They DO abort their stream calls; we only need the parent to stop waiting.
- Race-based exit is non-destructive: `Promise.all` keeps running in the background until each iteration boundary observes the signal and resolves. The `FlowCancelledError` thrown to the outer loop signals the caller that abort is honored; cleanup paths already exist (`onAbort` listener in flow-manager.ts).
- Synthesized `cancelled: true` results emitted for still-pending steps so the UI's per-agent state transitions correctly.

**Alternatives considered:**
- `Promise.allSettled` with abort polling — same waiting problem, just hides the error.
- Forcefully reject in-flight promises — would leak resources; child sessions need their own cleanup tick.

**File:** `pi-flows/extensions/flow-engine/flow-execution.ts:331`

### D2. Anthropic-messages gate widening

**Decision:** Replace `isClaudeAnthropicMessages(ctx)` (renamed `isAnthropicMessagesGated`) predicate body:

```ts
// before
return ctx.model.api === "anthropic-messages" && /claude/i.test(ctx.model.id ?? "");
// after
if (process.env.PI_ANTHROPIC_MESSAGES_DISABLE_CANONICAL) return false;
if (process.env.PI_ANTHROPIC_MESSAGES_FORCE_CANONICAL) return true;
return ctx.model.api === "anthropic-messages";
```

**Rationale:**
- The `/claude/i` regex predates proxy providers (9Router, custom OpenAI-compat bases) that route to Anthropic but report non-Claude model ids. Those models break silently today.
- `model.api === "anthropic-messages"` is sufficient: the rename is harmless for any Anthropic-shaped endpoint and active only for tools that need it.
- Existing env overrides remain authoritative for forced opt-out.

**Alternatives considered:**
- Provider-id allowlist read from a config file — adds maintenance burden; the proxy ecosystem is open-ended.
- Per-provider opt-out in `flows-anthropic-bridge-plugin` config — kept, but as additive opt-out, not the primary gate.

**Risk:** A user with an OpenAI-compatible proxy on `anthropic-messages` API that already expects canonical-named tools will see double-rename. Mitigation: env override + first-class status panel after D3 lands.

### D3. Plugin-bridge dual-write (`packages[]` + `dashboardPluginBridges`)

**Decision:** Extend `plugin-bridge-register.ts`:

```ts
// registerPluginBridge: write both
settings.dashboardPluginBridges[`dashboard-${id}`] = bridgePath;
ensurePackageEntry(settings.packages, bridgePath, `dashboard-${id}`);
// deregisterPluginBridge: remove both, ownership-marker-gated
```

`ensurePackageEntry` appends an `{ path, _dashboardOwned: "dashboard-<id>" }` shape if `settings.packages[]` doesn't already contain it; `removePackageEntry` removes ONLY entries with matching ownership marker. User-added packages are untouched.

**Rationale:**
- pi-coding-agent 0.74 ignores `dashboardPluginBridges`. Writing to `packages[]` is the only way the bridge file actually gets imported.
- Keep `dashboardPluginBridges` write for forward compat — when pi adds native support, this change's followup removes the `packages[]` duplicate.
- Ownership marker avoids the "user deleted bridge but dashboard regenerates it" / "dashboard removed bridge but kept user's path" footguns.

**One-shot reconciliation** at server start: for each entry under `dashboardPluginBridges`, ensure a matching `packages[]` entry exists. This heals existing installs without requiring plugin reinstall.

**Alternatives considered:**
- Patch pi-coding-agent to read `dashboardPluginBridges` — out of scope, different release cadence.
- Move bridge auto-registration into the dependency-installer — couples two unrelated concerns; the current "register on server start + after install" call sites are correct.

### D4. Roles via settings-section — reuse the established plugin-config pattern

**Decision:** Move the role editing UI out of `ModelSelector.tsx:150-220` into a bundled built-in plugin (`@blackbelt-technology/pi-dashboard-builtins-plugin` or similar) that claims the existing `settings-section` slot with `tab: "general"`. The model-selector dropdown MAY retain a small read-only "active roles" summary line for glanceability, but all editing (per-role model assignment, preset save/load, preset delete) lives in Settings → General → Roles.

**Rationale:**
- Every other plugin in the monorepo (`honcho-plugin`, `jj-plugin`, `flows-anthropic-bridge-plugin`, `demo-plugin`) already uses `settings-section` for configuration UI. Adding a new `status-bar-roles-row` slot would invent a one-off pattern for a single feature.
- The `settings-section` slot already supports `tab` targeting, multiplicity `"many"`, and priority-ordered rendering — third parties can already contribute roles-related UI without any new slot.
- Settings-modal placement is acceptable for roles because role changes are infrequent (per-conversation, not per-message). A modal click is fine.
- Removes the model dropdown's special-case width (`hasRoles ? "26rem" : "18rem"`) and the inline preset CRUD complexity from `ModelSelector.tsx`.

**Alternatives considered:**
- Add new slot `status-bar-roles-row` — rejected; duplicates `settings-section`'s capability for one feature.
- Add a new uiDecorator kind — wrong system; descriptors are for pi-extension-emitted UI, not dashboard plugins.
- Inline mount + prop drilling — kills extensibility; same as today.
- Read-only summary line only (remove all editing from dashboard) — rejected; role assignment is a runtime control users expect to change without leaving the dashboard.

### D5. Plugin-manifest staleness detection

**Decision:**
1. `vite-plugin/index.ts` computes a SHA-256 of `JSON.stringify(plugins.map(p => ({id, version, claims})))` at registry-generation time and writes:
   ```ts
   // generated/plugin-registry.tsx
   export const PLUGIN_REGISTRY_HASH = "abc123...";
   export const PLUGIN_REGISTRY = [ ... ];
   ```
2. Server adds `GET /api/plugins/manifest` returning the live `discoverPlugins()` result + its own hash computed identically.
3. Client hook `usePluginStaleness` fetches `/api/plugins/manifest` on mount, compares to embedded `PLUGIN_REGISTRY_HASH`. If different, render `<PluginStalenessBanner>` at top of `MobileShell`.
4. Server-side rescans (e.g. after plugin install via REST) emit `plugin_manifest_changed { newHash }` over the existing WS; client also updates its banner state in real time.

**Rationale:**
- Build-time hash + runtime endpoint = zero plugin-bundle delivery work, but solves the "remote client missed an update" silent failure.
- Banner is non-blocking — user keeps working with the old bundle until they refresh.
- Hash is stable across rebuilds of the same plugin set (deterministic JSON.stringify with sorted keys via a small helper).

**Alternatives considered:**
- Push the full registry over WS and lazy-load plugin chunks — much bigger change; deferred.
- ETag-based polling — works, but duplicates what the WS broadcast achieves more cheaply.

### D6. Dashboard drops flow slash commands (button-only)

**Decision:** Remove the four `command-route` claims (`/flows`, `/flows:new`, `/flows:edit`, `/flows:delete`) from `packages/flows-plugin/package.json`. The dashboard surfaces flow operations exclusively through existing buttons: `SessionFlowActions` (new/list/edit/delete) and `FlowDashboard` Abort. The pi-flows extension itself keeps registering `/flows*` commands for TUI users — only the dashboard's command-route claims go away.

**Rationale:**
- Dashboard interaction is button-first. Every slash command already has a button equivalent (verified: `FlowLaunchDialog`, `SessionFlowActions`, `FlowDashboard` controls).
- Reduces autocomplete noise in `CommandInput`.
- Strictly enforces the separation rule: pi-flows owns command registration (TUI), dashboard plugin owns rendering (buttons). The dashboard never re-implements flow logic; it only renders state and dispatches existing protocol messages over WS.
- Reversible: if a button surface ever falls short, the dashboard can re-add a single `command-route` claim without changes elsewhere.

**Alternatives considered:**
- Keep slash commands as a power-user shortcut — rejected; duplicates buttons, adds maintenance.
- Map slash commands directly to button-triggered handlers in the dashboard — rejected; the dashboard's command-route claim adds a custom `<dialog>` route component, which is redundant with the existing button-triggered `FlowLaunchDialog`.

### D7. Observability — `/api/health.plugins[]` extension

**Decision:** Per plugin entry add:

```ts
{
  id: string,
  status: "loaded" | "failed" | "skipped",
  error?: string,
  // new fields:
  bridgeLoadedFrom: "packages[]" | "dashboardPluginBridges" | "none",
  lastProbe?: { status, peers, at }
}
```

`bridgeLoadedFrom` is determined by re-reading `~/.pi/agent/settings.json` at health-check time and matching the bridge path. `lastProbe` is forwarded from `flows-anthropic-bridge:status` events stored per-PID by the bridge plugin's server entry.

**Rationale:** One curl resolves all four user-reported failure modes without trawling logs.

## Risks / Trade-offs

- **[Risk] Widening anthropic-messages gate may double-rename for some custom proxies.** → Mitigation: env override `PI_ANTHROPIC_MESSAGES_DISABLE_CANONICAL=1` already exists, surfaced in the bridge plugin's settings panel; banner with diagnostic if rename count exceeds a threshold.
- **[Risk] Writing to `settings.json#packages[]` from the dashboard may surprise users who hand-edit settings.** → Mitigation: ownership marker on every entry the dashboard adds; never touch unmarked entries; documented in `docs/architecture.md`.
- **[Risk] Promise.race exit may double-trigger the `onAbort` listener path.** → Mitigation: `controller.abort()` is idempotent and the `once: true` listener flag prevents duplicate runs; existing tests cover this.
- **[Risk] Roles slot extraction breaks visual tests.** → Mitigation: visual regression test in `__tests__/StatusBar.test.tsx` captures pre/post DOM; props remain identical.
- **[Risk] Manifest hash drift across deterministic but reordered plugin discovery.** → Mitigation: sort plugins by `id` before hashing; tests assert hash stability across two consecutive discoveries.
- **[Trade-off] Dual-write to `packages[]` + `dashboardPluginBridges` means cleanup must remove from both.** → Acceptable; ownership marker keeps removal targeted.

## Migration Plan

1. **Ship-day:** Server boot runs one-shot reconciliation: for each `dashboardPluginBridges` entry without a matching `packages[]` entry, add the packages[] entry with ownership marker. Log each addition.
2. **First reconnect after ship:** Each pi session, on next `/reload` or process restart, reads the augmented `packages[]` and loads the bridge. `flow:register-agent-extension` finally fires; subagents get the bridge factory; tools resolve.
3. **Remote clients:** Connect to the new server, fetch `/api/plugins/manifest`, see the embedded hash mismatch, render the staleness banner. User refreshes when convenient.
4. **Rollback:** Two paths:
   - Env-driven: `PI_DASHBOARD_DISABLE_PLUGIN_BRIDGE_PACKAGES_WRITE=1` skips D3 and reverts to old behavior.
   - Hard rollback: previous dashboard release uninstalls and the reconciliation marker entries can be auto-removed by running `dashboard plugin-cleanup` CLI (added in tasks).
5. **Verification:**
   - `curl localhost:8000/api/health | jq '.plugins[]'` shows `bridgeLoadedFrom: "packages[]"` for flows-anthropic-bridge.
   - `curl localhost:8000/api/flows-anthropic-bridge/status | jq '.sessions[0].status'` returns `"active"`.
   - `/flows:new` spawns architect agents that successfully call pi tools (no "Available tools: (none)").
   - User aborts a parallel flow; UI returns to idle within 100 ms.

## Open Questions

- Should the staleness banner offer a one-click reload, or only inform? Default to inform-only (safer); reload button behind an opt-in setting if needed.
- Should we expose `bridgeLoadedFrom` in the bridge plugin's settings panel too, or just `/api/health`? Suggest both — the panel becomes the diagnostic UI.
- After this change ships, should the next minor remove the `dashboardPluginBridges` mirror entirely? Defer — wait for pi-coding-agent's eventual native support.
