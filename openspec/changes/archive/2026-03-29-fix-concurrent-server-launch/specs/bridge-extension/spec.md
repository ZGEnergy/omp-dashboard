## ADDED Requirements

### Requirement: Retry port probe after failed server launch
When `launchServer` returns a failure result during the auto-start flow in `session_start`, the bridge extension SHALL re-probe the port using `isPortOpen(config.piPort)` before deciding whether to show a warning notification.

- If the re-probe returns `true` (port is now open), the bridge SHALL suppress the failure warning — another agent started the server concurrently.
- If the re-probe returns `false` (port is still closed), the bridge SHALL show the warning notification with the failure message.

#### Scenario: Concurrent launch — another agent started the server
- **WHEN** `launchServer` fails and the subsequent `isPortOpen` re-probe returns `true`
- **THEN** no warning notification SHALL be shown

#### Scenario: Genuine server failure
- **WHEN** `launchServer` fails and the subsequent `isPortOpen` re-probe returns `false`
- **THEN** the bridge SHALL show a warning notification with the failure message

#### Scenario: Single agent — successful launch
- **WHEN** `launchServer` succeeds on the first attempt
- **THEN** the bridge SHALL show the success notification as before (no behavioral change)
