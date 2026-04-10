## MODIFIED Requirements

### Requirement: Windows editor detection
The editor registry SHALL include Windows-specific process patterns and CLI detection for supported editors.

#### Scenario: Detect VS Code on Windows
- **WHEN** editor detection runs on Windows
- **THEN** it SHALL check for `code.cmd` on PATH and common install paths (`%LOCALAPPDATA%\Programs\Microsoft VS Code\`)

#### Scenario: Detect IntelliJ on Windows
- **WHEN** editor detection runs on Windows
- **THEN** it SHALL check for `idea64.exe` on PATH and common JetBrains Toolbox paths

#### Scenario: Platform-aware process pattern
- **WHEN** the editor registry defines process patterns
- **THEN** it SHALL include a `win32` key alongside existing `darwin` and `linux` keys
