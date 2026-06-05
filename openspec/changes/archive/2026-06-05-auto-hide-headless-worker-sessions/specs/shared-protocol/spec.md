## ADDED Requirements

### Requirement: session_register hasUI and visibilityIntent fields
The `session_register` extension-to-server protocol message SHALL include the optional fields `hasUI: boolean` and `visibilityIntent: "hidden" | "visible"`. The bridge forwards these as facts; the server decides what to do with them.

`hasUI` SHALL reflect whether a TUI is attached to the pi process (`true` for interactive TUI sessions, `false` for headless/print-mode). The bridge SHALL populate it from its cached UI state. `visibilityIntent` SHALL be populated from the bridge's environment override — `PI_DASHBOARD_VISIBLE` ⇒ `"visible"`, `PI_DASHBOARD_HIDDEN` ⇒ `"hidden"` (visible wins when both are set) — and omitted when neither is set.

Both fields are optional and back-compatible. When `hasUI` is absent (legacy bridge), the server SHALL NOT apply the auto-hide heuristic and SHALL register the session with `hidden = false`. When `visibilityIntent` is absent, the server SHALL fall back to the heuristic (or to `hidden = false` when `hasUI` is also absent).

#### Scenario: Headless worker advertises no UI
- **WHEN** a print-mode pi (`pi -p`) registers
- **THEN** the message SHALL carry `hasUI: false`

#### Scenario: Explicit visibility override is forwarded
- **WHEN** the bridge process has `PI_DASHBOARD_HIDDEN` (or `PI_DASHBOARD_VISIBLE`) set
- **THEN** the message SHALL carry `visibilityIntent: "hidden"` (or `"visible"`)

#### Scenario: Legacy bridge omits the fields
- **WHEN** a bridge that predates this change registers
- **THEN** the message SHALL omit `hasUI` and `visibilityIntent`
- **AND** the server SHALL register the session with `hidden = false`
