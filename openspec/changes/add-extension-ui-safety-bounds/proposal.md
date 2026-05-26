## Why

The Extension UI System replay cache (`Session.uiDataMap`) already enforces a per-event cap of 1000 items. Two adjacent caches and field shapes do **not** have similar bounds:

- `Session.uiDecorators: Record<string, DecoratorDescriptor>` — keyed by `${kind}:${namespace}:${id}`. No cap on the number of distinct keys. A buggy extension churning unique ids leaks memory until session end. A malicious or runaway extension can OOM the dashboard server with one event-loop tick.
- Decorator text fields — `footer-segment.text`, `agent-metric.text`, `toast.message`, `gate.reason`, `breadcrumb.steps[].label` — have no length limit. A 10 MB string trivially overflows the cache, the WebSocket frame, and the client DOM.

The dashboard runs untrusted extension code by design (third-party pi extensions). Memory and payload bounds are part of the trust boundary. Phase-1/Phase-2 implementation skipped them because nothing in the prototype exercised the limits; production deployments need them before the first untrusted extension lands.

## What Changes

- **NEW**: Per-session cap on `Session.uiDecorators` distinct keys. Default `256`. On overflow, the bridge SHALL log a warning and drop the newest descriptor (FIFO-on-overflow would surprise extensions; reject-new is predictable).
- **NEW**: Per-field length caps on decorator string payloads:
  - `footer-segment.text` ≤ 200 chars
  - `footer-segment.tooltip` ≤ 500 chars
  - `agent-metric.text` ≤ 200 chars
  - `agent-metric.tooltip` ≤ 500 chars
  - `breadcrumb.steps[].label` ≤ 80 chars (max 20 steps per descriptor)
  - `gate.reason` ≤ 500 chars
  - `toast.message` ≤ 500 chars
- **NEW**: Per-field length caps on module payloads:
  - `ExtensionUiModule.title` ≤ 120 chars
  - `ExtensionUiModule.description` ≤ 500 chars
  - `UiField.label` ≤ 120 chars
  - `UiField.helpText` ≤ 500 chars
  - `UiAction.label` ≤ 80 chars
- **NEW**: Truncation policy — over-limit strings SHALL be truncated to the cap with a `…` suffix (one Unicode ellipsis char counted in the budget) and a one-shot warning per `(module.id|cache-key, field)` pair, NOT a rejection. Rejecting would surprise extensions; truncating preserves the dashboard rendering.
- **NEW**: Total descriptor JSON size cap per message: 64 KB. Exceeding this rejects the entire descriptor (not a partial truncate — descriptors at this size are almost certainly bugs).

## Capabilities

### Modified Capabilities

- `extension-ui-system`: adds memory bounds and per-field length contracts to the existing requirements on the decorator cache and module schema.

## Impact

- `packages/extension/src/ui-modules.ts` — bound enforcement happens at the bridge boundary, before forwarding. Adds a small `truncateField(str, cap, ctx)` helper and a JSON-size guard.
- `packages/server/src/event-wiring.ts` — same checks applied defensively at the server boundary (defense in depth) when processing `ext_ui_decorator`.
- `packages/shared/src/extension-ui-bounds.ts` — new file: exports the cap constants as a single source of truth.
- `packages/client/src/components/extension-ui/*.tsx` — no functional change; slot components already render via React text nodes. Add a `max-w-[200px] truncate` CSS treatment for footer-segment text as defense-in-depth visual cap.

Rollback considerations:

- All caps are constants in a single file; raising them is a one-line change.
- Truncation (not rejection) is the default, so existing extensions don't break on adoption.
- Total JSON-size rejection is the only hard-fail; rejection logs the full key so debugging is straightforward.
