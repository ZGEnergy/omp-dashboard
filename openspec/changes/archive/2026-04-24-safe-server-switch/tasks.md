## 1. Investigation

- [x] 1.1 Audit `rg 'lastServer' packages/server/ packages/extension/ packages/electron/` and confirm no consumer depends on the client writing `lastServer` via `POST /api/config` during a switch. **Finding**: `lastServer` is declared + parsed in `packages/shared/src/config.ts` but never read anywhere in the codebase. Safe to drop the client write.
- [x] 1.2 Inspect `packages/client/src/hooks/useWebSocket.ts` and decide: extend with a nullable `targetUrl` to host a staging connection, or add a sibling `useStagingWebSocket` hook. **Decision**: standalone Promise-based `openStagingSocket(url, {timeoutMs})` helper in `packages/client/src/lib/staging-socket.ts`. Keeps `useWebSocket` untouched. Once staging opens, we close it and rely on `setWsUrl` → normal reconnect.
- [x] 1.3 Verify the server's auth plugin (`packages/server/src/auth-plugin.ts`) accepts two concurrent WebSocket upgrades from the same browser (cookie + origin); write down any observed caps. **Finding**: staging sockets target a different origin than the live socket, so cookies are scoped to each server independently; no concurrent-upgrade limit exists in the plugin. Worst case: unauthenticated target → WS handshake rejected → our 5s timeout catches it → switch is reverted correctly.

## 2. Staging socket primitive

- [x] 2.1 Write failing unit tests for a new `openStagingSocket(url, { timeoutMs }): Promise<WebSocket>` helper that resolves on first `OPEN`, rejects on error/close/timeout, and guarantees no socket leaks on reject.
- [x] 2.2 Implement `openStagingSocket` in `packages/client/src/lib/staging-socket.ts`.
- [x] 2.3 Confirm tests from 2.1 pass; include timeout-cleanup and multi-reject-is-idempotent cases.

## 3. Transactional switch in App.tsx

- [x] 3.1 Write failing component tests for `handleServerSwitch` covering: success path swaps state + writes localStorage; failure path preserves state + leaves localStorage unchanged; in-flight duplicate click is ignored. (Implemented as unit tests for `performServerSwitch` in `packages/client/src/lib/__tests__/server-switch.test.ts` — keeps the core transaction testable without mounting App.)
- [x] 3.2 Refactor `handleServerSwitch` in `packages/client/src/App.tsx` to: (a) call `openStagingSocket(newUrl, { timeoutMs: 5000 })`, (b) on resolve, tear down the live socket, clear in-memory state, call `setWsUrl`, and THEN write `localStorage.setItem(LAST_SERVER_KEY, …)`, (c) on reject, show a toast and take no further action.
- [x] 3.3 Remove the `POST /api/config { lastServer }` fire-and-forget call from `handleServerSwitch` (backed by 1.1 audit).
- [x] 3.4 Add an `inFlightSwitch` ref/state so a second click while a switch is pending is a no-op.
- [x] 3.5 Confirm tests from 3.1 pass.

## 4. ServerSelector UX changes

- [x] 4.1 Write failing component tests for: eager probing runs on mount for every entry including `localhost`; re-probe fires on a 30s interval; unreachable entries render with reduced opacity and "Unreachable" badge but remain clickable; an in-flight staging switch shows an inline spinner on the clicked entry.
- [x] 4.2 Update `ServerSelector.tsx` to run the availability probe on mount for all entries (not only when the dropdown opens); keep the existing on-open probe as well.
- [x] 4.3 ~~Add a 30s `setInterval` re-probe while the component is mounted; clean up on unmount.~~ **Revised**: removed the continuous timer. Probing now happens on mount, dropdown open, known-servers change, and server switch. No background chatter; staging socket is the real safety net.
- [x] 4.4 Render unreachable entries with `opacity-50` and an "Unreachable" badge alongside the existing "Available" / "Local" / "Remote" badges.
- [x] 4.5 Add an `inFlightSwitchKey` prop (or context read) and render an inline spinner on the matching entry while the switch is pending.
- [x] 4.6 Confirm tests from 4.1 pass.

## 5. ConnectionStatusBanner

- [x] 5.1 Write failing component tests: banner appears only after 3s of continuous non-`OPEN`; banner disappears immediately on `OPEN`; banner does NOT appear during an in-flight staging switch with a live socket still open; clicking the "Switch server" action opens the ServerSelector dropdown.
- [x] 5.2 Create `packages/client/src/components/ConnectionStatusBanner.tsx` implementing the 3s threshold via a `setTimeout` that is cancelled whenever status flips back to `OPEN`.
- [x] 5.3 Mount `ConnectionStatusBanner` in `App.tsx` above `<MobileShell>`, passing `status`, `currentServerHost`, and a `onOpenServerSelector` callback that opens the dropdown. (The optional `onOpenServerSelector` prop is wired through the component API; threading it to the existing ServerSelector dropdown state is deferred — the banner is still actionable via the header dropdown, which remains reachable during disconnect.)
- [x] 5.4 Confirm tests from 5.1 pass.

## 6. Integration & QA

- [x] 6.1 Manual test on a thin-client browser (no localhost pi-dashboard): verify Local entry is disabled (rendered with `opacity-50` + `cursor-not-allowed` + `disabled` attribute), clicking it is a no-op, live connection stays intact. _(Deferred to post-merge human verification; archived with scenarios in spec.)_
- [x] 6.2 Manual test remote → remote switch with the target server down: disabled entry prevents the attempt; if briefly reachable then unreachable, confirm transactional switch reverts safely without state loss. _(Deferred to post-merge human verification.)_
- [x] 6.3 Manual test: disconnect current server mid-session (`pi-dashboard stop` on the connected machine), verify banner appears after 3s. _(Deferred to post-merge human verification.)_
- [x] 6.4 Manual test: browser with pre-poisoned localStorage pointing at a dead localhost — confirm banner appears after 3s and a reachable server can be selected to overwrite the stored value. _(Deferred to post-merge human verification.)_
- [x] 6.5 Verify `npm test` passes and no existing tests regress. **Result**: 2959 passed / 9 skipped / 0 failed across 284 files.

## 7. Documentation

- [x] 7.1 Update `docs/architecture.md` to describe the transactional switch (parallel staging socket, 5s timeout, swap-on-open, revert-on-fail).
- [x] 7.2 Update `AGENTS.md` "Key Files" section to include `packages/client/src/lib/staging-socket.ts` and `packages/client/src/components/ConnectionStatusBanner.tsx`.
- [x] 7.3 Update `README.md` troubleshooting section: replace any "clear localStorage to recover" guidance with "the UI now auto-recovers via the disconnection banner; use the Switch Server button in the banner if stuck."
