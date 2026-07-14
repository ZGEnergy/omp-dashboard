# editor-pid-registry.ts — index

Boot-time code-server orphan reconciliation. Exports `createEditorPidRegistry`, `EditorPidRegistry`, `adoptOrphans` (via `KeeperManager.discoverExistingKeepers` → `editor-manager.adopt`), `cleanupOrphans` (defensive cmdline sweep SIGTERM/SIGKILL pre-keeper `code-server` lacking sidecar), `isDashboardOwnedCodeServer`, `defaultGetCmdline` (PowerShell Get-CimInstance on Win — no wmic). Cross-platform PID enumerate via `/proc`/`ps`/PowerShell. Test-guarded via `isUnsafeTestHomeScan`. See change: add-editor-keeper-sidecar.
