## 1. Protocol Changes
- [x] 1.1 Add `ExtensionUiDismissMessage` to `src/shared/protocol.ts` (extension→server)
- [x] 1.2 Add `BrowserUiDismissMessage` to `src/shared/browser-protocol.ts` (server→browser)

## 2. UI Proxy Race Cancellation
- [x] 2.1 Add AbortController per dialog call in `ui-proxy.ts` — pass signal to TUI via opts
- [x] 2.2 When dashboard wins: abort TUI dialog via AbortController
- [x] 2.3 When TUI wins: delete pending Map entry + send `extension_ui_dismiss` to server
- [x] 2.4 Apply same pattern to all five methods (confirm, select, input, editor, multiselect)

## 3. Server Forwarding
- [x] 3.1 Handle `extension_ui_dismiss` in `pi-gateway.ts` — forward to browser clients via `browser-gateway.ts`

## 4. Browser Client
- [x] 4.1 Handle `ui_dismiss` message in event reducer — transition interactive request from "pending" to "dismissed"
- [x] 4.2 Update interactive renderers to show dismissed state (compact card with "Answered in terminal" indicator)

## 5. Tests
- [x] 5.1 Unit tests for ui-proxy race cancellation (TUI wins, dashboard wins, cleanup)
- [x] 5.2 Unit tests for event reducer dismiss handling
