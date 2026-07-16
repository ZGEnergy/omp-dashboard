## Context

This artifact records the existing Phase 1 push foundation; it does not propose a new runtime path. `event-wiring.ts` evaluates `isUnreadTrigger(...)` once and, inside the existing non-replay and any-viewer suppression branch, updates unread state and calls the optional `pushDispatcher?.fanout(sessionId, event)`.

```ts
if (
  isUnreadTrigger(msg.event.eventType, beforeSnapshot, afterSnapshot, msg.event.data) &&
  !viewedSessionTracker.isViewedByAnyone(sessionId)
) {
  if (sessionAfter && !sessionAfter.unread) {
    sessionManager.update(sessionId, { unread: true });
    browserGateway.broadcastSessionUpdated(sessionId, { unread: true });
  }
  pushDispatcher?.fanout(sessionId, msg.event); // void; never await
}
```

The predicate remains the single attention definition: turn completion (`streaming → idle/active`), input-needed (`ask_user` or core `ask`), and `agent_end` with an error. Replay events do not enter this push branch. Changing that predicate or adding another attention pipeline is outside this PRD.

## Goals / Non-Goals

**Goals:**

- Describe opt-in Web Push/VAPID over the existing PWA as the sole shippable Phase 1 transport.
- Preserve the existing `PushDispatcher` fire-and-forget contract, any-viewer/non-replay gate, per-(session, device) coalescing, auth-gated routes, service-worker handler, and secure persistence.
- Keep `PushTransportKind = "web-push" | "fcm"` as a typed extension seam without claiming FCM delivery.
- Treat OpenSpec 12.x browser checks as an advisory checklist, not a Phase 1 merge gate.
- Make no runtime behavior change in this documentation/specification re-baseline.

**Non-Goals:**

- FCM JWT signing, HTTP delivery, service-account setup, or FCM-specific manual acceptance. The FCM adapter is a typed stub and all 5.x work is deferred follow-on.
- Capacitor, APNs, native APK/IPA notifications, or any native transport.
- New PWA permission approval/deny UX. Existing browser permission state may be surfaced by the current hook, but this PRD does not add or redesign that flow.
- Phase 2 ask/elicitation UX or Phase 3 notification toggles and per-event controls.
- Modifying `isUnreadTrigger`, changing the viewed/replay gate, replacing unread broadcasts, or making delivery synchronous.

## Decisions

### Decision 1 — Reuse the unread trigger site

Push and unread state remain consumers of the same `isUnreadTrigger` evaluation and the same `!viewedSessionTracker.isViewedByAnyone(sessionId)` plus non-replay gate. This prevents two definitions of a notable event.

### Decision 2 — Web Push/VAPID is the shipping transport

The current PWA obtains the persisted VAPID public key, reuses or creates a browser subscription, and registers the subscription at `/api/push/register`. VAPID keys are generated once and persisted at `~/.pi/dashboard/push-vapid.json` so browser subscriptions survive restarts. The existing service worker displays the compact session-link payload and handles notification clicks.

### Decision 3 — FCM remains a typed, deferred extension point

The shared transport interface retains `kind: "web-push" | "fcm"` so a later Capacitor/mobile change can add delivery without changing trigger logic, token storage, routes, or dispatcher shape. The current FCM file is intentionally a typed stub; no JWT, HTTP/2, Firebase setup, FCM retry, or FCM pruning is part of Phase 1. FCM 5.x tasks and manual scenarios are non-blocking follow-on work.

### Decision 4 — Persistence stays atomic and owner-only

`push-tokens.json` and `push-vapid.json` use the existing `json-store.ts` atomic write path and mode `0600`. Tokens keep `{id, deviceToken, transport, userId?, sessionFilter?, registeredAt, lastUsedAt}`; duplicate device registration keeps its id and refreshes `lastUsedAt`. Private VAPID material and complete subscription endpoints are not logged.

### Decision 5 — Coalescing key stays `(sessionId, deviceToken)`

The dispatcher sends one attempt per session/device pair during `coalesceWindowMs` (default 30 seconds, bounded by the existing configuration range), while separate devices and sessions remain independent. Failed attempts do not block browser event forwarding.

### Decision 6 — Opt-in default stays disabled

`push.enabled` defaults to `false`. Disabled servers do not construct the dispatcher, mount push routes, or create VAPID keys. Existing unread and WebSocket behavior remains unchanged when push is disabled.

### Decision 7 — Dispatcher dependency remains optional

`EventWiringDeps.pushDispatcher?` keeps existing tests and callers valid. Production wiring may provide the existing dispatcher, but the call site remains synchronous and non-throwing from the event pipeline's perspective.

## Existing shippable surface

- Auth-gated routes: `POST /api/push/register`, `DELETE /api/push/register/:tokenId`, `POST /api/push/test`, and `GET /api/push/vapid-public-key`.
- PWA hook: feature detection, VAPID-key lookup, existing-subscription recovery, idempotent registration, unsubscribe, and test operation.
- Service worker: `push` notification display and `notificationclick` navigation to the payload URL.
- Dispatcher: `fanout(sessionId, event): void`, `shutdown(): void`, transport fanout, coalescing, dead Web Push subscription pruning on `410`, and isolated/logged failures.

## Retained review-fix regression matrix

This is a traceability confirmation of fixes already present on this branch, not a runtime change request. Each row records the current source and focused-test evidence plus whether any new work is authorized. Web Push remains the only shippable transport; the typed FCM seam and all FCM delivery work stay deferred and are not acceptance gates.

| Retained contract | Current source evidence | Current focused-test evidence | Status / new work |
|---|---|---|---|
| Mount/re-registration recovers `tokenId`; repeated registration is idempotent for an unchanged device token. | `packages/client/src/hooks/usePushSubscription.ts:62-88,132-146` re-POSTs an existing subscription and stores the returned ID; `packages/server/src/push/push-token-registry.ts:52-76` preserves the existing ID and refreshes `lastUsedAt`. | `packages/client/src/hooks/__tests__/usePushSubscription.test.ts:105-120` exercises mount re-registration; `packages/server/src/__tests__/push-token-registry.test.ts:62-71` asserts one row, stable ID, and refreshed timestamp. | **Existing confirmed** by current source/tests. **New work:** none in PRD 03. |
| Service-worker push handlers activate immediately. | `public/sw.js:12-20` calls `skipWaiting()` during install and `clients.claim()` during activate before the `push`/`notificationclick` handlers at `public/sw.js:39-54`. | `packages/client/src/lib/__tests__/push-notification-payload.test.ts:1-46` covers the inlined push payload and click-target behavior used by the worker. | **Existing confirmed** in the current worker and focused payload/click tests. **New work:** none in PRD 03. |
| Push-token and VAPID-secret persistence is atomic and owner-only (`0600`). | `packages/server/src/json-store.ts:22-43` writes a temporary file, renames it, and reapplies the requested mode; `packages/server/src/push/push-token-registry.ts:46-49` and `packages/server/src/push/push-vapid.ts:19-28` request `0o600`. | `packages/server/src/__tests__/json-store.test.ts:43-80` checks atomic writes and mode tightening; `packages/server/src/__tests__/push-token-registry.test.ts:90-94` and `packages/server/src/__tests__/push-vapid.test.ts:50-54` assert `0600` on both secret files. | **Existing confirmed** by current source/tests. **New work:** none in PRD 03. |
| Diagnostics never print VAPID private keys or complete push endpoints. | `packages/server/src/push/push-transports/web-push.ts:31-45` and `packages/server/src/push/push-dispatcher.ts:60-77,105-108` use token IDs in diagnostic templates and pass no parsed subscription endpoint or VAPID key variable to a log call. | `packages/server/src/__tests__/push-web-push-transport.test.ts:83-91` and `packages/server/src/__tests__/push-dispatcher.test.ts:203-219` exercise transport/dispatcher error paths with safe error fixtures; these tests do not add a separate redaction assertion. | **Existing confirmed** by source review and focused error-path tests. **New work:** none in PRD 03. |

The matrix is evidence for retaining the branch fixes; it does not add FCM support, alter acceptance gates, or authorize new secret/logging behavior.

## Risks / Trade-offs

- Web Push support varies by browser; iOS Safari requires an installed PWA. Chrome, Firefox, and iOS checks stay advisory in OpenSpec 12.x and do not gate the Phase 1 merge.
- Browser permission approval/deny behavior belongs to the browser and a later UX scope; no new approval workflow is promised here.
- Web Push payloads remain small and link-only to avoid privacy and size issues.
- A VAPID contact email remains required by the Web Push adapter configuration.
- FCM service-account credentials are not needed by the shippable path. FCM credential setup and all native delivery concerns remain deferred.

## Migration / verification plan

There is no data migration and no runtime migration for this re-baseline. Review checks only that the four OpenSpec artifacts agree on Web Push/VAPID as shippable, the existing trigger/gate/fanout contracts, secure persistence, and the explicit deferred list. OpenSpec 12.x is retained as an advisory checklist; focused consistency checks, not a project-wide test suite or browser matrix, verify this documentation-only change.
***
