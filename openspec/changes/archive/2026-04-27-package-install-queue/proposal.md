## Why

Clicking Install on a package while another install is running stops the spinner on the first package, makes the second click silently fail with a 409, and offers no way to bulk-install the recommended set. The server already serializes package operations correctly — the broken UX is purely client-side: `usePackageOperations` is a single-slot hook, so a new click overwrites the source it tracks, leaving the original install orphaned in the UI.

## What Changes

- Replace the single-slot `usePackageOperations` state with a module-level FIFO queue store that tracks one *running* operation plus N *queued* operations, keyed by `source`.
- Per-source status (`idle | queued | running | success | error`) drives the spinner / pill on every card, so spinners survive across rapid clicks AND across components (Recommended panel and Packages tab now share state).
- Auto-advance: when the running op completes (via `package_operation_complete` WS message), shift the next queued op and POST it.
- On a 409 `PackageOperationBusyError` response (race with a non-queue subsystem), re-queue the request once instead of surfacing the error.
- Add an **"Install all missing"** button to the Recommended Extensions header that enqueues every entry where `!activeInPi`, using each entry's already-installed scope when present.
- Update the top-of-panel banner in PackageBrowser to show running source + queue depth (e.g. "Installing pi-flows… (2 queued)").

No server / WebSocket protocol changes — the wrapper's existing `busy` lock and `package_operation_complete` event are exactly what the queue needs.

## Capabilities

### New Capabilities
*(none)*

### Modified Capabilities
- `package-install`: Adds client-side queueing behavior on top of the existing single-flight install API, plus a bulk-install entrypoint over the recommended set. The REST contract (`POST /api/packages/install` returns 202 + operationId; concurrent → 409) is unchanged; the new requirements describe how the client schedules these calls.

## Impact

- **Client only.** New module `packages/client/src/lib/package-queue.ts`. Rewrite of `packages/client/src/hooks/usePackageOperations.ts` to be a thin subscriber over the store while preserving the public API consumed by `PackageBrowser` and `RecommendedExtensions`. Small UI additions to `RecommendedExtensions.tsx` (Install-all button, "Queued" pill) and `PackageBrowser.tsx` (queue-depth banner).
- **No server changes.** `packageManagerWrapper.run`, `/api/packages/install|remove|update`, and the `package_operation_complete` WS message stay as-is.
- **No protocol changes.** Existing `pi-package-event` `CustomEvent` continues to be the bridge from `useMessageHandler` → store.
- **Tests.** New unit tests for the queue store (FIFO advance, dedup on duplicate enqueue, retry-on-409, completion advances). Existing tests for `usePackageOperations` updated to drive the store.
