## ADDED Requirements

### Requirement: Credentials updated protocol message
The shared protocol SHALL define a `credentials_updated` message type in the `ServerToExtensionMessage` union. The message SHALL contain `{ type: "credentials_updated" }` with no additional payload.

#### Scenario: Message type definition
- **WHEN** the protocol types are compiled
- **THEN** `CredentialsUpdatedMessage` SHALL be a valid `ServerToExtensionMessage` variant with `type: "credentials_updated"`

### Requirement: Bridge handles credentials_updated
When the bridge extension receives a `credentials_updated` message from the server, it SHALL call `authStorage.reload()` on the cached `modelRegistry.authStorage` to force pi to re-read `auth.json` from disk.

#### Scenario: Credential reload on notification
- **WHEN** the bridge receives `{ type: "credentials_updated" }` and `modelRegistry.authStorage` is available
- **THEN** the bridge SHALL call `authStorage.reload()` so the pi session picks up updated credentials

#### Scenario: No modelRegistry available
- **WHEN** the bridge receives `credentials_updated` but `modelRegistry` has not been captured yet (session not started)
- **THEN** the bridge SHALL ignore the message without error
