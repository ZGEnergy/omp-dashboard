# editor-api.ts — index

Client editor detection + open-editor API. Exports `isLocalhost`, `DetectedEditor`, `fetchEditors(cwd)` (GET /api/editors), `openEditor(cwd, editorId, file?, line?)` (POST /api/open-editor). Uses `getApiBase`.
