## MODIFIED Requirements

### Requirement: Editor detection
The system SHALL detect available native editors by checking if the editor application process is currently running AND the corresponding CLI binary is available on the system PATH. Native editor buttons (e.g., Zed) SHALL appear in the folder action bar instead of per-session-card placement. The `code`/`vscode` native editor entry SHALL be excluded from the action bar since VS Code is now served via the browser-based EditorView.

Process detection SHALL use `pgrep`:
- **macOS**: `pgrep -f "<app-bundle-path>"` (e.g., `/Applications/Zed.app`)
- **Linux**: `pgrep -x "<process-name>"` (e.g., `zed`)

If `pgrep` is not available or fails, the editor SHALL be treated as not running.

#### Scenario: Zed is running and CLI is available
- **WHEN** the Zed application process is running and `zed` CLI is on PATH
- **THEN** the Zed button SHALL appear in the folder action bar

#### Scenario: VS Code native entry excluded
- **WHEN** VS Code is running with `code` CLI available
- **THEN** the `code`/`vscode` entry SHALL NOT appear as a native editor button in the action bar
- **THEN** VS Code is accessible via the Editor button (code-server) instead

#### Scenario: Editor is installed but not running
- **WHEN** `zed` CLI is on PATH but the Zed application is not running
- **THEN** the Zed button SHALL NOT appear in the action bar

#### Scenario: No editors running
- **WHEN** no recognized native editor processes are running
- **THEN** no native editor buttons SHALL appear in the action bar
