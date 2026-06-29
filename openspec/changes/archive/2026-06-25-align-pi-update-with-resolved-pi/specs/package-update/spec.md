## MODIFIED Requirements

### Requirement: Server updates pi packages via PackageManager

The server SHALL update pi-loaded packages (extensions/skills/prompts/themes) by delegating to the resolved pi's own updater rather than a dashboard-driven npm path. A single-package update SHALL run `pi update --extension <source>`; an all-extensions update SHALL run `pi update --extensions`. The server SHALL stream the child process output to update-progress events and SHALL treat a zero exit code as success.

#### Scenario: Update all extensions
- **WHEN** an update-all (extensions) request is received
- **THEN** the server SHALL run `pi update --extensions` on the resolved pi
- **AND** SHALL report success on exit code 0

#### Scenario: Update specific extension
- **WHEN** an update request names a specific package source `<source>`
- **THEN** the server SHALL run `pi update --extension <source>` on the resolved pi

#### Scenario: Update runs under the resolved pi
- **WHEN** any extension update is executed
- **THEN** the pi binary invoked SHALL be the one resolved via `ToolRegistry.resolveExecutor("pi")` (the same binary used to spawn sessions)
