## ADDED Requirements

### Requirement: Decorator cache SHALL be bounded per session

The server's `Session.uiDecorators` map MUST NOT exceed 256 distinct cache keys per session. When an `ext_ui_decorator` message would insert a 257th distinct key, the server MUST drop the descriptor (not silently — log a warning naming the rejected `${kind}:${namespace}:${id}` triple) and NOT broadcast it to subscribers. Updates to existing keys SHALL always succeed regardless of total count.

The bridge MUST track its own local view of distinct keys per session and enforce the same cap, dropping new descriptors locally with a warning before they reach the server. This is defense in depth — the server enforces because it owns the canonical cache; the bridge enforces because the network round-trip is wasted on a doomed descriptor.

`removed: true` decorators SHALL reduce the local and server key counts so previously-rejected new keys MAY be accepted on a subsequent probe.

#### Scenario: 257th distinct key is rejected
- **GIVEN** a session whose `uiDecorators` already contains 256 distinct keys
- **WHEN** the bridge forwards an `ext_ui_decorator` with a new key not in the cache
- **THEN** the server logs a warning naming the rejected key and does NOT update `uiDecorators` or broadcast

#### Scenario: Update to existing key always succeeds
- **GIVEN** a session at the 256-key limit
- **WHEN** the bridge forwards an `ext_ui_decorator` updating one of the existing keys
- **THEN** the server upserts the descriptor and broadcasts normally

#### Scenario: Removal frees capacity
- **GIVEN** a session at the 256-key limit
- **WHEN** the bridge sends `ext_ui_decorator { ..., removed: true }` for one existing key
- **THEN** the server deletes that key and a subsequent new key SHALL be accepted

### Requirement: Decorator string fields SHALL be length-capped

The bridge MUST truncate decorator string payloads exceeding their per-field cap to `cap - 1` characters followed by the Unicode ellipsis `…` (total length = `cap`). Truncation SHALL emit one warning per `(cache-key, field)` pair (latched per session). Caps:

| Kind | Field | Cap (chars) |
|---|---|---|
| `footer-segment` | `text` | 200 |
| `footer-segment` | `tooltip` | 500 |
| `agent-metric` | `text` | 200 |
| `agent-metric` | `tooltip` | 500 |
| `breadcrumb` | `steps[].label` | 80 |
| `gate` | `reason` | 500 |
| `toast` | `message` | 500 |

`breadcrumb.steps` SHALL additionally be capped at 20 entries per descriptor; excess entries SHALL be dropped with a warning naming the cache key.

The server MUST re-apply the same truncation defensively when processing `ext_ui_decorator` (regression guard for older bridges).

#### Scenario: Footer text truncated with ellipsis
- **WHEN** the bridge receives a probe descriptor with `kind: "footer-segment"` whose `text` is 250 chars
- **THEN** the bridge forwards `text` as 199 chars of the original plus `…` (total 200 chars)
- **AND** logs one warning naming `${kind}:${namespace}:${id}` and field `"text"`

#### Scenario: Breadcrumb step cap
- **WHEN** an extension pushes a `breadcrumb` descriptor with 30 steps
- **THEN** the bridge keeps the first 20 steps and drops the remaining 10
- **AND** logs a warning naming the cache key and indicating step truncation

#### Scenario: Warning is latched per field
- **WHEN** the same `(cache-key, field)` pair is truncated three times in one session
- **THEN** the bridge logs the warning exactly once

### Requirement: Module string fields SHALL be length-capped

The bridge MUST truncate `ExtensionUiModule` and nested `UiField` / `UiAction` string fields exceeding their per-field cap, using the same ellipsis convention as decorators. Caps:

| Type | Field | Cap (chars) |
|---|---|---|
| `ExtensionUiModule` | `title` | 120 |
| `ExtensionUiModule` | `description` | 500 |
| `UiField` | `label` | 120 |
| `UiField` | `helpText` | 500 |
| `UiAction` | `label` | 80 |
| `UiAction` | `confirm` | 500 |

Over-limit module fields SHALL NOT be a rejection — the module remains valid; only the strings are truncated.

#### Scenario: Module title truncated
- **WHEN** an extension pushes `{ kind: "management-modal", id: "x", title: <130-char string>, ... }`
- **THEN** the bridge forwards a module whose `title` is 119 chars of the original plus `…`

### Requirement: Descriptor JSON size SHALL be hard-capped

Any single descriptor (module OR decorator) whose `JSON.stringify(descriptor).length > 65536` MUST be rejected by the bridge with a warning naming the offending key (`module.id` for modules; `${kind}:${namespace}:${id}` for decorators). Rejected descriptors SHALL NOT be forwarded. The server MUST re-apply the same check when receiving forwarded messages and reject with the same warning shape.

This is a hard reject (not truncation) because descriptors at this size are almost certainly bugs (recursive structure, base64 payload, leaked debug dump) and silent truncation would corrupt the descriptor's semantics.

#### Scenario: 70 KB module is rejected at bridge
- **WHEN** an extension pushes a `management-modal` descriptor whose serialized JSON is 70 KB
- **THEN** the bridge logs a warning naming the module id and does NOT forward a `ui_modules_list` entry for it
- **AND** other modules in the same probe are unaffected

#### Scenario: Server rejects oversize descriptor from older bridge
- **WHEN** an older bridge forwards a 70 KB `ext_ui_decorator` despite the rule
- **THEN** the server rejects the message with a warning and does NOT update `uiDecorators` or broadcast

### Requirement: Bound constants SHALL live in a shared module

The shared package MUST export an `EXT_UI_BOUNDS` constant from `packages/shared/src/extension-ui-bounds.ts` containing every cap defined above (decorator key cap, per-field caps, JSON-size cap, breadcrumb step cap). All enforcement sites (bridge, server, client cosmetic guards) MUST import from this module rather than hardcoding values. Tests MUST also import from this module to ensure the spec and implementation drift together.

#### Scenario: Single source of truth
- **WHEN** a code path enforces a bound (truncation, rejection, cosmetic CSS cap)
- **THEN** the implementation imports the value from `@blackbelt-technology/pi-dashboard-shared/extension-ui-bounds`
- **AND** no enforcement site hardcodes a numeric literal duplicating an `EXT_UI_BOUNDS` entry
