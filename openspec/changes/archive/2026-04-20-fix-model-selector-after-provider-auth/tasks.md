## 1. Protocol & Server

- [x] 1.1 Add `ModelsRefreshedMessage` type to `packages/shared/src/browser-protocol.ts` and include it in the `ServerToBrowserMessage` union
- [x] 1.2 In `packages/server/src/routes/provider-auth-routes.ts`, broadcast `models_refreshed` to browser clients after each `notifyBridges()` call
- [x] 1.3 Write test verifying `models_refreshed` is broadcast to browser gateway on credential write/remove

## 2. Client

- [x] 2.1 Handle `models_refreshed` in `packages/client/src/hooks/useMessageHandler.ts` — clear `modelsMap` and send `request_models` for selected session
- [x] 2.2 Write test verifying `models_refreshed` clears modelsMap and triggers request_models

## 3. Bridge Logging

- [x] 3.1 Replace `/* ignore */` catch blocks in the `credentials_updated` handler in `packages/extension/src/bridge.ts` with `console.error("[dashboard]", err)` logging
