## ADDED Requirements

### Requirement: Post-reload readback verifies session picked up the package change
After the server sends `/reload` to a session following a successful package install or update, the server SHALL verify within a 5-second budget that the session has observed the new/changed package. If verification fails, the server SHALL emit a `package_reload_incomplete` message to all connected browser clients so the UI can surface a non-destructive warning.

#### Scenario: Reload verified successfully
- **WHEN** `/reload` is sent to session `S` after installing package `P` and within 5 s `S` reports (via gateway readback or `extensions_loaded` event) that `P` is present in its loaded manifest
- **THEN** no `package_reload_incomplete` message SHALL be emitted

#### Scenario: Reload readback times out
- **WHEN** 5 s elapse after `/reload` is sent to session `S` and no confirmation of `P` has arrived
- **THEN** the server SHALL emit `{ type: "package_reload_incomplete", sessionId: S, packageName: P, operation: "install" | "update" }` to all connected browser clients

#### Scenario: Reload readback reports missing package
- **WHEN** session `S` explicitly reports its loaded package list within the 5 s budget and `P` is absent
- **THEN** the server SHALL emit `package_reload_incomplete` immediately (no need to wait for the full 5 s)

#### Scenario: Client renders non-destructive warning
- **WHEN** the client receives a `package_reload_incomplete` message
- **THEN** it SHALL render a dismissible toast with text like `"Installed <P>, but session <S-name> did not pick it up — restart the session to apply."`
- **AND** the toast SHALL persist until the user dismisses it (not auto-hide)

#### Scenario: Remove operation is not readback-verified
- **WHEN** the operation is `remove`
- **THEN** readback SHALL NOT run (a removed package is expected to disappear; no positive signal is needed and pi's reload semantics for removal are already reliable)
