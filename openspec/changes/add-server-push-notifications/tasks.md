# Tasks

This task list records the existing Phase 1 push foundation and the scope re-baseline. It does not authorize new runtime behavior. Web Push/VAPID over the PWA is the only shippable transport. FCM remains a typed, deferred extension; Capacitor/native, permission UX, Phase 2 ask UX, and Phase 3 toggles are out of scope.

## 1. Preconditions and runtime inventory

- [x] 1.1 Confirm the existing `isUnreadTrigger` site in `event-wiring.ts` and its shared any-viewer/non-replay gate.
- [x] 1.2 Confirm `isUnreadTrigger` covers turn completion, input-needed `ask_user`/core `ask`, and `agent_end` error.
- [x] 1.3 Confirm existing config validation, atomic `json-store.ts` writes, and auth route registration patterns.
- [x] 1.4 Confirm existing push dispatcher, PWA hook, service worker, routes, coalescing, and persistence implementations.
- [x] 1.5 Confirm the FCM adapter is a typed stub only; do not treat it as a delivered transport.

## 2. Config contract (existing)

- [x] 2.1 Retain optional `push` config with `enabled: false` by default and the existing Web Push/coalescing settings.
- [x] 2.2 Retain existing `coalesceWindowMs` validation and bounds (5_000–300_000 ms, default 30_000 ms).
- [x] 2.3 Keep FCM configuration only as a typed/deferred shape; no FCM setup or delivery is required.

## 3. Token registry (existing)

- [x] 3.1 Retain `PushToken` `{id, deviceToken, transport, userId?, sessionFilter?, registeredAt, lastUsedAt}` and registry operations.
- [x] 3.2 Retain `~/.pi/dashboard/push-tokens.json` persistence through atomic tmp+rename writes with owner-only mode `0600`.
- [x] 3.3 Retain idempotent registration by `deviceToken`, stable id, and refreshed `lastUsedAt`.

## 4. Web Push/VAPID transport (shippable, existing)

- [x] 4.1 Retain `PushTransport` with `kind: "web-push" | "fcm"`; Web Push is the only shipping adapter.
- [x] 4.2 Retain the Web Push adapter and persisted VAPID key lifecycle at `~/.pi/dashboard/push-vapid.json`, using atomic owner-only `0600` writes.
- [x] 4.3 Retain VAPID public-key lookup and Web Push `410 Gone` pruning behavior.
- [x] 4.4 Do not log private VAPID material or complete subscription endpoints.

## 5. FCM transport adapter (deferred follow-on; non-blocking)

- [ ] 5.1 **DEFERRED — not a Phase 1 acceptance or merge gate:** implement JWT signing, service-account loading, token refresh, and FCM HTTP delivery in a later change.
- [ ] 5.2 **DEFERRED — not a Phase 1 acceptance or merge gate:** add FCM transport tests for refresh, gone-pruning, and transient failures in that later change.
- [ ] 5.3 **DEFERRED — typed compatibility only:** keep the `"fcm"` union member and typed stub so a future adapter can reuse the existing dispatcher, registry, routes, and trigger site.
***

## 6. Dispatcher (existing contract)

- [x] 6.1 Retain `createPushDispatcher(...)` with `fanout(sessionId, event): void` and `shutdown(): void`.
- [x] 6.2 Keep fanout fire-and-forget and never-throw behavior; transport failures stay isolated and logged.
- [x] 6.3 Retain per-(session, device) coalescing with lazy expiry and independent sessions/devices.
- [x] 6.4 Retain link-only payload construction for all three trigger families.
- [x] 6.5 Retain successful-token touch and dead Web Push token pruning on `{ok: false, gone: true}`.

## 7. Event pipeline (existing contract)

- [x] 7.1 Retain optional `pushDispatcher?: PushDispatcher` in `EventWiringDeps`.
- [x] 7.2 Retain the single call `pushDispatcher?.fanout(sessionId, msg.event)` inside the existing `isUnreadTrigger` + any-viewer/non-replay branch, after unread broadcast.
- [x] 7.3 Preserve the non-awaited call; dispatcher/transport latency must not delay WebSocket fanout.
- [x] 7.4 Retain coverage that a trigger calls fanout once and viewed/replay/predicate-false events do not.

## 8. REST routes (existing contract)

- [x] 8.1 Retain auth-gated `POST /api/push/register`, `DELETE /api/push/register/:tokenId`, `POST /api/push/test`, and `GET /api/push/vapid-public-key`.
- [x] 8.2 Keep Web Push registration/test behavior and disabled-server 404 behavior.
- [x] 8.3 Keep FCM registration as a typed compatibility shape only; FCM delivery is not an acceptance criterion.

## 9. Service worker (existing contract)

- [x] 9.1 Retain the `push` listener that displays the compact title/body payload and stores its session URL.
- [x] 9.2 Retain the `notificationclick` handler that opens/focuses the payload URL.

## 10. PWA subscription surface (existing contract)

- [x] 10.1 Retain `usePushSubscription` status and subscribe/unsubscribe/send-test operations.
- [x] 10.2 Retain feature detection, VAPID lookup, existing-subscription recovery, and idempotent token registration on refresh.
- [x] 10.3 The current hook may call the browser permission API as required by Web Push. **New permission approval/deny UX is deferred and is not a Phase 1 gate.**
- [x] 10.4 Retain the existing Settings integration and Web Push-only user path; do not add native or Capacitor UI.

## 11. Documentation follow-on

- [ ] 11.1 **DEFERRED to the separate Phase 1 documentation PRD:** architecture/configuration prose and nearest-owner pointer updates.
- [ ] 11.2 **DEFERRED to the separate Phase 1 documentation PRD:** README/AGENTS additions outside this OpenSpec artifact set.

## 12. Advisory verification checklist (not a Phase 1 merge gate)

Every item in 12.x is a checklist for later validation, not a Phase 1 acceptance or merge blocker. The browser matrix remains advisory.

- [ ] 12.1 Advisory test checklist: run the repository's existing tests when implementation work is reviewed; this documentation-only re-baseline does not require a project-wide test run.
***
- [ ] 12.2 Advisory browser checklist: opt in on Chrome PWA and observe a notification from an unviewed session.
- [ ] 12.3 Advisory browser checklist: repeat with Firefox PWA.
- [ ] 12.4 Advisory browser checklist: repeat with installed Safari iOS PWA; this is not a Phase 1 merge gate.
- [ ] 12.5 **DEFERRED FCM follow-on — non-blocking:** service-account failure and FCM delivery scenarios are not Phase 1 acceptance criteria.
- [ ] 12.6 Advisory payload checklist: verify `agent_end` error payload remains truncated/link-only.
- [ ] 12.7 Advisory coalescing checklist: rapid triggers produce at most one push per session/device window.
- [ ] 12.8 Advisory OpenSpec checklist: run `openspec validate add-server-push-notifications --strict` when validating the complete change; strict 12.x results do not gate this re-scope.
***

## 13. Retained review-fix regression matrix (traceability only)

These checked rows confirm existing branch contracts against current source and focused tests; they do not authorize runtime changes. **Existing confirmed** is distinguished from **new work** in every row. Web Push is the only shippable transport; the typed FCM seam and all FCM delivery work remain deferred and are not Phase 1 acceptance gates.

- [x] 13.1 **Existing confirmed — mount/re-registration `tokenId` recovery and idempotency.** Source: `packages/client/src/hooks/usePushSubscription.ts:62-88,132-146` re-POSTs an existing subscription and stores the returned ID; `packages/server/src/push/push-token-registry.ts:52-76` preserves the existing ID and refreshes `lastUsedAt`. Tests: `packages/client/src/hooks/__tests__/usePushSubscription.test.ts:105-120` exercises mount re-registration; `packages/server/src/__tests__/push-token-registry.test.ts:62-71` asserts one row, stable ID, and refreshed timestamp. **New work:** none in PRD 03.
- [x] 13.2 **Existing confirmed — service-worker immediate activation.** Source: `public/sw.js:12-20` calls `skipWaiting()` during install and `clients.claim()` during activate before the `push`/`notificationclick` handlers at `public/sw.js:39-54`. Test: `packages/client/src/lib/__tests__/push-notification-payload.test.ts:1-46` covers the inlined payload and click-target behavior used by the worker. **New work:** none in PRD 03.
- [x] 13.3 **Existing confirmed — atomic owner-only (`0600`) token/VAPID persistence.** Source: `packages/server/src/json-store.ts:22-43` writes temporary-then-renames and reapplies the requested mode; `packages/server/src/push/push-token-registry.ts:46-49` and `packages/server/src/push/push-vapid.ts:19-28` request `0o600`. Tests: `packages/server/src/__tests__/json-store.test.ts:43-80` checks atomic writes and mode tightening; `packages/server/src/__tests__/push-token-registry.test.ts:90-94` and `packages/server/src/__tests__/push-vapid.test.ts:50-54` assert `0600`. **New work:** none in PRD 03.
- [x] 13.4 **Existing confirmed — VAPID/private-key and complete-endpoint logging prohibition.** Source: `packages/server/src/push/push-transports/web-push.ts:31-45` and `packages/server/src/push/push-dispatcher.ts:60-77,105-108` use token IDs in diagnostic templates and pass no parsed subscription endpoint or VAPID key variable to a log call. Tests: `packages/server/src/__tests__/push-web-push-transport.test.ts:83-91` and `packages/server/src/__tests__/push-dispatcher.test.ts:203-219` exercise transport/dispatcher error paths with safe error fixtures; these tests do not add a separate redaction assertion. **New work:** none in PRD 03.

This matrix preserves the implementation unchanged and does not add FCM support, change acceptance gates, or authorize new secret/logging behavior.

## Phase 3 MCP elicitation inventory and decision (2026-07-13)

- [x] **Deliverable 5 — inventory and decision: `drop-defer`.** Independently checked the branch-local Pi event declarations, bridge subscriptions, forwarding mapper, protocol shape, and server trigger site.
  - **Searched sources and candidate names:** searched this repository branch's source and the installed Pi event declarations for `elicitation`, `elicitationRequest`, and `elicitation_request`; no matching event/type declaration or producer was found. The installed Pi 0.80.2 extension event union is enumerated at `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts:481-608,816-846`; its event declarations include the forwarded lifecycle/tool/input events but no elicitation variant.
  - **Bridge/live forwarding evidence:** `packages/extension/src/bridge.ts:1298-1335` subscribes the enriched and pass-through event lists, and neither list contains an elicitation event. The generic `pi.events.emit` intercept at `packages/extension/src/bridge.ts:1750-1762` forwards an emitted channel only when the bridge is session-ready and stamps the bridge's current `sessionId`; this branch has no documented or observed elicitation emitter reaching that path. `packages/extension/src/event-forwarder.ts:22-40` maps a received Pi event's `type` and serializable data into `event_forward`, but it does not create event sources or an elicitation payload.
  - **Protocol/session/payload finding:** `packages/shared/src/protocol.ts:147-151` defines `EventForwardMessage` with `sessionId` plus generic `DashboardEvent`; `packages/shared/src/types.ts:392-397` defines that event as string `eventType`, timestamp, and record data. There is no elicitation-specific protocol member, payload schema, or source-provided session correlation to inventory. Therefore no live, session-correlated elicitation payload reaches `event-wiring.ts` in this branch.
  - **Shipping trigger matrix decision:** `packages/server/src/event-status-extraction.ts:146-188` contains the shipping `isUnreadTrigger` matrix (turn completion, input-needed `ask_user`/core `ask`, and `agent_end` error) and has no elicitation row or classifier branch. `packages/server/src/event-wiring.ts:512-564` evaluates that classifier only inside the live, non-replay, any-viewer suppression gate and fans out the same event. Keep the matrix unchanged and record this deliverable as **`drop-defer`**, not an implementation branch.
  - **Explicit rejection and reassessment:** do not invent a synthetic test-only elicitation event, response UX, permission flow, or second notification pipeline. Reassess only when this repository has a documented live elicitation source with a concrete payload and session correlation that reaches `event-wiring.ts`; this inventory does not claim that the upstream Pi ecosystem lacks such a source.
