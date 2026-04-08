## Context

The dashboard server listens on ports configured in `~/.pi/dashboard/config.json` (default: 8000 HTTP, 9999 pi gateway). Bridge extensions find the server via `isPortOpen(config.piPort)` — a bare TCP probe on localhost. This has three problems: it can't distinguish the dashboard from other services, it doesn't work across machines, and it requires config-file coordination when ports change.

## Goals / Non-Goals

**Goals:**
- Zero-config server discovery via mDNS (no port hardcoding needed)
- LAN discovery — bridge on machine A finds server on machine B
- Server selector UI for switching between discovered servers
- Backwards compatible — old bridges/servers continue working via config fallback

**Non-Goals:**
- WAN discovery (use zrok tunnel for remote access)
- Auto-connecting to remote servers without user consent
- Replacing the config file (it still controls which port the server binds to)

## Decisions

### D1: bonjour-service as mDNS library

**Decision:** Use `bonjour-service` for both advertising and browsing.

**Why:** Pure JavaScript (no native deps), ~67KB total, uses `multicast-dns` for UDP multicast on port 5353. Works on macOS (Bonjour built-in), Linux (no Avahi needed), and Windows (pure JS, bypasses system mDNS). Tested and confirmed working — discovery takes <1 second on localhost.

**Service type:** `_pi-dashboard._tcp`

**TXT record:** `{ version: "<pkg-version>", pid: "<process.pid>", piPort: "<extension-ws-port>" }`

The main service port is the HTTP port. The piPort is in TXT because bridges need it and mDNS services only advertise one port natively.

**Alternative considered:** `@homebridge/ciao` (RFC 6762/6763 compliant) — more correct but heavier (~595KB) and overkill for local discovery.

### D2: Localhost-first with passive LAN awareness

**Decision:** Default behavior is always localhost. Remote servers are discovered in the background and shown in the UI, but the user must explicitly switch.

**Why:** Automatic remote connection would be surprising and a security concern. A developer's local server is the right default 99% of the time. LAN discovery is a power feature for teams.

**Discovery flow:**
1. Browse `_pi-dashboard._tcp` with 2s timeout
2. Filter results: separate localhost vs remote
3. If localhost found → connect
4. If no localhost → fall back to config probe + health check → optionally launch server
5. Continue background browsing → populate server selector with remote peers

### D3: Server relays peer discovery to browsers

**Decision:** The server runs mDNS browsing and forwards discovered peers to browsers via WebSocket messages (`servers_discovered`, `servers_updated`). The browser does NOT run mDNS directly.

**Why:** Browsers can't do UDP multicast. Even in Electron, mDNS should run in the main/server process, not the renderer. The server is the natural aggregation point — it already has the WebSocket channel to browsers.

### D4: Server selector in dashboard header

**Decision:** A compact dropdown in the existing sidebar/header showing discovered servers. Each entry shows hostname, port, and a badge (Local/Remote + Connected/Available). Switching closes the current WebSocket and opens a new one to the selected server.

**Persistence:** Last-used server saved in `localStorage` (`pi-dashboard-last-server`) for the browser, and `config.json` `lastServer` for bridge/Electron.

**Why:** Non-modal, always visible, follows the pattern of database tools (TablePlus, pgAdmin). Doesn't interfere with the existing layout.

### D5: Fallback chain when mDNS fails

**Decision:** mDNS is the primary mechanism, but the full fallback chain is:

1. **mDNS browse** (2s timeout) → service type match guarantees identity
2. **Config probe** → `GET http://localhost:<config.port>/api/health` → verify `{ ok: true }`
3. **Port conflict** → HTTP response but not dashboard format → clear error

This ensures the app works in environments where mDNS is blocked (corporate firewalls, Docker containers, CI).

## Risks / Trade-offs

### [Risk] mDNS blocked by firewall → Mitigation: fallback chain
Windows Defender and corporate firewalls may block UDP multicast on port 5353. The config-based fallback ensures discovery still works on localhost. A one-time warning could be shown if mDNS never finds anything.

### [Risk] mDNS discovery latency (~0.5-2s) → Mitigation: acceptable
Bridge startup already waits up to 2s for server launch. mDNS discovery fits within this window. For the UI server selector, background browsing means the list populates asynchronously.

### [Risk] Stale mDNS records after server crash → Mitigation: health check verification
If a server crashes without unpublishing, its mDNS record may linger. The client verifies connectivity before showing a server as "Available". TTL-based expiry (default ~75min for mDNS) handles the rest.

### [Risk] Multiple servers on same machine → Mitigation: PID in TXT record
Each server includes its PID in the TXT record. The UI can distinguish them. In practice, the existing single-instance PID check prevents duplicate servers on the same machine.
