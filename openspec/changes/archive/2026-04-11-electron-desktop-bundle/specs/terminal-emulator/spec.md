## MODIFIED Requirements

### Requirement: Cross-platform shell detection for terminal spawn
The terminal manager SHALL detect the appropriate shell binary based on the platform instead of defaulting to `/bin/bash`.

#### Scenario: macOS/Linux shell detection
- **WHEN** a terminal is created on macOS or Linux
- **THEN** the shell SHALL be `process.env.SHELL` or `/bin/bash` as fallback (existing behavior)

#### Scenario: Windows shell detection
- **WHEN** a terminal is created on Windows
- **THEN** the shell SHALL be `process.env.COMSPEC` or `powershell.exe` as fallback
- **AND** `/bin/bash` SHALL NOT be used

#### Scenario: Windows terminal environment
- **WHEN** a terminal is spawned on Windows
- **THEN** the environment SHALL include `TERM=cygwin` or appropriate Windows terminal type
