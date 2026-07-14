# live-server-proxy.ts — index

Reverse proxy for live-server targets on MAIN origin `/live/:id/*` (mirrors editor-proxy). `registerLiveServerProxy` (reply-from to `http://127.0.0.1:<port>`, only forwards manager-registered=validated targets, unregistered→404) + `handleLiveServerUpgrade` (raw TCP WS pipe for HMR). See change: improve-content-editor.
