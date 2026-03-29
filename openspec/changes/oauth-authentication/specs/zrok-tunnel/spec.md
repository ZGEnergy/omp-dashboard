## ADDED Requirements

### Requirement: Tunnel URL availability for auth
The tunnel module SHALL expose the active tunnel URL so that the auth module can use it to construct OAuth redirect URIs. The `createTunnel()` function SHALL store the tunnel URL and provide a `getTunnelUrl()` function to retrieve it.

#### Scenario: Tunnel created — URL available
- **WHEN** `createTunnel()` succeeds and returns a URL
- **THEN** `getTunnelUrl()` SHALL return that URL

#### Scenario: No tunnel — URL is null
- **WHEN** no tunnel has been created (zrok not enrolled, disabled, or creation failed)
- **THEN** `getTunnelUrl()` SHALL return null

#### Scenario: Tunnel deleted — URL cleared
- **WHEN** `deleteTunnel()` is called
- **THEN** `getTunnelUrl()` SHALL return null
