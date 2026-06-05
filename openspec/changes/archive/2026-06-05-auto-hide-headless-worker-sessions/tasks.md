## 1. Shared protocol: register fields

- [x] 1.1 In `packages/shared/src/protocol.ts`, add optional `hasUI?: boolean` and `visibilityIntent?: "hidden" | "visible"` to `SessionRegisterMessage`, with doc comments (fact-forwarding from bridge; server decides).
- [x] 1.2 Type-check passes across packages (`npm run reload:check` or `tsc`).

## 2. Bridge: forward hasUI + env intent

- [x] 2.1 (DECISION 4) Read `PI_DASHBOARD_HIDDEN` / `PI_DASHBOARD_VISIBLE` (or chosen shape) once; resolve to `visibilityIntent` (`VISIBLE` wins if both set; absent ⇒ undefined).
- [x] 2.2 In `packages/extension/src/bridge.ts`, include `hasUI: cachedHasUI` and `visibilityIntent` in the `session_register` payload (near `source: detectSessionSource(...)`, ~line 1795).
- [x] 2.3 Bridge test: a print-mode (hasUI=false) register carries `hasUI: false`; a TUI register carries `hasUI: true`; env intent maps to `visibilityIntent`.

## 3. Server: auto-hide decision at first register

- [x] 3.1 In `packages/server/src/event-wiring.ts` (`session_register` handler, ~line 444), thread `hasUI` and `visibilityIntent` from the message into the registration params.
- [x] 3.2 In `packages/server/src/memory-session-manager.ts` (~line 105), replace unconditional `hidden: false` with: if `existing` present → `hidden: existing.hidden`; else compute `visibilityIntent`-override-then-heuristic (`hasUI === false && source !== "dashboard"`).
- [x] 3.3 Unit tests: first register headless+non-dashboard → `hidden: true`; first register TUI → `hidden: false`; first register headless+dashboard → `hidden: false`; `visibilityIntent: "visible"` on headless → `hidden: false`; `visibilityIntent: "hidden"` on TUI → `hidden: true`.
- [x] 3.4 Unit test (one-shot): a re-register (existing record) preserves `existing.hidden` regardless of `hasUI` — manual unhide survives reattach.
- [x] 3.5 (Risk) Verify reattach after server restart sources `existing.hidden` from persisted store before re-evaluating; add test if the rebuild path can lose a manual unhide.

## 4. Skill doc (optional)

- [x] 4.1 (DECISION 5) If yes: update `parallel-pi-model-workers` SKILL.md to recommend `PI_DASHBOARD_HIDDEN=1` on the worker launch line.

## 5. Verification

- [x] 5.1 Verified in isolated dashboard (ports 8123/9123, temp HOME, mDNS off): 3 headless registers (w1/w2/w3, hasUI=false) produce no visible cards (folder count 4); `Hidden` toggle reveals all 8.
- [x] 5.2 Verified: POST /api/session/w1/unhide → hidden=false; subsequent `registerReason:"reattach"` (hasUI=false) preserves hidden=false (manual unhide survives reconnect).
- [x] 5.3 Verified: t1 (hasUI=true) and d1 (hasUI=false, source=dashboard) stayed in the default visible set throughout; override cases v1 (visible) and h1 (hidden) also behaved per spec.
- [x] 5.4 `npm test` green (only pre-existing flaky pi-image-fit Jimp timeout fails — unrelated); `openspec validate auto-hide-headless-worker-sessions` passes.; `openspec validate auto-hide-headless-worker-sessions` passes.
