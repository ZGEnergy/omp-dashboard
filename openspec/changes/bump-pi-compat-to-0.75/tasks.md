## 1. Phase 1 — Node engines floor

- [ ] 1.1 In root `package.json::engines.node`, change `">=22.12.0 <25"` → `">=22.19.0 <25"`.
- [ ] 1.2 In `packages/server/package.json::engines.node`, change `">=22.18.0"` → `">=22.19.0"`.
- [ ] 1.3 In `packages/server/src/node-guard.ts::isAffectedNode`, widen the 22.x cutoff: change `major === 22 && minor < 18` → `major === 22 && minor < 19`.
- [ ] 1.4 In `packages/server/src/node-guard.ts::buildNodeUpgradeMessage`, update the `Fix:` line from `upgrade Node to >=22.18.0` → `upgrade Node to >=22.19.0`.
- [ ] 1.5 Tests in `packages/server/src/__tests__/node-guard.test.ts`:
  - [ ] 1.5.1 Add a case asserting `isAffectedNode("v22.18.0") === true` (previously accepted, now refused).
  - [ ] 1.5.2 Add a case asserting `isAffectedNode("v22.19.0") === false` (the new floor — accepted).
  - [ ] 1.5.3 Verify existing 24.1/24.2 affected + 24.3 accepted cases still pass unchanged.
  - [ ] 1.5.4 Verify the upgrade message string contains the new `22.19.0` floor.

## 2. Phase 1 — Bundled-node ≥ pi minimum invariant

- [ ] 2.1 NEW test file `packages/shared/src/__tests__/bundled-node-meets-pi-floor.test.ts`. Pattern after `no-bash-on-windows.test.ts`.
  - [ ] 2.1.1 Read `packages/electron/scripts/_node-version.sh` and parse `BUNDLED_NODE_VERSION="v24.15.0"`.
  - [ ] 2.1.2 Read `packages/server/package.json` and extract `piCompatibility.minimum` (e.g. `"0.75.0"`).
  - [ ] 2.1.3 Hard-code a small lookup `piMinimum → requiredNodeMajor.requiredNodeMinor` table: `0.75.0 → 22.19`, `0.74.0 → 22.18`, etc. The table SHALL be a literal map in the test file; refactoring it into a separate doc is a future change.
  - [ ] 2.1.4 Assert `bundledNodeMajor > requiredNodeMajor` OR (`bundledNodeMajor === requiredNodeMajor` AND `bundledNodeMinor >= requiredNodeMinor`).
  - [ ] 2.1.5 On failure, the test SHALL print both values + a one-line remediation: "Bump `BUNDLED_NODE_VERSION` in `_node-version.sh` to at least Node X.Y.Z".

## 3. Phase 2 — Bump piCompatibility

- [ ] 3.1 In `packages/server/package.json::piCompatibility`:
  - [ ] 3.1.1 Change `minimum: "0.74.0"` → `"0.75.0"`.
  - [ ] 3.1.2 Change `recommended: "0.74.0"` → `"0.75.5"`.
  - [ ] 3.1.3 Leave `maximum: null` unchanged.
- [ ] 3.2 Run existing `packages/server/src/__tests__/pi-version-skew.test.ts`. Tests that compare against the literal `"0.74.0"` SHALL be updated to the new floor; tests that read `piCompatibility.minimum` from the manifest SHALL pass unchanged.
- [ ] 3.3 Run the build + a quick `pi-dashboard start` smoke against locally-installed `@earendil-works/pi-coding-agent@0.75.5`. Confirm `GET /api/health` reports the new floor and the banner shows no upgrade hint.

## 4. Phase 3 — Manual smoke pass (BEFORE merge)

Each item below SHALL be exercised against a clean `npm i -g @earendil-works/pi-coding-agent@0.75.5` and the corresponding dashboard build. Capture observed behavior in a short note attached to this change directory (`SMOKE.md`).

- [ ] 4.1 **Fork session id realignment** ([pi-mono #4799]).
  - Steps: open a session, send a prompt, click Fork on the session card mid-stream, send a prompt to the fork.
  - Expectation: fork session id matches everywhere — session list, event stream, OpenSpec attach (if proposal attached), URL.
  - Negative check: original session id never appears in the fork's event stream after the fork.
- [ ] 4.2 **RPC keeper slash dispatch.**
  - Setup: `~/.pi/dashboard/config.json` set `"spawnStrategy": "headless", "useRpcKeeper": true`. Restart dashboard.
  - Steps: spawn a new session in a project with at least one extension slash command (e.g. `.pi/skills/openspec-new-change`). Run the command via the dashboard.
  - Expectation: see `command_feedback {status:"started"}` then `command_feedback {status:"completed"}` in the event stream. The command's prompt runs as if typed in the TUI.
  - Failure mode to watch: missing terminal `completed`/`error` (means pi's 0.75.4 stream-settlement rework changed timing in a way our reducer does not handle).
- [ ] 4.3 **Model-proxy compaction.**
  - Setup: configure a model-proxy API key + at least one custom provider that points at the dashboard's `/v1/messages` endpoint. Set that provider's model as the session default.
  - Steps: open a fresh session, paste a long context (force ~80%+ of context window), trigger compaction (`/compact`).
  - Expectation: compaction summary request appears in `model-proxy.jsonl`, AND the summary text uses the same model the session was using (not pi's default Anthropic auth).
  - Pre-0.75 this was broken (pi #4484); 0.75.0 fixed it. Confirming it actually works under our proxy is the smoke.

## 5. Documentation

- [ ] 5.1 Append a CHANGELOG entry under `## [Unreleased]` summarizing: "Bump pi compatibility floor to 0.75.0 (recommended 0.75.5). Node engines minimum raised to 22.19.0 (per pi 0.75.0 breaking change)."
- [ ] 5.2 If the bundled-node-meets-pi-floor lint fires during 2.1, also document the table location in `docs/file-index-shared.md` (per Documentation Update Protocol).
- [ ] 5.3 No update needed to `AGENTS.md` Key Files — `node-guard.ts` row already exists; the change is internal-behavior, not architectural.

## 6. Post-merge

- [ ] 6.1 Verify the `/api/bootstrap/status` response on a clean install includes `compatibility.recommended === "0.75.5"`.
- [ ] 6.2 Verify on a user running pi 0.74.x: bootstrap status returns `compatibility.error` and the banner renders in the red "below minimum" state.
- [ ] 6.3 Open a follow-up issue tracking the optional adoption work surfaced in this analysis:
  - Consume `agent_end.willRetry` to simplify `usage-limit-orderer.ts` retry inference.
  - Consume `EditToolDetails.patch` for fidelity-correct unified-diff rendering + a "copy patch" action.
  - Rename / extend `adopt-pi-071-072-073-features` to cover 0.74 + 0.75 additive surface.
