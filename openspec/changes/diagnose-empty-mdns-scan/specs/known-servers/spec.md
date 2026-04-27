## ADDED Requirements

### Requirement: Free-form host input parsing
The client SHALL provide a pure helper `parseHostInput(input, defaultPort)` (`packages/client/src/lib/parse-host-input.ts`) that converts a user-supplied host string into a `{ host, port }` pair, returning `null` on invalid input. The helper accepts:

- Full URL with scheme: `http://192.168.16.202:8000` (path and trailing slash ignored)
- URL without explicit port: `http://office-mac.local` (uses `defaultPort`)
- `host:port`: `192.168.16.202:8000`
- Bare hostname: `office-mac.local` (uses `defaultPort`)
- Bracketed IPv6 with or without port: `[::1]:8000`, `[::1]`

The helper SHALL trim leading/trailing whitespace and SHALL reject:

- Empty or whitespace-only input
- Bare (un-bracketed) IPv6 strings (ambiguous with `host:port`)
- Ports outside `1..65535` or non-numeric
- Malformed URLs (`http://` with no host)

#### Scenario: Parses full URL with port
- **WHEN** `parseHostInput("http://192.168.16.202:8000")` is called
- **THEN** it SHALL return `{ host: "192.168.16.202", port: 8000 }`

#### Scenario: Parses host:port
- **WHEN** `parseHostInput("192.168.16.202:8000")` is called
- **THEN** it SHALL return `{ host: "192.168.16.202", port: 8000 }`

#### Scenario: Falls back to default port
- **WHEN** `parseHostInput("office-mac.local", 8000)` is called
- **THEN** it SHALL return `{ host: "office-mac.local", port: 8000 }`

#### Scenario: Parses bracketed IPv6
- **WHEN** `parseHostInput("[::1]:8000")` is called
- **THEN** it SHALL return `{ host: "::1", port: 8000 }`

#### Scenario: Rejects bare IPv6 (ambiguous)
- **WHEN** `parseHostInput("::1:8000")` is called
- **THEN** it SHALL return `null`

#### Scenario: Rejects invalid port
- **WHEN** `parseHostInput("host:abc")` or `parseHostInput("host:99999")` is called
- **THEN** it SHALL return `null`

#### Scenario: Rejects empty input
- **WHEN** `parseHostInput("")` or `parseHostInput("   ")` is called
- **THEN** it SHALL return `null`

### Requirement: Surface scan errors in the UI
The Network Discovery section SHALL display the scan error message to the user when `POST /api/discover-servers` rejects (network error, server unreachable, etc.) instead of silently treating the failure as an empty result.

#### Scenario: Scan throws
- **WHEN** the user clicks "Scan network" and `discoverServers()` rejects with `Error("connection refused")`
- **THEN** the section SHALL render `Scan failed: connection refused` in a red message beneath the scan button
- **AND** SHALL still mark the scan as completed so the empty-state diagnostic also appears

## MODIFIED Requirements

### Requirement: Settings panel network discovery section
The Settings panel SHALL include a "Network Discovery" sub-section with a scan button, discovered server results, a diagnostic empty-state, and an inline manual-add form.

#### Scenario: Trigger network scan
- **WHEN** the user clicks "Scan network"
- **THEN** the system SHALL call `POST /api/discover-servers` and display results

#### Scenario: Add discovered server with label
- **WHEN** the user clicks "Add" on a discovered server
- **THEN** a label input SHALL appear (pre-filled with the server's hostname)
- **AND** confirming SHALL call `POST /api/known-servers` with the host, port, and user-entered label

#### Scenario: Discovered server already known
- **WHEN** a discovered server's host:port matches an entry in known servers
- **THEN** it SHALL show as "Already added" instead of an "Add" button

#### Scenario: Empty result shows diagnostic block
- **WHEN** the scan completes and discovers zero servers
- **THEN** the section SHALL render a diagnostic block listing the common reasons mDNS discovery fails: Wi-Fi AP/client isolation, mesh routers or Wi-Fi extenders dropping multicast, different VLANs/subnets, an active VPN capturing the default route, and the macOS firewall blocking inbound traffic on the dashboard port
- **AND** the diagnostic block SHALL include an inline manual-add form

#### Scenario: Manual-add via free-form input
- **WHEN** the diagnostic empty-state is visible and the user types `192.168.16.202:8000` (or `http://192.168.16.202:8000`) into the host input, optionally types a label, and presses Enter or clicks Add
- **THEN** the section SHALL call `parseHostInput(...)` to extract `{host, port}`
- **AND** call `POST /api/known-servers` with the parsed host, port, and label
- **AND** clear the input on success
- **AND** call the `onServerAdded` callback so the parent re-fetches known servers

#### Scenario: Manual-add with invalid input
- **WHEN** the user submits the manual-add form with an unparseable string
- **THEN** the section SHALL display an inline validation error (`Enter a host like 192.168.1.42:8000 or http://office-mac.local:8000`)
- **AND** SHALL NOT call `POST /api/known-servers`

#### Scenario: Manual-add with duplicate host:port
- **WHEN** the user submits a host:port that already exists in `knownServers`
- **THEN** the section SHALL display an inline message naming the host:port and noting it is already added
- **AND** SHALL NOT call `POST /api/known-servers`
