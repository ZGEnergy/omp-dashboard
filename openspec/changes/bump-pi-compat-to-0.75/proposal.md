## Why

Pi shipped `0.75.5` on 2026-05-23. The dashboard's `piCompatibility` block still pins `0.74.0` as both `minimum` and `recommended`. Today, every user running pi 0.75.x sees a stale "consider upgrading" framing (no upgrade hint surfaces because they ARE on the recommended version of yesterday, not today) while in fact the dashboard has not been declared compatible with the line they run.

The 0.74 → 0.75 delta is unusually well-suited to a pure floor bump:

1. **Exactly one breaking change**: 0.75.0 raised the Node.js minimum from `22.18.0` to `22.19.0`. Every downstream change in 0.75.1–0.75.5 is additive or a bugfix.
2. **Zero ExtensionAPI shape changes affecting the dashboard.** I verified the published 0.75.5 `.d.ts` surface against every dashboard workaround:
   - `pi.dispatchCommand` — still ABSENT (slash-dispatch RPC keeper path stays).
   - `ctx.ui.multiselect` — still ABSENT (multiselect polyfill stays).
   - `sendUserMessage(content, { deliverAs })` — same shape, no `expandPromptTemplates` flag (prompt-expander workaround stays).
   - `EditToolDetails` gained an additive optional `patch: string` field; `diff` and `firstChangedLine` unchanged. The dashboard's `EditToolRenderer` rebuilds the diff client-side from `args.{oldText,newText,edits}` and never reads `result.details` for edit tools — verified by repo-wide `grep` (zero hits for `details.diff` / `details.patch` / `EditToolDetails`). So this additive change is a no-op for our render path.
3. **Three dashboard-relevant fixes land for free**: forked-session id realignment ([pi-mono#4799], 0.75.4), AgentSession compaction via custom stream functions preserving proxy-backed LLM routing (0.75.0, relevant to our model-proxy mode), and undici 8 HTTP/2 destroyed-session crash fixes (0.75.3).
4. **One additive event field worth noting (NOT adopting here)**: 0.75.4 added `agent_end.willRetry: boolean`. Our `event-reducer.ts` and `usage-limit-orderer.ts` infer retry today via `auto_retry_*`. Adopting `willRetry` is a simplification, not a fix; out of scope for this change to keep the floor-bump pure.

The existing version-handling infrastructure (catalogue-driven provider registration, `ToolRegistry`-mediated probe, `pi_version_update` push from the bridge, paired cache invalidation) — all delivered by `modernize-pi-version-handling` — means a floor bump now is a JSON edit plus engines bookkeeping. No probe rewiring, no banner refactor.

## What Changes

### Phase 1 — Node engines floor

- **MODIFY**: root `package.json::engines.node` from `">=22.12.0 <25"` → `">=22.19.0 <25"`.
- **MODIFY**: `packages/server/package.json::engines.node` from `">=22.18.0"` → `">=22.19.0"`.
- **VERIFY (no-op)**: `packages/electron/scripts/_node-version.sh::BUNDLED_NODE_VERSION` is `v24.15.0`, already ≥ 22.19.0. No change required, but the design-time invariant SHALL be asserted by a tiny repo-lint test (`bundled-node ≥ piCompatibility.minimum.node`) so a future Node downgrade cannot silently cross under the pi floor.
- **CONFIRM**: `packages/server/src/node-guard.ts::isAffectedNode` already refuses to start on `22.x < 22.18`. The new engines floor is `22.19`, one minor stricter than the runtime guard. The guard SHALL be widened in lockstep: extend `isAffectedNode` to also flag `22.18.x` so the runtime refuse-to-start aligns with the declared engines floor. Without this, a user on `22.18` reads "supported" from engines metadata but the server boots fine — and then pi itself fails on its own 0.75 floor. Better to be the first to refuse with a clear message.

### Phase 2 — Bump piCompatibility

- **MODIFY**: `packages/server/package.json::piCompatibility`:
  - `minimum: "0.74.0"` → `"0.75.0"`
  - `recommended: "0.74.0"` → `"0.75.5"` (track the latest 0.75 patch — fixes #4799, #4681, undici 8, Bedrock, Windows shim races are all valuable for users to land on).
  - `maximum: null` (unchanged).

Order matters: engines change SHALL land first in the same commit set, so a user upgrading the dashboard against an unsupported Node version gets the clean "wrong Node" failure path before the pi-floor check fires.

### Phase 3 — Smoke verification (not code, but tasks)

Three behaviors that 0.75 changed deserve a manual smoke pass against a freshly-installed `@earendil-works/pi-coding-agent@0.75.5` BEFORE the bump merges:

1. **Fork session id realignment** ([#4799]) — fork an active session via the dashboard, send one prompt to the fork, confirm the new session id matches the fork target everywhere (event stream, session list, OpenSpec UI). Our `pending-fork-registry.ts` may have masked the upstream bug with retries; we want to know whether the fix simplifies us.
2. **RPC keeper slash dispatch** — open a headless session with `useRpcKeeper: true`, run an extension slash command, confirm `command_feedback {started, completed}` cycle still works. The keeper path uses `getCommands()` + UDS write; no API surface changed in 0.75, but stream-settlement code in pi was reworked (0.75.4 — "AgentSession retry, compaction, and event settlement to use the awaited agent lifecycle instead of a separate event queue") and we should confirm `agent_end` timing is still what the dashboard reducer expects.
3. **Model-proxy compaction** — open a session that uses a dashboard proxy-key model, fill context to trigger compaction, confirm the compaction summary uses the proxy (not pi's default Anthropic). This is the 0.75.0 fix #4484 — net win for our model-proxy mode, but never been smoke-tested under our config.

Smoke pass tasks live in `tasks.md`; failures roll back the bump and open a follow-up change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `pi-core-version-check`:
  - `piCompatibility.minimum` and `piCompatibility.recommended` SHALL track the 0.75 line (`0.75.0` floor, `0.75.5` recommendation).
  - Node engines floor SHALL be `>=22.19.0 <25` at root and `>=22.19.0` in `packages/server`, matching pi 0.75.0's minimum supported Node.
  - The server `node-guard` SHALL refuse to start on `22.x < 22.19.x` (one minor wider than today's `< 22.18.x`), aligning the runtime guard with the declared engines floor and pi's own floor.

## Impact

**Files**:
- `package.json` — `engines.node` string change (1 line).
- `packages/server/package.json` — `engines.node` string change (1 line) + `piCompatibility.minimum` + `piCompatibility.recommended` string changes (2 lines).
- `packages/server/src/node-guard.ts::isAffectedNode` — widen 22.x cutoff from `< 18` to `< 19` (1 line).
- `packages/server/src/__tests__/node-guard.test.ts` — extend coverage: `22.18.0` now refused, `22.19.0` accepted.
- NEW repo-lint test: `bundled-node ≥ pi minimum node` invariant. ~20 LOC, follows the pattern of `packages/shared/src/__tests__/no-bash-on-windows.test.ts`.
- `tasks.md` — three manual smoke items (fork, RPC keeper, model-proxy compaction). No code.

**Tests**: ~3 new (node-guard widening, lint invariant, plus existing piCompatibility tests will re-run with the new values — `pi-version-skew.test.ts` already exercises minimum/recommended comparison).

**Risk**: low.
- The Node 22.19 floor is a real but small bump (22.18→22.19 is one minor). Existing `node-guard` already refused everything below 22.18. Linux/macOS distros and brew are well past 22.19; Windows nvm users on 22.18 will see a clear refuse-to-start message.
- The pi floor bump itself is two-line JSON. No dashboard logic depends on a specific 0.7x minor.
- Zero workarounds eliminated → zero deletion risk. Workarounds (`slash-dispatch.ts`, `multiselect-polyfill.ts`, `prompt-expander.ts`, `DASHBOARD_NATIVE_COMMANDS`) stay exactly as they are.

**Cross-references**:
- Builds on archived `modernize-pi-version-handling` (probe via ToolRegistry, paired cache invalidation, bridge-pushed `pi_version_update`) — without that, this bump would land against a stale probe. With it, the bump is a single JSON edit visible in the banner within one push cycle.
- Sibling `adopt-pi-071-072-073-features` should be re-titled `adopt-pi-071-074-features` (or similar) on its next revision to absorb the additive 0.75 surface (`agent_end.willRetry`, edit-tool unified-patch field, image-resize utils export) — but that consolidation is OUT of scope for this change.

## Out of Scope

- Adopting `agent_end.willRetry` to simplify `usage-limit-orderer.ts`. Pure refactor opportunity, not a fix; should land separately so it can be reverted independently if the inference path turns out to encode subtle ordering we forgot.
- Adopting `EditToolDetails.patch` to render a server-authoritative unified diff in the dashboard's edit-tool card. The current client-side `createTwoFilesPatch(args.oldText, args.newText)` path renders correctly; the new field is a fidelity improvement (handles BOM + CRLF normalization that pi performed on write) but no user has reported a discrepancy.
- Image generation surfaces (0.74.1 OpenRouter image-gen) — no dashboard tool card, no user request.
- Setting `piCompatibility.maximum`. Pi's semver discipline still does not justify pinning a ceiling.
- Touching `packages/electron/offline-packages.json` (if/when it lives under source control). The bundled offline cache is generated at build time from the same `piCompatibility.recommended`; the spec scenario "Pin and recommended stay in lockstep" already governs that path and SHALL be re-validated by the existing build pipeline when the recommendation flips to `0.75.5`.
- Adopting `compat.forceAdaptiveThinking` in custom-provider configs (0.75.5). Our `ProviderAuthSection.tsx` already passes-through unknown keys; no UI controls planned.
