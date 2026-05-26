## Context

The Phase-1 wire protocol (`add-extension-ui-modal`, archived 2026-04-26) ships three messages: `ui_modules_list`, `ui_data_list`, `ui_management`. The bridge's `handleUiManagement` re-emits the user action as `pi.events.emit(event, { ...params, action, _reply })`. Extensions can either populate `data.items` synchronously (list refresh) or call `data._reply(items)` (async list refresh). Mutating actions have no reply channel — they either succeed silently, fail silently, or follow up with `pi.events.emit("ui:invalidate", { id })` to force a full re-probe.

This is fine for prototypes; it breaks for production UX. Real-world extensions need:

- A loading indicator on the action button while the work runs.
- An error banner when the action fails (network down, validation, permissions).
- Field-level error feedback inside form views.
- Declarative refresh — "after success, refetch event X" — without requiring extensions to remember the imperative dance.
- Auto-close on success for one-shot dialogs (e.g. "Save and close").

## Goals / Non-Goals

**Goals**

- One request → one terminal result, correlated by `reqId`.
- Extension code stays minimal: `data._result({ ok: true, refresh: [...], close: true })` is one line.
- Backward compatible — extensions that ignore `_result` still work, with a 30 s synthetic success.
- Client renders pending / error / field-error states declaratively from the result.

**Non-Goals**

- Streaming progress events. One request, one terminal result. Long-running work uses `ui:invalidate` to push updates.
- Bidirectional acknowledgement loops. Result is one-way (extension → client).
- Replacing `_reply` for `action: "list"`. List refresh continues to use `ui_data_list` because (a) it's already shipped and (b) data payload is too large to bundle with every result.

## Decisions

### 1. `reqId` is client-generated and opaque

The browser generates `reqId = crypto.randomUUID()` per dispatched action. The bridge echoes it verbatim. This avoids any server-side correlation table and lets two concurrent actions on the same modal resolve independently.

For backward-compatible rollout, `reqId` is optional on the wire for one minor release. Bridges that receive a `ui_management` without `reqId` synthesize `"legacy-${counter}"` and warn once per session. After the deprecation window, missing `reqId` becomes a protocol error.

### 2. `_result` is preferred over throwing

Extension listeners *could* throw to indicate failure, but the bridge already wraps `events.emit` in a `try/catch` for crash resilience. We don't want failures to be ambiguous between "intended error result" and "extension crashed". Explicit `_result({ ok: false, error })` is the contract. A thrown error is logged and produces a synthetic `{ ok: false, error: "extension threw" }`.

### 3. `refresh: string[]` not `refresh: boolean`

Extensions name which `dataEvent`s to refresh. Most actions affect one table; some affect multiple sibling tables in the same modal. A boolean would force refresh-all-or-nothing. An array is barely more code at the extension and avoids unnecessary fetches.

### 4. `fieldErrors` keyed by `UiField.key`

For form views, the result can carry `fieldErrors: { name: "Required", endpoint: "Invalid URL" }`. The client renders the error text under the matching field. Unknown keys are ignored with a console warning. This matches RJSF's per-field error contract for forward-compat with Phase 4.

### 5. 30 s synthetic-success timeout

Pure-backward-compat path for extensions that don't yet call `_result`. The button spinner stops; the modal stays open; a console warning identifies the extension by `module.id` and recommends migration. Timeout is configurable per session via `ui:configure` to accommodate slow workflows.

### 6. No server-side caching of results

`ui_management_result` is terminal per-request. A browser that reconnects mid-action will never see the result — the modal's pending state expires via the client-side 60 s GC. This is acceptable because:

- Mutations are extension-side; the next probe / refresh shows the new state.
- Caching adds memory pressure (one entry per in-flight action × all reconnect windows).
- The reconnect window is already a degraded experience by definition.

The server *does* enforce an LRU of recently-seen `reqId`s (256 per session) to drop late or duplicate results — prevents replay storms.

## Open Questions

None blocking. Implementation can proceed.

## Out-of-Scope Explicitly

- Streaming progress / multi-step results.
- Server-side result caching across reconnects.
- Cross-session result correlation (e.g. action in session A affects session B).
- Retry/idempotency semantics — extensions are responsible for their own retry safety.
