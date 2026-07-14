# editor-proxy.ts — index

Reverse proxy for code-server instances. Exports `registerEditorProxy` (Fastify `reply-from` for `/editor/:id/*` and `/editor/:id`, rewrites `Host` + `Location` headers to inject `/editor/<id>/` prefix) and `handleEditorUpgrade` (raw TCP pipe for WebSocket upgrade, strips host/origin). Resolves editor by id via `editorManager.get`, 404/destroy when not found or not `ready`.
