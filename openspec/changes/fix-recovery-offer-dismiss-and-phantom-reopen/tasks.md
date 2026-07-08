## 1. Protocol: recovery_dismiss message

- [ ] 1.1 Add a `recovery_dismiss` client→server message type `{ type: "recovery_dismiss"; sessionIds: string[] }` to `packages/shared/src/browser-protocol.ts`, alongside the existing `recovery_offer` type; export it in the client-message union.
- [ ] 1.2 Write a unit test asserting the new type shape round-trips (parse/serialize) in `packages/shared/src/__tests__/`.

## 2. Server: durable dismiss + no phantom reopen

- [ ] 2.1 In `packages/server/src/server.ts` (~lines 298-306) drop the `ask`-mode normalization exemption: candidates are normalized to `ended` in ALL modes; still collect them into `recoveryCandidates` for the offer in `ask`/`auto`. Keep `sessionFile`, `cwd`, `name`, `model`, `liveEpoch` on each candidate for resume.
- [ ] 2.2 Add an inbound handler for `recovery_dismiss`: set `pendingRecoveryOffer = null`, then for each id call `metaPersistence.setLiveness(sessionFile, { live: false })` and flush, so the marker is consumed and never re-classified.
- [ ] 2.3 Clear `pendingRecoveryOffer = null` on the reopen/resume path too (any resolving action), so `onConnect` replay (`server.ts:726`) stops after the first resolution.
- [ ] 2.4 Confirm `auto` mode still resumes silently with NO offer broadcast and `off` still normalizes with no prompt — no behavior change; add/adjust assertions.

## 3. Client: dismiss talks to the server

- [ ] 3.1 In `packages/client/src/components/RecoveryOfferHost.tsx`, change the dismiss (×) handler to send `recovery_dismiss` with the offered session ids (via the ws send path used by other client→server messages) BEFORE clearing the local bus; reopen path also sends nothing new (resume already clears server offer).
- [ ] 3.2 Thread the send function into `RecoveryOfferHost` (prop or context) from `App.tsx` where the component is mounted (lines ~1908, ~2037), mirroring how `onReopen` is passed.
- [ ] 3.3 Keep `clearRecoveryOffer()` local-clear behavior; ensure the bus no longer relies on server non-replay alone (dismiss now durable server-side).

## 4. Tests

- [ ] 4.1 Update `packages/server/src/__tests__/cold-start-recovery-exempt.test.ts` to assert `ask`-mode candidates ARE normalized to `ended` (invert the old exemption assertion) while still appearing in the offer.
- [ ] 4.2 Add a server test: sending `recovery_dismiss` consumes the liveness marker (subsequent cold-start classification yields no candidate) and nulls the pending offer (a client connecting after gets no replay). Extend `recovery-offer.test.ts` / `recovery-server.test.ts`.
- [ ] 4.3 Update `packages/client/src/components/__tests__/RecoveryOfferHost.test.tsx`: dismiss sends `recovery_dismiss` with the offered ids; reopen routes through `onReopen`; no auto-timeout.
- [ ] 4.4 Add/extend an e2e-style server test proving "shown once per dirty boot": after dismiss + full restart with no new unclean shutdown, no offer is broadcast (`recovery-e2e.test.ts`).

## 5. Verify & land

- [ ] 5.1 Run `npm test 2>&1 | tee /tmp/pi-test.log` and grep for failures; fix until green.
- [ ] 5.2 Rebuild + restart per the client+server change matrix (`npm run build`, `POST /api/restart`); manually verify: X dismisses and never re-prompts on reload/reconnect; candidates appear as `ended` until Reopen is clicked; Reopen resumes; `auto` reopens silently with no prompt.
