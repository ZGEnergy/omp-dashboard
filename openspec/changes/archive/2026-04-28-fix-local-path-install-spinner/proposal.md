## Why

When a user installs a pi extension via the dashboard's package browser, the
**install succeeds on disk** but the client UI spinner says **"Installing…"
forever**. The bug reproduces consistently for local absolute/relative paths
(e.g. `/home/me/my-ext`) and intermittently for npm-name sources — symptom is
identical, but local paths trigger it 100 % of the time.

The single-flight package queue (`packages/client/src/lib/package-queue.ts`)
treats the orphaned op as still running, blocking every subsequent install
behind it until the user reloads the page. One bad install poisons the
whole package UI.

### Root cause

A race in `package-queue.ts` between the HTTP `POST /api/packages/<action>`
response and the `package_operation_complete` WebSocket broadcast.

```
  Client                                Server
  ──────                                ──────
  T0: fetch POST /api/packages/install
                                        T1: wrapper.run() — fire-and-forget
                                        T1: HTTP response with operationId
                                        T2: pm.installAndPersist resolves
                                            (⚡ ~ms for local paths,
                                             variable for npm registry)
                                        T3: broadcast
                                            package_operation_complete via WS
  T4: WS frame arrives ─────────────────┘
      onWindowEvent fires:
        running.operationId === null     ← HTTP response not parsed yet
        → match check fails, completion DROPPED
  T5: fetch finally resolves
      running.operationId = opId         ← too late, WS frame is gone
  Spinner runs forever.
```

The matching predicate at
[package-queue.ts:251](packages/client/src/lib/package-queue.ts#L251) is
`running.operationId === msg.operationId`. Between sending the POST and
parsing the HTTP response body, `running.operationId` is `null`, so any
completion broadcast that beats the response is silently discarded. Local-path
installs win the race ~100 % because there is no network round-trip; npm
registry installs win it occasionally for small or cached packages.

The existing test at
`packages/client/src/lib/__tests__/package-queue.test.ts` does not catch this
because it always sets `running.operationId` before dispatching the simulated
completion event — the reverse arrival order is untested.

## What Changes

- **Fix** the race condition in `packages/client/src/lib/package-queue.ts`
  by matching on `source` when `running.operationId === null`, falling back to
  `operationId` once the HTTP response has set it. This is safe because the
  server's busy-lock (`PackageManagerWrapper.busy`) guarantees at most one
  in-flight op per scope, so source-match during the unset-opId window is
  unambiguous.
- **Apply the same fix** to the `package_progress` arm of the same handler
  (lines 243–249). Progress events that arrive during the same race window
  are currently lost too — cosmetically minor (the spinner just reads
  "Starting…" longer) but architecturally identical.
- **Add** a regression test in
  `packages/client/src/lib/__tests__/package-queue.test.ts` that dispatches
  `package_operation_complete` BEFORE the simulated HTTP response sets
  `running.operationId`, asserting that the completion still routes correctly
  via source-match.
- **Document** the race window and source-fallback semantics in a code comment
  on the matching predicate so future contributors don't "simplify" it back
  to operationId-only matching.

This fix is **client-only**. The server, the wire protocol, and pi-coding-agent
are all unchanged. The shared `browser-protocol.ts`
`PackageOperationCompleteMessage` shape stays the same.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
_None — pure bug fix._ The matching semantics are an internal implementation
detail of the client queue, not part of the protocol contract or any
user-visible spec. No spec deltas needed.

## Impact

**Affected code (one file + one test):**
- `packages/client/src/lib/package-queue.ts` — the fix (~10 lines, two arms)
- `packages/client/src/lib/__tests__/package-queue.test.ts` — regression test

**No impact on:**
- `packages/shared/src/browser-protocol.ts` — message shapes unchanged
- `packages/server/src/package-manager-wrapper.ts` — server is correct
- `packages/server/src/routes/package-routes.ts` — route is correct
- pi-coding-agent — no upstream change required
- Any other client component (`PackageBrowser`, `RecommendedExtensions`,
  `MissingRequiredBanner`, `PiResourcesView`, `SettingsPanel` —
  all consume `usePackageOperations` which delegates to this queue)

**User impact:**
- Local-path installs show "Done" within milliseconds of completion.
- All package operations become reliably non-orphaning regardless of source.
- No migration; no setting flip; no API change; no rebuild required for
  server / extension / electron — the fix is in the SPA bundle only.

**Risk:**
- Very low. The fix narrows a discard window — completions that previously
  matched still match; completions that previously discarded now match
  correctly. There is no path that previously matched but now discards.
- Concurrency invariant: the server's `busy` lock ensures only one in-flight
  op at a time, so `running.source === msg.source` during the null-opId
  window can only correspond to our own op.
