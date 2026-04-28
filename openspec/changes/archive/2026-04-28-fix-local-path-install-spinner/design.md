## Context

The proposal diagnosed a race in `packages/client/src/lib/package-queue.ts`
between the HTTP `POST /api/packages/<action>` response and the
`package_operation_complete` WebSocket broadcast. When the server's package
operation finishes faster than the HTTP response round-trip, the WS frame
arrives while `running.operationId === null`, and the strict equality match
discards the legitimate completion.

This is a single-file client fix. There are no new modules, no protocol
changes, no migrations, and no architectural choices to compare. This design
doc exists because the schema requires `tasks` to depend on `design`; it
captures the one decision worth recording (the matching predicate change)
and explicitly notes the alternatives considered and rejected.

## Goals / Non-Goals

**Goals:**
- Eliminate orphaned spinners for *all* package install/remove/update
  operations, regardless of source shape (npm name, git URL, absolute path,
  relative path).
- Keep the fix scoped to one file (`package-queue.ts`) plus a regression test.
- Preserve existing matching semantics whenever `running.operationId` is
  already set — no behaviour change in the non-racy path.
- Apply the same fix symmetrically to `package_progress` so progress events
  during the race window aren't lost either.

**Non-Goals:**
- Server-side changes. The server's broadcast logic is correct; the bug is
  entirely in the client's matching predicate.
- Protocol changes. `PackageOperationCompleteMessage` and
  `PackageProgressMessage` shapes stay unchanged.
- Reworking the queue's overall design (FIFO, busy-lock, retry, auto-clear).
- Fixing pi-coding-agent upstream — it is not the cause.

## Decisions

### D1. Match by `source` when `operationId` is null, else by `operationId`

Replace the strict `running.operationId === msg.operationId` check with a
fallback predicate:

```ts
const matches =
  this.running.operationId !== null
    ? this.running.operationId === msg.operationId
    : this.running.source === msg.source;
```

**Why:** Source-match during the null-`operationId` window is unambiguous
because the server's `PackageManagerWrapper.busy` lock guarantees at most one
in-flight op at a time. Two ops with the same source cannot be in flight
simultaneously — a second `enqueue` for the same source while running is
deduped client-side (lines 95–100 in `package-queue.ts`), and a second POST
slipping past dedup would 409 server-side.

**Alternatives considered:**

- **A. Echo the operationId via a server-issued WS preamble before the HTTP
  response returns.** Rejected: introduces a protocol change for a pure
  client bug; adds a new message type and ordering invariant; doesn't help
  test reliability.
- **B. Block the WS dispatch in `useMessageHandler` until the matching POST
  resolves.** Rejected: requires global coordination between unrelated
  layers; the queue is the only consumer of these messages, so the
  coordination belongs there.
- **C. Drop the `running.operationId` early-out entirely and always
  source-match.** Rejected: when `operationId` IS known it is the stronger
  invariant — it survives source string drift (e.g. a future `cwd`-aware
  source canonicalization). Keep both predicates, prefer opId.
- **D. Buffer unmatched completions briefly (e.g. 100 ms) and re-match after
  the next state mutation.** Rejected: more code, more state, harder to
  reason about; D1 is strictly simpler and has the same end-to-end behaviour.

### D2. Apply the same predicate to `package_progress`

The progress arm at `package-queue.ts:243-249` has the identical race
window. Lost progress events are cosmetically harmless (the spinner reads
"Starting…" instead of "Running…") but the architectural defect is the
same. Fixing both arms in one change closes the bug class instead of one
symptom.

### D3. Regression test asserts reverse arrival order

The existing test in `__tests__/package-queue.test.ts` always sets
`operationId` BEFORE dispatching the simulated completion event. Add a new
test case that reverses that order:

```
1. enqueue() → POST is fired
2. dispatch package_operation_complete (opId="abc", source=req.source)
3. simulate POST resolution { operationId: "abc" }
4. assert running === null AND status="success"
```

This is the regression gate. Without it, any future "simplification" back to
opId-only matching can silently regress.

## Risks / Trade-offs

- [**Risk:** A future change introduces a second concurrent op for the same
  source (e.g. parallel install for global + local scope of the same
  package).] → Mitigation: server's busy-lock is per-`PackageManagerWrapper`
  instance and is global, so concurrent same-source ops are already
  impossible. If we ever add per-scope locks, we revisit the predicate to
  include `scope` in the match. Note this in a code comment on the predicate.

- [**Risk:** Stuck-running guard. If a completion is genuinely lost (e.g. WS
  drops), the queue still hangs — this fix doesn't add a watchdog.] →
  Mitigation: out of scope for this change. WS reconnection already replays
  state via `subscribe`, but `package_operation_complete` is broadcast-only
  (not replayed). A separate change can add a per-op watchdog if needed; not
  triggered by the bug under repair.

- [**Trade-off:** Source-match assumes stable source strings client-side and
  server-side. Today, the client posts `req.source` verbatim and the server
  echoes `result.source = req.source` verbatim
  (`package-manager-wrapper.ts:393`). This is a free invariant.] → No
  mitigation needed; documented in a code comment so a future "normalize the
  source string server-side" change knows to revisit.

## Migration Plan

None. Pure SPA bundle change.

- **Deploy:** rebuild client (`npm run build`), restart server (`POST
  /api/restart` or `pi-dashboard restart`). No bridge reload required, no
  protocol change, no settings migration.
- **Rollback:** revert the file. No data state to unwind.

## Open Questions

None. The fix is mechanical; the test makes the regression visible; the
deploy is a single client rebuild.
