## Context

`usePackageOperations` (one of two instances mounted concurrently — one inside `RecommendedExtensions`, one inside `PackageBrowser`) holds a single `OperationState` slot:

```ts
{ operationId, status, message, source }
```

Components decide "is this row busy?" via `ops.operation.source === entry.source && status === "running"`. When the user clicks Install on B while A is running, `startOperation` POSTs the new request and overwrites the slot with B's source. The server still happily runs A in the background, but A's row no longer matches `operation.source` → spinner stops. Worse, if the POST for B reaches the server before A's `package_operation_complete` arrives, `packageManagerWrapper.run` throws `PackageOperationBusyError` and the route returns 409 → B is marked `error`.

The two hook instances also don't share state, so the Recommended panel and the Packages tab can each have their own "running" op, and a click in one doesn't show up in the other.

The server is correct: `packageManagerWrapper.busy` enforces strict single-flight, `executeOperation` always emits `package_operation_complete` (success or error), and the WS broadcasts a `pi-package-event` CustomEvent that any component can listen for.

## Goals / Non-Goals

**Goals:**
- Spinner on a clicked row stays spinning until *that* row's operation completes, regardless of subsequent clicks.
- Rapid-fire clicks on different packages all complete, in click-order, without manual retry.
- Recommended panel and Packages tab share queue state — a click in one is visible in the other.
- One-shot bulk install of every missing recommended extension via a single header button.
- Behavior survives the existing `pi-package-event` channel — no protocol or server changes.

**Non-Goals:**
- Persisting queued operations across full page reloads (the running op continues server-side and its WS completion will arrive; queued items not yet POSTed are lost — acceptable scope).
- Cancelling a queued item (could be added later; not needed for the bug fix or bulk install).
- Concurrent installs on the server. The `busy` lock stays. Queueing is purely client-side scheduling.
- Optimistic UI ("show as installed before completion"). Status stays `running` → `success`/`error` per the WS messages.

## Decisions

### 1. Module-level singleton store, not React Context

A plain TS module (`packages/client/src/lib/package-queue.ts`) exports a singleton with `enqueue`, `subscribe`, `getStateForSource`, `getRunning`, `getQueueDepth`, plus an internal `handleWsMessage`. React components consume it via a thin `usePackageQueue()` hook that uses `useSyncExternalStore`.

**Why not Context?** Two consumers (Recommended, PackageBrowser) live under the same App tree but Context would require a new provider wrapping App and would re-render every consumer on any state change. `useSyncExternalStore` with per-source selector subscriptions gives precise re-render scoping for free. The existing `pi-package-event` `CustomEvent` channel from `useMessageHandler` already crosses component boundaries the same way (window event → component), so a module-level store is consistent with the existing pattern.

**Why not Redux/Zustand?** No other state in this codebase uses them. One ~120 LOC file is the lighter dependency.

### 2. Keying state by `source`, not `operationId`

The user-visible identity of an operation is the package source string (`"npm:pi-flows"`, `"git:..."`). The `operationId` is a server-assigned UUID that doesn't exist until after the POST resolves. Keying by source means:

- `enqueue("npm:pi-flows")` is dedup-checkable before any HTTP call.
- A row can render its status purely from `getStateForSource(entry.source)` without waiting for an opId round-trip.
- The "running" entry is keyed by source too; we just store its operationId inside that entry once we get one.

`opId → source` is a 1:1 map for our purposes (the wrapper enforces single-flight, and we never enqueue the same source twice), so we don't need a reverse lookup. Incoming WS messages match by `operationId === running.operationId`; that already works in today's hook.

### 3. State machine

```
       enqueue(source)
             │
             ▼
        ┌────────┐    head & wrapper free
        │ queued │───────────────────────┐
        └────┬───┘                       │
             │                           ▼
             │                      POST /install
             │                           │
             │                           ▼
             │                      ┌─────────┐
             └─────── advance ────▶ │ running │
                                    └────┬────┘
                                         │ ws complete
                              ┌──────────┴──────────┐
                              ▼                     ▼
                        ┌─────────┐           ┌───────┐
                        │ success │           │ error │
                        └────┬────┘           └───┬───┘
                             │ 3s                 │ stays
                             ▼                    ▼ (manual clear)
                          (cleared)            (cleared on
                                                next enqueue
                                                same source)
```

`success` auto-clears after 3 s (parity with today). `error` stays sticky so the user sees the failure; it clears the next time the same source is enqueued. After completion (success OR error), the queue head is shifted and POSTed.

### 4. Retry-on-409

If the POST for a queued item returns 409 (a non-queue subsystem briefly held the busy lock — e.g. `PiCoreUpdater.runExclusive`), we **re-prepend** the source to the queue head and try again after a short backoff (500 ms). One retry; if it 409s again, surface as `error`. Today's code already shows a 409 as an error message immediately, which from the user's perspective is "I clicked Install and got an error for no reason." Retry-once is strictly better and bounded.

### 5. Dedup

`enqueue(source, action, scope)` is a no-op when `getStateForSource(source)` is `queued` or `running`. Prevents:
- Double-clicks on the same Install button.
- "Install all missing" pressed twice in quick succession.
- A user-driven Install racing with the auto-enqueue of the same source from "Install all".

### 6. Hook API kept backwards-compatible

`usePackageOperations(scope, cwd, onComplete)` keeps its signature. Internally it:
- Returns a derived `operation` object (the *currently running* op, regardless of which component started it). The existing `operation.source === entry.source` checks in components keep working but now reflect a shared truth.
- Exposes `install`, `remove`, `update` that call `packageQueue.enqueue(...)` instead of POSTing directly.
- Adds new method `statusFor(source): "idle" | "queued" | "running" | "success" | "error"` for callers that want richer per-row state (used by the new "Queued" pill).
- Calls `onComplete` (used by both consumers to refresh installed-packages lists) once per completion of *any* op.

### 7. Single WS subscription

Today, every mounted `usePackageOperations` instance attaches its own `pi-package-event` listener and filters by its own `opIdRef`. With the queue store, the listener is attached *once*, by the store, at module load. The hook stops attaching its own listener.

Side benefit: completions for ops started by an unmounted component (e.g., user navigates away mid-install) are still observed and still drive queue advance.

### 8. "Install all" semantics

The header button enqueues, in stable manifest order:

```
recommended.filter(e => !e.activeInPi)
           .map(e => ({
             source: e.source,
             action: "install",
             scope:  e.installed.scope ?? currentBrowserScope,
           }))
```

Disabled when no missing entries OR when the queue already contains a missing entry not yet completed. Tooltip shows the count: "Install 3 missing extensions".

## Risks / Trade-offs

- **Risk**: A queued item's `scope` could be stale by the time it runs (user toggled global/local while the queue was draining) → **Mitigation**: Capture `scope` at enqueue time. Today's per-card behavior is the same — the click reads `scope` then.
- **Risk**: A 409 retry storm if some other subsystem holds the lock for a long time → **Mitigation**: Hard cap at 1 retry per item; second 409 surfaces as `error`. The user sees a real failure rather than an infinite spinner.
- **Risk**: Page reload during a 5-deep queue loses items 2–5 → **Mitigation**: Documented as out of scope. Users get clear feedback (running op completes via WS; queued items just don't run, and the next click re-enqueues). Persistence is easy to add later.
- **Risk**: A buggy server that never emits `package_operation_complete` would freeze the queue → **Mitigation**: Existing per-op safety timeout (`usePendingPromptTimeout` is for prompts, not packages — we'd need a separate one). Out of scope here; today's hook has the same problem.
- **Trade-off**: Module singleton is slightly harder to reset per-test than a hook-local state. → Tests import the module and call an exported `__resetForTests()` between cases.

## Migration Plan

This is an additive client refactor with no persisted state, no protocol change, and no flag. Ship as a single change. Rollback = revert the commit.

## Open Questions

None blocking. Cancel-from-queue and reorder UX can be added later if requested.
