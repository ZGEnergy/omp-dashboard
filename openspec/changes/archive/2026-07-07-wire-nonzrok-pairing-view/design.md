# Design — wire-nonzrok-pairing-view

## Context

`add-server-keypair-pairing` (archived `2026-07-04`) delivered the pairing backend, the device-side shell, and the paired-devices list/revoke panel — but not the operator-side web view. Two shipped-but-uncalled endpoints (`/api/pair/payload`, `/api/pair/approve`) mean the spec's "pairing view" scenarios have no implementation — an operator cannot complete a pairing today. This change wires the operator surface.

> **Split note:** the config-free non-zrok endpoint entry (`pairing.publicBaseUrls` UI, no writer today) was an earlier Phase 2 of this change. It shares `add-tunnel-providers`' `getReachableUrls()` / `urls[]` source and "Accessible at" surface, so it was **migrated there** to avoid two changes editing the same function. This change is Phase 1 only.

## Goals

- Wire the operator-side pairing view (QR + copy-string + fingerprint + TTL + endpoints) against the existing `/api/pair/payload`.
- Wire the D12 typed-compare approval against the existing `/api/pair/approve`.

## Non-Goals

- No change to the token model (`bearer-device-auth`), identity keypair, or the versioned handshake.
- No auto-detection of TLS LAN certs; the operator supplies the URL. D14 stands: only publicly-trusted `https`/`wss`, never self-signed or plain-http.
- No native TLS termination, cert provisioning, ACME/Let's Encrypt automation, or reverse-proxy management in the dashboard. The empty state (D6) teaches these; the operator runs them out-of-band (Caddy/Tailscale/mkcert).
- No change to zrok tunnel behaviour; tunnel URL remains an auto-source in `getReachableUrls()`.

## Key Decisions

### D1 — Client-only change; every server endpoint already exists
`/api/pair/payload` and `/api/pair/approve` already exist and are correct; this change only supplies their web callers. **No new server route.**

### D4 — QR idiom reused
`PairingView` renders the QR with the existing `qrcode` dependency via the same `QRCode.toCanvas` pattern as `QrCodeDialog.tsx` (which swallows the jsdom canvas failure for tests). No new dependency.

### D5 — Secure-context wall is the real LAN blocker, not the D14 filter
D14 (advertise only `https`/`wss`) is the honest surfacing of a browser platform rule, not a cosmetic policy. The pairing security model is identity pinning: on every connect the client verifies an Ed25519 signature via `crypto.subtle.importKey` + `crypto.subtle.verify` (`packages/shell/src/lib/protocol.ts:127-146`). `crypto.subtle` exists ONLY in a secure context — `https`, `wss`, or `http://localhost`. On a plain-http LAN origin (`http://192.168.x.x:8000`) `window.crypto.subtle` is `undefined`, so a browser cannot run the pinned-identity check and pairing cannot complete. Consequences the empty state MUST reflect honestly:
- Browser + plain-http LAN → impossible. Not fixable in-project.
- Browser + TLS'd LAN (`https://host`) → works fully; the bearer token replaces trusted networks (no `trustedNetworks`/OAuth needed).
- Electron/native shell + plain-http LAN → technically possible (`crypto.subtle` available off secure context) but blocked by the D14 filter; would require a deliberate new decision to allow LAN http for a native-only transport. Out of scope here.

### D6 — Empty-state teaches the secure-context requirement + concrete TLS options
Because LAN pairing needs a secure context, the `no_reachable_endpoint` empty state (mockup 2) MUST NOT imply plain LAN works in a browser. It SHALL present three concrete ways to get a secure road, without editing JSON:
1. **zrok tunnel** — existing `/tunnel-setup` path (`wss://…zrok.io`).
2. **Publicly-trusted TLS on the LAN box** — the dashboard has no native TLS (plain http/ws only, no cert config), so front it with a TLS-terminating reverse proxy and add the resulting `https://` URL via the Add-HTTPS-URL control (delivered by `add-tunnel-providers`, persisted through the existing `PUT /api/config`). Recommended concrete routes:
   - **Caddy + Let's Encrypt DNS-01** — LE issues for a domain (not IPs) and DNS-01 needs no public inbound, so it works for a LAN-only host. `reverse_proxy localhost:8000`; `tls { dns <provider> <token> }`; make the name resolve to the LAN IP on the client (public A record / split-horizon DNS / `/etc/hosts`). Auto-renews.
   - **`tailscale cert` / `tailscale serve`** — provisions LE certs for the `*.ts.net` MagicDNS name via DNS-01 with zero DNS config; lowest-friction LE path, no owned domain.
   - **mkcert local CA** — no domain/DNS needed and works fully offline, but the CA must be installed on each client device.
   HTTP-01 / TLS-ALPN-01 do NOT work on a box with no public inbound — DNS-01 only.
3. **`http://localhost` escape hatch** — same machine only; not a remote/LAN path.

The view is a teaching surface, not an automation surface: it links/explains these options and consumes the resulting `https://` URL. It does NOT provision certs, run ACME, or manage the reverse proxy.

> The Add-HTTPS-URL control that persists the operator's `https://` URL is delivered by `add-tunnel-providers` (migrated Phase 2). This view links to it and re-fetches the payload once an endpoint exists.

## Open Question

- **Oversight vs deliberate shell-first deferral (resolve before Phase 1 build).** The archived `add-server-keypair-pairing` built the device-side shell (`packages/shell`) and mocked `mockups/1-dashboard-pairing.html` but never wired the server-side view into `packages/client`. This change assumes oversight. If the maintainer intends the neutral shell to own ALL pairing UI (including server-side generation), the change is redundant. Confirm intent first (tasks 6.1).

## Risks

- **Stale TTL in UI** — the ~60s code expires while the view is open. Mitigation: countdown + a "regenerate" action re-calling `/api/pair/payload`.
