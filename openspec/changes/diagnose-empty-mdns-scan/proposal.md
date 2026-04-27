## Why

When users on the same LAN cannot see each other's dashboards via the **Network Discovery** scan, the UI silently shows `"No servers found on the network."` and offers no recourse. mDNS discovery fails frequently in real-world deployments (Wi-Fi AP/client isolation, mesh routers that drop multicast between nodes, different VLANs, active VPNs, macOS firewall) and the empty result misleads users into thinking the dashboard cannot reach the other machine — when in fact the only thing missing is the multicast handshake.

The `KnownServersSection` already supports manual entry, but it's a separate section users must discover; and when they do find it the input is split across host / port / label fields with no support for pasting a URL or `host:port` string copied from a browser.

## What Changes

- The Network Discovery section's empty state SHALL change from a single muted line into a **diagnostic block** that lists the common reasons mDNS fails (AP/client isolation, mesh/extender multicast drop, VLAN/subnet split, VPN, firewall) and offers an inline manual-add form.
- The inline manual-add form SHALL accept a single free-form **host input** (URL like `http://192.168.16.202:8000`, `host:port`, bracketed IPv6 `[::1]:8000`, or bare hostname with default port 8000) plus an optional label. Pressing Enter or clicking Add SHALL parse the input, validate it, check it is not already a known server, and call `POST /api/known-servers`.
- Scan errors SHALL be surfaced to the user (instead of silently swallowed), so a network failure during discovery is visible.
- A new pure helper `parseHostInput(input, defaultPort)` SHALL live in `packages/client/src/lib/parse-host-input.ts` and have its own unit test suite.

## Capabilities

### Modified Capabilities

- `known-servers`: extend the **Settings panel network discovery section** requirement with diagnostic empty-state and inline manual-add behavior; add a new requirement for `parseHostInput` parsing semantics; add a new requirement for surfacing scan errors.

## Impact

- **Code (additions)**:
  - `packages/client/src/lib/parse-host-input.ts` (new pure helper)
  - `packages/client/src/__tests__/parse-host-input.test.ts` (12 cases)
- **Code (modifications)**:
  - `packages/client/src/components/NetworkDiscoverySection.tsx` (diagnostic block, inline manual-add, scan error surfacing)
- **No protocol changes**: the manual-add form reuses the existing `POST /api/known-servers` endpoint; the scan still uses `POST /api/discover-servers`.
- **No server changes**: this is a client-only enhancement.
- **No breaking changes**: the existing Settings panel discovery behavior (scan, list discovered, add discovered) is unchanged on the success path.
