# editor-detection.ts — index

Auto-detect code-server/openvscode-server binary. Exports `detectCodeServerBinary` (order: config override → `code-server` → `openvscode-server` on PATH, cached after first call), `whichBinary` (uses `ToolResolver` where/which split + login-shell fallback), `resetDetectionCache`, `BINARIES_TO_CHECK`, `EditorDetectionResult`. See change: fix-windows-server-parity.
