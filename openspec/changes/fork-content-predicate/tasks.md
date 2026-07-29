# Tasks — fork-content-predicate

## Bridge

- [x] Write the failing regression test
      (`packages/extension/src/__tests__/extract-first-message-entry-shape.test.ts`)
      against pi's real `SessionEntry` envelope, importing the REAL function
      → verify: fails on `main` (returned `undefined`)
- [x] Fix `extractFirstMessage` (`packages/extension/src/bridge-context.ts`) to
      match `entry.type === "message" && entry.message.role === "user"`;
      handle string and `TextContent[]` content; keep the 200-char slice
- [x] Delete the inlined `extractFirstMessage` copy from
      `packages/extension/src/__tests__/session-switch.test.ts`, import the real
      symbol, convert fixtures to envelopes
      → verify: `grep -c "function extractFirstMessage" .../__tests__/*.ts` == 0

## Server

- [x] Write the failing pipeline test
      (`packages/server/src/__tests__/fork-content-predicate-pipeline.test.ts`):
      pi-shaped entries → `extractFirstMessage` → `session_register` payload →
      `sessionManager.register()` → predicate. No marker set by hand
      → verify: fails on unfixed `extractFirstMessage`
- [x] Add `EventStore.hasConversationEvents(sessionId)` + `CONVERSATION_EVENT_TYPES`
      to `packages/server/src/memory-event-store.ts`; early-return on first match
- [x] Union `hasConversationEvents` into `sessionHasForkableContent`
      (`packages/server/src/session-content.ts`) as an optional second argument
- [x] Rewrite the `session-content.ts` doc comment — the old one asserted a
      restore path that does not exist
- [x] Thread the backstop into the WS preflight
      (`browser-handlers/session-action-handler.ts`)
- [x] Thread it into the REST preflight: `SessionApiDeps.eventStore?`
      (`session-api.ts`) + pass `eventStore` at the `registerSessionApi` call
      site (`server.ts`)

## Tests / regression locks

- [x] `hasConversationEvents` unit cases: conversation → true; `flow:list-flows`
      / terminal / tool traffic only → false; unknown session → false; cleared by
      `deleteEventsForSession`
- [x] Degrade contract: fresh session with register-time chatter →
      `hasEvents` true, `hasConversationEvents` false, predicate false
- [x] WS/REST parity, table-driven over {fresh-empty, has-firstMessage,
      has-events-only, has-both}, both paths driven against the same live
      `sessionManager` + `eventStore`
      → verify: fails if `server.ts` does not pass `eventStore`
- [x] Existing suites stay green: `fork-source-unavailable`,
      `fork-empty-session-preflight`, `fork-jsonl-roundtrip`, `session-api`,
      `bridge-register-nondestructive`

## Docs

- [x] `packages/extension/src/AGENTS.md` — `bridge-context.ts` row
- [x] `packages/server/src/AGENTS.md` — `memory-event-store.ts`, `session-content.ts` rows
- [x] `packages/server/src/session-api.ts.AGENTS.md`, `packages/server/src/browser-handlers/AGENTS.md`

## Gates

- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm test` green
- [x] `npx biome check` on changed files → clean
- [x] `npm run quality:changed` → exit 0

## Deploy (operator)

- [ ] `npm run build` → `curl -X POST localhost:8088/api/restart` →
      **`npm run reload`** (REQUIRED — this changes `packages/extension/`).
      Until bridges are reloaded the event-store backstop carries the behaviour.
- [ ] Live check: `GET /api/sessions` reports non-empty `firstMessage`; a fork
      on a content-bearing session with a missing `.jsonl` returns
      `FORK_SOURCE_UNAVAILABLE` instead of opening a blank chat
