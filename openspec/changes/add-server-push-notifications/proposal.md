## Why

The dashboard already has one attention classifier, `isUnreadTrigger(eventType, before, after, payload)` in `packages/server/src/event-status-extraction.ts`. It recognizes a completed turn (`streaming → idle/active`), input needed (`ask_user` or core `ask`), and an `agent_end` event with a truthy error. The existing event-wiring branch combines that predicate with the any-viewer and non-replay gate before updating unread state and invoking the optional `PushDispatcher`.

This OpenSpec change is a scope re-baseline for that existing foundation. It does not add runtime behavior in Phase 1 PRD 01. The mergeable transport is the opt-in Web Push/VAPID path in the existing PWA; disconnected devices use the same gated, fire-and-forget fanout without a second classifier.

## Discipline Skills

- `doubt-driven-review` — verify Web Push-only scope, existing trigger/fanout invariants, and explicit deferred FCM/native/permission boundaries.
***
## Shippable Phase 1 path: opt-in PWA Web Push

The Phase 1 contract records and preserves these existing surfaces:

- `push.enabled` defaults to `false`; disabled servers do not construct a dispatcher, mount push routes, or generate VAPID keys.
- `PushDispatcher.fanout(sessionId, event): void` remains fire-and-forget. It coalesces at most one delivery per `(sessionId, deviceToken)` during the configured window and never blocks event forwarding or throws into it.
- `PushTransport` uses Web Push/VAPID as the shipping adapter. VAPID keys persist in `~/.pi/dashboard/push-vapid.json` and the public key is available through `GET /api/push/vapid-public-key`.
- Registered Web Push subscriptions persist in `~/.pi/dashboard/push-tokens.json` through atomic writes with owner-only `0600` permissions. Registration is idempotent and dead Web Push subscriptions reported as `410 Gone` are pruned.
- Existing auth-gated routes remain `POST /api/push/register`, `DELETE /api/push/register/:tokenId`, `POST /api/push/test`, and `GET /api/push/vapid-public-key`.
- The existing PWA hook reuses a browser subscription on refresh, registers it idempotently, and exposes subscribe/unsubscribe/test operations. The service worker displays the small session link notification and routes notification clicks back to the session.

No new trigger semantics, route behavior, persistence format, coalescing rule, or permission product flow is introduced by this re-baseline.

## Explicitly deferred typed extension

`PushTransportKind` intentionally remains the union `"web-push" | "fcm"`, and the FCM adapter remains a typed stub so a later transport can use the existing registry, dispatcher, routes, and trigger site. FCM JWT signing, HTTP delivery, service-account setup, FCM delivery/pruning, and Capacitor token use are follow-on work. FCM is not a Phase 1 acceptance criterion, test gate, or merge blocker.

## OpenSpec artifact scope

- **Proposal/design/specs:** describe Web Push/VAPID as the sole shippable transport and describe FCM only as the deferred typed extension above.
- **Tasks:** retain the implemented trigger, dispatcher, route, service-worker, PWA registration, coalescing, and persistence contracts; mark every FCM 5.x task and FCM manual scenario as deferred and non-blocking.
- **Verification:** OpenSpec 12.x remains an advisory checklist. The browser matrix (Chrome, Firefox, and iOS PWA) is not a Phase 1 merge gate; focused consistency checks are sufficient for this documentation-only re-scope.

## Out of scope

- FCM implementation, JWT/HTTP delivery, Firebase service-account setup, and FCM-specific manual acceptance.
- Capacitor, APNs, native APK/IPA notifications, or any other native transport.
- New PWA permission approval/deny UX. The existing hook may reflect the browser permission state; this PRD does not add, redesign, or gate on a permission flow.
- Phase 2 ask/elicitation UX and Phase 3 notification toggles or per-event preference controls.
- A replacement for `isUnreadTrigger`, a second attention pipeline, changes to any-viewer/non-replay suppression, or changes to the fire-and-forget `PushDispatcher` contract.
- Quiet hours, delivery retries/DLQ, payload enrichment, multi-user routing, or a full browser/phone matrix as a merge requirement.
***
