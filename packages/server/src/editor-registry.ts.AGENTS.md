# editor-registry.ts — index

Static editor detection (Zed, VS Code, IntelliJ). Exports `EDITORS` (id/name/cli/winCli/processPattern per platform), `detectEditors(_cwd)` (running-process + CLI-on-PATH check), `isProcessRunning` (re-export of shared `platform/process-scan`), `isProcessRunningWin32` (deprecated alias). Uses `ToolResolver.which` for CLI availability. See change: consolidate-platform-handlers.
