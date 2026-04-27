## 1. Pure helper + tests (TDD)

- [x] 1.1 Add `packages/client/src/lib/parse-host-input.ts` exporting `parseHostInput(input: string, defaultPort = 8000): { host: string; port: number } | null`.
- [x] 1.2 Add `packages/client/src/__tests__/parse-host-input.test.ts` covering: full URL with port, full URL with path, URL with no port (uses default), `host:port`, bare hostname, bracketed IPv6 with/without port, whitespace trimming, empty input, bare IPv6 ambiguity, invalid port, malformed URL.

## 2. Network Discovery section UX

- [x] 2.1 In `packages/client/src/components/NetworkDiscoverySection.tsx`, replace the single-line empty state with a diagnostic block listing the common mDNS failure causes (Wi-Fi AP isolation, mesh routers, VLAN split, VPN, firewall) plus an inline manual-add form.
- [x] 2.2 The manual-add form SHALL have a single free-form host input + optional label + Add button; Enter SHALL trigger Add.
- [x] 2.3 The Add handler SHALL call `parseHostInput(...)`; on parse failure show an inline validation error; on duplicate (already known) show an inline message naming the host:port; otherwise call `addKnownServer(host, port, label)` and clear the form.
- [x] 2.4 Surface scan errors: if `discoverServers()` throws, render `Scan failed: <message>` in red beneath the scan button (instead of silently swallowing).

## 3. Verification

- [x] 3.1 Run the client test suite: `parse-host-input.test.ts` (12) and `known-servers-sections.test.ts` (existing 6) all pass.
- [x] 3.2 Type-check the new files clean (`tsc --noEmit`).
- [x] 3.3 `npm run build` produces a clean client bundle.
- [x] 3.4 Manual smoke: open Settings → Network Discovery → Scan; with no peers, the diagnostic block + manual-add field are visible.
