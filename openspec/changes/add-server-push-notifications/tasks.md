# Tasks

## 1. Preconditions

- [x] 1.1 Read `packages/server/src/event-wiring.ts` lines 175-205 and confirm the `isUnreadTrigger` site shape matches the design's "one new line" claim.
- [x] 1.2 Read `packages/server/src/event-status-extraction.ts:209` (`isUnreadTrigger`) and `packages/server/src/viewed-session-tracker.ts` to confirm trigger semantics.
- [x] 1.3 Read `packages/shared/src/config.ts::parseOpenSpecPollConfig` to confirm the validator/clamping pattern this change will mirror.
- [x] 1.4 Read `packages/server/src/json-store.ts` and confirm the atomic-write API used by `preferences-store.ts` and `session-meta.ts`.
- [x] 1.5 Read `packages/server/src/auth-plugin.ts` to confirm how new REST routes register under the auth chain.
- [x] 1.6 Run `npm test 2>&1 | tee /tmp/push-baseline.log` and capture the green baseline.

## 2. Config schema

- [x] 2.1 Extend `DashboardConfig` in `packages/shared/src/config.ts` with the `push?: PushConfig` block defined in the proposal.
- [x] 2.2 Add `parsePushConfig(raw): PushConfig` validator with clamping (`coalesceWindowMs` 5_000–300_000, default 30_000) and SHA-of-the-shape unit tests in `packages/shared/src/__tests__/config-push.test.ts`.
- [x] 2.3 Wire `parsePushConfig` into `loadConfig()` so existing configs without a `push` block parse cleanly.

## 3. Token registry

- [x] 3.1 Create `packages/server/src/push/push-token-registry.ts` exporting `PushToken` type (`{id, deviceToken, transport, userId?, sessionFilter?, registeredAt, lastUsedAt}`) and `createPushTokenRegistry({path})` returning `{add(token), remove(id), list(), findByDeviceToken(token), touch(id)}`.
- [x] 3.2 Use `~/.pi/dashboard/push-tokens.json` for persistence via `json-store.ts`. Atomic tmp+rename writes.
- [x] 3.3 Token id generated via `crypto.randomUUID()`.
- [x] 3.4 Unit tests in `packages/server/src/__tests__/push-token-registry.test.ts`: add/remove/list, persistence round-trip, idempotent add (same `deviceToken` → same id, refresh `lastUsedAt`).

## 4. Push transport interface + Web Push adapter

- [x] 4.1 Create `packages/server/src/push/push-transports/types.ts` with `interface PushTransport { kind: "web-push" | "fcm"; send(token: PushToken, payload: PushPayload): Promise<{ ok: boolean; gone?: boolean }> }`.
- [x] 4.2 Add `web-push` to `packages/server/package.json` dependencies (current latest stable, matching pi's lockstep policy).
- [x] 4.3 Create `packages/server/src/push/push-transports/web-push.ts` exporting `createWebPushTransport({ vapidKeys, contactEmail })` returning a `PushTransport`. On `410 Gone` from the push service, return `{ok: false, gone: true}` so the dispatcher prunes.
- [x] 4.4 Create `packages/server/src/push/push-vapid.ts` with `loadOrGenerateVapidKeys(path): {publicKey, privateKey}`. Persists to `~/.pi/dashboard/push-vapid.json` on first call.
- [x] 4.5 Unit tests for vapid persistence and web-push payload encoding (mocked `web-push` library).

## 5. FCM transport adapter

- [ ] 5.1 Create `packages/server/src/push/push-transports/fcm.ts` exporting `createFcmTransport({ serviceAccountPath })`.
  - JWT signing via `crypto.createSign('RSA-SHA256')` from the service-account `private_key`.
  - Token cached in-memory, refreshed on 401 or before expiry (3500s window).
  - HTTP/2 POST to `https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`.
  - On `404 NOT_FOUND` / `UNREGISTERED` error code, return `{ok: false, gone: true}`.
- [ ] 5.2 Unit tests with `nock` (or fetch-mock equivalent) covering: token refresh, gone-pruning, transient 5xx logged but not retried in v1.

## 6. Dispatcher

- [x] 6.1 Create `packages/server/src/push/push-dispatcher.ts` exporting `createPushDispatcher({ registry, transports, coalesceWindowMs })` returning `{ fanout(sessionId, event), shutdown() }`.
- [x] 6.2 `fanout` is `void`-returning and never throws. Internally `Promise.allSettled` over matched tokens, individual failures logged to the structured logger.
- [x] 6.3 In-memory `Map<\`${sessionId}::${tokenId}\`, lastSentAt>` for coalescing. Lazy expiry on every read (drop entries older than `2 × coalesceWindowMs`).
- [x] 6.4 Compute `PushPayload` via pure helper `buildPushPayload(session, event)` in `packages/server/src/push/build-push-payload.ts`. Unit-tested with fixture events covering all three triggers.
- [x] 6.5 On `{ok: false, gone: true}` from a transport, call `registry.remove(tokenId)`. On `ok: true`, call `registry.touch(tokenId)`.
- [x] 6.6 Unit tests for: trigger-to-payload mapping, coalescing window, dead-token pruning, fan-out non-throwing under transport failure.

## 7. Wire into event pipeline

- [x] 7.1 Add `pushDispatcher?: PushDispatcher` to `EventWiringDeps` in `packages/server/src/event-wiring.ts`.
- [x] 7.2 At the existing `isUnreadTrigger` site (`event-wiring.ts:188-201`), add ONE line: `pushDispatcher?.fanout(sessionId, msg.event);` immediately after the unread broadcast block. Same gating (no replay, not viewed) — the line is INSIDE the existing `if (...)` block.
- [x] 7.3 Update `packages/server/src/server.ts` to construct `pushDispatcher` from config and pass it into `wireEvents(...)`. Skip construction when `config.push?.enabled !== true`.
- [x] 7.4 Add repo-level lint test `packages/server/src/__tests__/push-dispatcher-fire-and-forget.test.ts` that AST-scans `event-wiring.ts` for `await pushDispatcher` or `await deps.pushDispatcher` and fails the build if found.
- [x] 7.5 Integration test in `packages/server/src/__tests__/event-wiring-push.test.ts`: simulate an `agent_end` event with error, assert dispatcher is called once with correct args, and assert event-pipeline latency is unchanged when the transport hangs — a REAL dispatcher wired to a transport whose `send` never resolves; the `onEvent` handler returns synchronously (`< 50ms`, no throw) while the send is still in flight (started, not resolved).

## 8. REST routes

- [x] 8.1 Create `packages/server/src/routes/push-routes.ts` registering:
  - `POST /api/push/register` — body `{deviceToken, transport, sessionFilter?}` → 200 with `{tokenId}`.
  - `DELETE /api/push/register/:tokenId` → 204.
  - `POST /api/push/test` — body `{tokenId?}` (omitted → all caller's tokens) → 200 with `{results: [{tokenId, ok, gone?}]}`.
  - `GET /api/push/vapid-public-key` → 200 with `{publicKey}`.
- [x] 8.2 All routes auth-gated via existing auth-plugin chain.
- [x] 8.3 Handler unit tests in `packages/server/src/__tests__/push-routes.test.ts` (mock dispatcher + registry).

## 9. Service worker push handler

- [x] 9.1 Add a `'push'` event listener to `public/sw.js`:
  ```js
  self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    event.waitUntil(self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url, sessionId: data.sessionId },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }));
  });
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
  });
  ```
- [x] 9.2 Bump SW cache version comment so existing browsers refetch.

## 10. Client subscription hook + Settings UI

- [x] 10.1 Create `packages/client/src/hooks/usePushSubscription.ts` exposing `{ supported, status: 'unknown'|'unsubscribed'|'subscribed'|'denied', subscribe(), unsubscribe(), sendTest() }`.
- [x] 10.2 On mount: feature-detect, fetch VAPID public key, check existing `swReg.pushManager.getSubscription()`.
- [x] 10.3 `subscribe()`: request permission, call `swReg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey})`, POST to `/api/push/register`.
- [x] 10.4 Create `packages/client/src/components/PushNotificationsSection.tsx` mounted in `SettingsPanel.tsx`. Renders status, subscribe/unsubscribe button, Send Test button, "iOS users: install to home screen first" hint when `iOS && !standalone`. (Registered-token list deferred — v1 is single-device self-view.)
- [x] 10.5 Component tests using `@testing-library/react` for the four UI states.

## 11. Documentation

- [ ] 11.1 New section in `docs/architecture.md` titled "Push notifications" — covers trigger contract, coalescing, persistence shape, FCM setup steps with screenshots-or-text-equivalent.
- [ ] 11.2 New row in `AGENTS.md` Key Files table for each new file (8 entries: registry, dispatcher, web-push transport, fcm transport, vapid loader, build-push-payload, push routes, push-tokens.json schema doc).
- [ ] 11.3 New row in `README.md` Configuration section for `push.*` config keys.

## 12. Verification

- [ ] 12.1 `npm test` green; new tests pass; baseline-comparison shows no unrelated regressions.
- [ ] 12.2 Manual: enable `push` in config, register a Chrome subscription, run a session, fire an `ask_user`, observe Chrome notification.
- [ ] 12.3 Manual: same flow with a Firefox subscription (Mozilla autopush has different quirks).
- [ ] 12.4 Manual iOS PWA: Safari 16+ on iOS 16.4+ with the dashboard installed to home screen; verify subscription works (this is the iOS Web Push gate that Capacitor will side-step later).
- [ ] 12.5 Manual: kill the FCM service-account JSON file mid-flight; verify dispatcher logs the load failure and does NOT crash the server.
- [ ] 12.6 Manual: run an `agent_end`-error event; verify push body includes the truncated error.
- [ ] 12.7 Manual: rapid-fire 5 `streaming→idle` cycles within 10s; verify exactly ONE push received per device (coalescing works).
- [ ] 12.8 Run `openspec validate add-server-push-notifications --strict` and fix any spec/scenario gaps.
