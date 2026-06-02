## 1. Move the View menu into the StatusBar

- [ ] 1.1 In `App.tsx`, add `import { ChatViewMenu } from "./components/ChatViewMenu.js"`.
- [ ] 1.2 In `App.tsx`, extend the `<StatusBar leading={…}>` prop (~line 1329) to render the existing `<StatusBarRefreshButton …/>` followed by `<ChatViewMenu sessionId={selectedId} currentOverride={selectedSession?.displayPrefsOverride} send={(msg) => send({ type: "setSessionDisplayPrefs", sessionId: selectedId, override: msg.override })}/>`. Gate the `ChatViewMenu` on a truthy `selectedId`/`selectedSession`. → verify: bottom bar shows `⟳ ⚙View │ model …`.
- [ ] 1.3 In `App.tsx`, remove `onSetDisplayPrefs` and `displayPrefsOverride` from the `<ChatView …>` mount (~line 1292). → verify: no TS unused-prop errors.

## 2. Remove the old ChatView toolbar row

- [ ] 2.1 In `ChatView.tsx`, delete the `{sessionId && onSetDisplayPrefs && (<div className="flex items-center justify-end px-2 py-1 border-b …"><ChatViewMenu …/></div>)}` block (~line 307). → verify: chat scroll area is first child under `TokenStatsBar`.
- [ ] 2.2 In `ChatView.tsx`, remove `onSetDisplayPrefs` and `displayPrefsOverride` from `Props` and the function destructure.
- [ ] 2.3 In `ChatView.tsx`, remove the now-unused `import { ChatViewMenu } from "./ChatViewMenu.js"`. → verify: `npm test` typecheck clean, no unused imports.

## 3. Mobile reachability check

- [ ] 3.1 Confirm `StatusBar` renders on the mobile composer path. If it does, the relocation covers mobile automatically. → verify: load dashboard at mobile width, confirm `⚙ View` visible in status bar.
- [ ] 3.2 If a separate mobile composer bypasses `StatusBar`, surface `⚙ View` via the existing mobile action menu instead so it is not dropped on mobile.

## 4. Tests

- [ ] 4.1 Update/remove any `ChatView` test asserting the standalone display-prefs toolbar row. → verify: stale assertion gone.
- [ ] 4.2 Add a test asserting `ChatViewMenu` renders within the `status-bar` element (after refresh, before model selector) for a selected session. → verify: test passes.
- [ ] 4.3 Run `npm test 2>&1 | tee /tmp/pi-test.log` and `grep -nE 'FAIL|Error|✗' /tmp/pi-test.log`. → verify: no failures.

## 5. Build & verify

- [ ] 5.1 `npm run build` (client change) then `curl -X POST http://localhost:8000/api/restart`. → verify: `/api/health` returns mode; View menu visible in the status bar; no toolbar row at top of chat.
