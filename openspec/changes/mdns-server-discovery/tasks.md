## 1. Server Identity Detection

- [ ] 1.1 Create `src/shared/server-identity.ts` with `isDashboardRunning(port)` health-check function returning `{ running, pid?, portConflict? }`
- [ ] 1.2 Write tests for health-check identity verification (dashboard, other service, nothing, timeout)
- [ ] 1.3 Replace `isPortOpen()` with `isDashboardRunning()` in `src/server/server-pid.ts` (`isServerRunning` function)
- [ ] 1.4 Replace `isPortOpen()` with `isDashboardRunning()` in `src/server/cli.ts` (`cmdStart`, `cmdStatus`)
- [ ] 1.5 Add port conflict error message to `cmdStart` when port is occupied by another service
- [ ] 1.6 Update `src/extension/server-auto-start.ts` to use `isDashboardRunning()` instead of `isPortOpen()`
- [ ] 1.7 Write tests for updated CLI and bridge detection logic

## 2. Shared mDNS Discovery Module

- [ ] 2.1 Add `bonjour-service` dependency to `package.json`
- [ ] 2.2 Create `src/shared/mdns-discovery.ts` with `advertiseDashboard(port, piPort)`, `stopAdvertising()`, `discoverDashboard(timeout)`, and `createBrowser()` (continuous browsing with `server-up`/`server-down` events)
- [ ] 2.3 Implement localhost detection logic — classify discovered services as local vs remote based on hostname/IP matching
- [ ] 2.4 Implement fallback: when mDNS times out, probe `localhost:<config.port>` via `isDashboardRunning()` from `server-identity.ts`
- [ ] 2.5 Write tests for mDNS advertise/discover, localhost preference, and fallback chain

## 3. Server mDNS Integration

- [ ] 3.1 Add mDNS advertisement to `src/server/server.ts` — call `advertiseDashboard()` on startup, `stopAdvertising()` on shutdown
- [ ] 3.2 Add continuous mDNS browser to server — browse for peer `_pi-dashboard._tcp` services, maintain discovered servers list
- [ ] 3.3 Add `servers_discovered` and `servers_updated` messages to `src/shared/browser-protocol.ts`
- [ ] 3.4 Broadcast discovered peer servers to browsers via `servers_discovered` on subscribe and `servers_updated` on change
- [ ] 3.5 Write tests for server mDNS advertisement and peer discovery broadcasting

## 4. Bridge mDNS Discovery

- [ ] 4.1 Update `src/extension/server-auto-start.ts` to use mDNS browse → fallback to `isDashboardRunning()` → auto-start
- [ ] 4.2 Update `src/extension/bridge.ts` connection logic to use discovered server address instead of hardcoded config port
- [ ] 4.3 After auto-starting server, wait for mDNS advertisement before connecting (up to 10s, fallback to config probe)
- [ ] 4.4 Write tests for bridge mDNS discovery and fallback

## 5. Config Changes

- [ ] 5.1 Add `lastServer` field to `DashboardConfig` in `src/shared/config.ts` with default `undefined`
- [ ] 5.2 Update `pi-dashboard status` to use mDNS discovery first, falling back to PID + health check
- [ ] 5.3 Write tests for new config field and CLI status with mDNS

## 6. Server Selector UI

- [ ] 6.1 Create `src/client/components/ServerSelector.tsx` — dropdown in dashboard header showing discovered servers with hostname, port, Local/Remote badge, connection status
- [ ] 6.2 Add WebSocket message handler for `servers_discovered` and `servers_updated` in `src/client/hooks/useMessageHandler.ts`
- [ ] 6.3 Implement server switching: close current WebSocket, open new connection to selected server, re-subscribe
- [ ] 6.4 Persist last-used server in `localStorage` (`pi-dashboard-last-server`) and reconnect on load
- [ ] 6.5 Integrate `ServerSelector` into sidebar/header layout
- [ ] 6.6 Write tests for server selector state management and switching logic
