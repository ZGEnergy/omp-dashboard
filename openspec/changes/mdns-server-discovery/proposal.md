## Why

Server discovery is currently hardcoded to a config-file port (`piPort: 9999`) with bare TCP probes that can't distinguish the dashboard from other services. This causes false positives (another service on the same port mistaken for the dashboard), prevents LAN discovery (bridge on one machine can't find server on another), and requires manual config coordination. mDNS-based zero-config discovery solves all three — the server announces itself, clients find it automatically, and identity is verified by service type rather than port number.

## What Changes

- Dashboard server advertises `_pi-dashboard._tcp` via mDNS on startup, unpublishes on shutdown
- Bridge extension discovers the server via mDNS browse instead of hardcoded port probe, with config-based fallback
- New shared discovery module (`src/shared/mdns-discovery.ts`) used by server, bridge, and CLI
- Continuous background browsing discovers peer servers on the LAN
- Server broadcasts discovered peers to browsers via new WebSocket messages
- New **server selector** dropdown in dashboard header showing all discovered servers (local + remote) with connection switching
- Localhost preferred by default — remote servers discovered passively, user must explicitly switch
- New dependency: `bonjour-service` (pure JS, ~67KB, no native deps)
- Fallback preserved: when mDNS is blocked (Windows firewall, CI, containers), falls back to config-based probe + `/api/health` identity verification

## Capabilities

### New Capabilities
- `mdns-discovery`: Server advertises `_pi-dashboard._tcp` via `bonjour-service` on startup with TXT record (version, pid, piPort). Bridge extensions and CLI browse for the service. Continuous browsing mode emits server-up/server-down events. Localhost preferred, fallback to config probe + health check.
- `server-selector`: Dashboard header UI component showing all discovered servers (local + LAN). Displays hostname, port, Local/Remote badge, connection status. Switching re-establishes WebSocket to selected server. Persists last-used server in `localStorage` and config `lastServer` field.

### Modified Capabilities
- `bridge-extension`: Discovery logic changes from `isPortOpen(config.piPort)` to mDNS browse → fallback config probe. Connection target resolved dynamically. After auto-starting server, waits for mDNS advertisement before connecting.
- `shared-config`: New `lastServer` field to persist selected server address.
- `server-process-management`: Replace bare TCP port probe (`isPortOpen`) with identity-verified health check (`isDashboardRunning`) across bridge auto-start, CLI status/start. `pi-dashboard status` uses mDNS discovery first, falling back to PID file + health check. Detects port occupied by another service with clear error.

## Impact

- **New shared module**: `src/shared/mdns-discovery.ts` — advertise/browse/stop helpers
- **New dependency**: `bonjour-service` (~67KB, pure JS, 2 transitive deps: `multicast-dns`, `fast-deep-equal`)
- **New browser-protocol messages**: `servers_discovered`, `servers_updated`
- **New UI element**: server selector dropdown in dashboard header (web + Electron)
- **Bridge connection change**: mDNS-first discovery with config fallback (backwards compatible — old servers without mDNS still found via fallback)
- **Server change**: mDNS advertisement on startup/shutdown (backwards compatible — old bridges still use config probe)
- **No breaking changes**: All existing config-based flows preserved as fallback
- **Foundation for `electron-desktop-bundle`**: The `isDashboardRunning()` health check and mDNS discovery created here are used by the Electron change for server detection at startup
