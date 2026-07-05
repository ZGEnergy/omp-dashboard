## ADDED Requirements

### Requirement: Operator-side pairing view renders the payload
The dashboard web client SHALL provide an operator-side pairing view that, on open, calls `GET /api/pair/payload` and renders the returned `{ v, id, code, urls[] }` payload BOTH as a scannable QR code AND as a copyable base64url string. The view SHALL display the server fingerprint `id`, a countdown reflecting the one-time code TTL (~60s), and the list of `urls[]` currently advertised.

This closes the gap where the existing "pairing view" scenarios in this capability had no web-client implementation: `GET /api/pair/payload` shipped with zero callers.

#### Scenario: Payload rendered on open
- **WHEN** the operator opens the pairing view AND at least one `wss://`-reachable endpoint exists
- **THEN** the view SHALL show a QR encoding the payload AND the same payload as a copyable string
- **AND** the view SHALL show the fingerprint `id` and a TTL countdown for the one-time code

#### Scenario: No secure road → empty state
- **WHEN** `GET /api/pair/payload` returns `no_reachable_endpoint`
- **THEN** the view SHALL explain that a tunnel or a publicly-trusted TLS URL is required to pair a remote device
- **AND** SHALL offer actions to start a tunnel, add an HTTPS URL, and note the `http://localhost` escape hatch

### Requirement: Non-zrok endpoint entry via the UI without hand-editing JSON
The dashboard SHALL let an operator add a non-tunnel `https://`/`wss://` pairing endpoint through the UI WITHOUT hand-editing any JSON config file, reusing the existing authenticated config-write path (`PUT /api/config`) — NOT a pairing-specific route. The control SHALL read the current config, append the entered URL to `pairing.publicBaseUrls`, and PUT the full `pairing` object back. After a successful add, the pairing view SHALL re-fetch the payload so the new endpoint appears in `urls[]`. The `https`/`wss` gate is enforced server-side at read-time by `reachableUrls()` (D4/D14); any non-secure entry is dropped before advertisement regardless of how it was written.

Before this change, `pairing.publicBaseUrls` had no UI affordance — forcing a hand-edit of `~/.pi/dashboard/config.json`.

#### Scenario: Operator adds an HTTPS URL via UI
- **WHEN** the operator submits `https://dashboard.example.com` in the pairing view's Add-URL control
- **THEN** the client SHALL PUT the full `pairing` object (including the appended URL) to `PUT /api/config`
- **AND** the re-fetched payload's `urls[]` SHALL include it
- **AND** no JSON file SHALL have been edited by hand

#### Scenario: Plain-http URL never advertised
- **WHEN** a `http://192.168.1.10:8000` entry reaches `pairing.publicBaseUrls` (via UI or hand-edit)
- **THEN** `reachableUrls()` SHALL omit it from the pairing payload's `urls[]`
- **AND** the UI SHALL reject the entry client-side with a message that only `https`/`wss` endpoints are accepted

#### Scenario: Write path is authenticated
- **WHEN** an unauthenticated request hits `PUT /api/config`
- **THEN** the request SHALL be rejected by the existing auth gate (same gate as `bindHost`/`bypassHosts`)

### Requirement: Operator approval via typed compare-code in the web client
The pairing view SHALL implement the D12 active-typed approval: when a device redeems a code and becomes PENDING, the view SHALL present the pending device and a field for the operator to TYPE the numeric confirmation code displayed on the physical device, calling `POST /api/pair/approve`. Approval SHALL NOT be a one-click accept of a pushed prompt.

Before this change, `/api/pair/approve` had no web-client caller, so an operator could not complete a pairing at all.

#### Scenario: Correct confirm code approves the device
- **WHEN** the operator types the confirmation code shown on the pairing device AND submits
- **THEN** the client SHALL call `POST /api/pair/approve` with the code and confirm code
- **AND** on success the device SHALL move into the paired-devices list

#### Scenario: Wrong confirm code rejected
- **WHEN** the operator types a non-matching confirmation code
- **THEN** the approval SHALL fail and the view SHALL show an error without pairing the device
