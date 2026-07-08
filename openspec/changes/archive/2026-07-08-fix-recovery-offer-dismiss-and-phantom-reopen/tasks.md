## 1. Protocol: recovery_dismiss message

- [x] 1.1 Add a `recovery_dismiss` client→server message type `{ type: "recovery_dismiss"; sessionIds: string[] }` to `packages/shared/src/browser-protocol.ts`, alongside the existing `recovery_offer` type; export it in the client-message union.
- [x] 1.2 Write a unit test asserting the new type shape round-trips (parse/serialize) in `packages/shared/src/__tests__/`.

## 2. Server: durable dismiss + no phantom reopen

- [x] 2.1 In `packages/server/src/server.ts` (~lines 298-306) drop the `ask`-mode normalization exemption: candidates are normalized to `ended` in ALL modes; still collect them into `recoveryCandidates` for the offer in `ask`/`auto`. Keep `sessionFile`, `cwd`, `name`, `model`, `liveEpoch` on each candidate for resume.
- [x] 2.2 Add an inbound handler for `recovery_dismiss`: set `pendingRecoveryOffer = null`, then for each id call `metaPersistence.setLiveness(sessionFile, { live: false })` and flush, so the marker is consumed and never re-classified.
- [x] 2.3 Clear `pendingRecoveryOffer = null` on the reopen/resume path too (any resolving action), so `onConnect` replay (`server.ts:726`) stops after the first resolution.
- [x] 2.4 Confirm `auto` mode still resumes silently with NO offer broadcast and `off` still normalizes with no prompt — no behavior change; add/adjust assertions.
- [x] 2.5 Phantom-reopen root-cause fix (surfaced in live QA). `sessionManager.restore()` is memory-only (`sessions.set(id, session)`), so the cold-start `status=ended` normalization NEVER hits disk — the on-disk `.meta.json` keeps `live:true`. A normalized candidate shows as `ended`, so its card only offers **Hide** (Shut down renders `{isAlive && …}`), and `handleHideSession` sets `hidden:true` only — it never clears liveness. Result: `live:true` survives, so every cold boot re-classifies + re-offers a session the user already closed (the phantom). Fix: in the ask-mode offer block (`server.ts` ~1979), right after `broadcastToAll`, consume each offered candidate's on-disk sentinel via `metaPersistence.setLiveness(cand.sessionFile, { live:false })`. Offer shown ONCE per dirty boot regardless of reopen/dismiss/hide; in-memory `pendingRecoveryOffer` still drives within-boot reconnect replay; Reopen re-stamps `live:true` on the resumed session's next activity. Scoped to the recovery offer block only — no change to the scan/normalize loop, `restore()`, `isRecoveryCandidate`, Hide, or session-start. Uses the same atomic `setLiveness` as `recovery_dismiss` + clean `stop()`. Rejected alternatives: persist `status=ended` via full-meta `save()` (heavier, mutates status on disk); make Hide clear liveness (touches a general non-recovery action → risks hiding-a-live-session regressions).

## 3. Client: dismiss talks to the server

- [x] 3.1 In `packages/client/src/components/RecoveryOfferHost.tsx`, change the dismiss (×) handler to send `recovery_dismiss` with the offered session ids (via the ws send path used by other client→server messages) BEFORE clearing the local bus; reopen path also sends nothing new (resume already clears server offer).
- [x] 3.2 Thread the send function into `RecoveryOfferHost` (prop or context) from `App.tsx` where the component is mounted (lines ~1908, ~2037), mirroring how `onReopen` is passed.
- [x] 3.3 Keep `clearRecoveryOffer()` local-clear behavior; ensure the bus no longer relies on server non-replay alone (dismiss now durable server-side).

## 4. Tests

- [x] 4.1 Update `packages/server/src/__tests__/cold-start-recovery-exempt.test.ts` to assert `ask`-mode candidates ARE normalized to `ended` (invert the old exemption assertion) while still appearing in the offer.
- [x] 4.2 Add a server test: sending `recovery_dismiss` consumes the liveness marker (subsequent cold-start classification yields no candidate) and nulls the pending offer (a client connecting after gets no replay). Extend `recovery-offer.test.ts` / `recovery-server.test.ts`.
- [x] 4.3 Update `packages/client/src/components/__tests__/RecoveryOfferHost.test.tsx`: dismiss sends `recovery_dismiss` with the offered ids; reopen routes through `onReopen`; no auto-timeout.
- [x] 4.4 Add/extend an e2e-style server test proving "shown once per dirty boot": after dismiss + full restart with no new unclean shutdown, no offer is broadcast (`recovery-e2e.test.ts`).

## 5. Verify & land

- [x] 5.1 Run `npm test 2>&1 | tee /tmp/pi-test.log` and grep for failures; fix until green. Full suite green: 9409 passed / 21 skipped / 0 failed (after `npm run build` populated the client bundle, the earlier spa-fallback 500s cleared). Includes the phantom-reopen fix: cold-start normalization is in-memory only (`restore()` doesn't persist), so the ask-mode offer block now consumes each offered candidate's on-disk `live` sentinel via `setLiveness(live:false)` right after broadcast — offer shown once per dirty boot regardless of reopen/dismiss/hide. New test: `recovery-offer.test.ts` "offer shown once per dirty boot even WITHOUT dismiss".
- [x] 5.2 Verified. Client built (`npm run build`) + server ran under the Docker dev overlay (worktree source bind-mounted, foreground). Live browser confirmed: ask-mode offer renders as the top-right sticky "Reopen N sessions?" notification (non-blocking); candidates appear as `ended` (folder "N ended" row) until Reopen; `recovery_dismiss` sent on × flips on-disk `live=false` (proven via WS) and no replay on reconnect. Behavioral coverage otherwise via automated tests (10 recovery tests + full suite 9409 passed / 0 failed), per accepted verification — a genuine live candidate needs a model/API key the QA container lacks (a session only stamps `live:true` on real activity). Phantom-reopen root cause (in-memory-only normalization leaving `live:true` on disk; Hide never clears it) fixed by consuming the sentinel at offer broadcast.
