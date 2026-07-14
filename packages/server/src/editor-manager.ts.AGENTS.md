# editor-manager.ts — index

Lifecycle manager for code-server child processes via editor-keeper sidecar. Exports `createEditorManager`, `EditorManager` interface, `EditorInstanceInfo`, `allocatePort`, `waitForPort`. `start(cwd)` 3-way resolve: in-memory → live keeper reattach → fresh keeper spawn; `editorId=sha256(cwd).slice(0,12)` stable across restarts; idle timeout eviction; `maxInstances` cap; in-flight start dedup; theme writes to VSCode user settings; `stop`/`stopAll` (config-gated `stopOnDashboardExit`)/`forceStopAll`/`adopt`/`heartbeat`. See change: add-editor-keeper-sidecar.
