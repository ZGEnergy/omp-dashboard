## 1. Server identity keypair

- [ ] 1.1 Add `identity.ts`: ensure/load persistent Ed25519 keypair at `~/.pi/dashboard/identity.key` (0600); export fingerprint. Unit test generate + reuse-across-restart.
- [ ] 1.2 Add nonce challenge-response: sign client nonce with private key; route/wire format per design open sub-decision. Unit test valid-sign + impostor-detect.

## 2. Pairing (QR + copy-string)

- [ ] 2.1 Add `pairing.ts`: mint short-lived (~60s) one-time codes with rate limiting; redemption exchanges code → bearer token; version `v` in payload.
- [ ] 2.2 Compute `urls[]` = currently wss-reachable endpoints (active tunnel, configured TLS LAN); omit plain-http. Handle no-reachable-endpoint case.
- [ ] 2.3 Server `/pair/*` routes (create payload, redeem code, challenge) — additive, backward-compatible, versioned.
- [ ] 2.4 **(F3/D12)** Redemption creates a PENDING device; consume the code on APPROVAL not redemption (no lockout DoS); approve via a server-generated numeric compare-code shown on BOTH dashboard + device (never a client label); approval requires an authenticated browser session, never loopback/tunnel; rate-limit + lockout.
- [ ] 2.5 **(F5/D14)** Emit only publicly-trusted wss endpoints in `urls[]`; never advertise self-signed LAN TLS as reachable from the neutral shell.

## 3. Bearer device auth

- [ ] 3.1 Add paired-devices registry (`~/.pi/dashboard/paired-devices.json`, 0600): label, created-at, last-seen; add/list/revoke.
- [ ] 3.2 Add bearer branch to auth/network guard feeding `isAuthenticated`: `Authorization: Bearer` (REST) + `Sec-WebSocket-Protocol` (WS). Do not touch loopback/trusted-network/cookie paths.
- [ ] 3.3 Regression tests: loopback-only and cookie-only auth unchanged; invalid/revoked bearer → 401.
- [ ] 3.4 **(F1/D10)** Replace network-loopback auth-exemption with an IPC allowlist (dedicated Unix domain socket or explicit local token) at ALL three call sites (guard, `onRequest`, WS upgrade `server.ts:1630`). Regression test: tunnel/`ssh -R`/marker-less proxy as `127.0.0.1` is NOT trusted; local IPC still works.
- [ ] 3.5 **(F4/F6/D11)** WS auth via short-lived single-use ticket from an authenticated REST endpoint; refuse upgrade unless ticket validates (no TOCTOU); `Origin` check as defense-in-depth only (absent-Origin not trusted). Durable bearer never in WS URL/header/logs.
- [ ] 3.6 **(cycle3/D10 Critical)** BEFORE removing loopback trust: migrate same-host callers off bare TCP-loopback — pi bridge (`bridge.ts:662` `ws://localhost:${piPort}`), terminal, editor, model-proxy — onto the Unix-socket/local-token allowlist. Perms: socket `0600`, token dir `0700`. Gate: local integrations still work after D10.
- [ ] 3.7 **(cycle3/D11)** WS ticket = high-entropy, in-memory, deleted on first upgrade; client refetches per reconnect; ticket bound to WS route scope, mismatched route refused.
- [ ] 3.8 **(F2/D13)** Decide + implement token model: opaque-bearer + SRI/pinned deploy + short TTL, OR non-extractable WebCrypto client key (private key never leaves device). Resolve in specs before build.

## 4. CORS default

- [ ] 4.1 Add `https://pi-dashboard.dev` as built-in CORS default in `server.ts` origin callback (beside `*.share.zrok.io`). Test allowed-without-config.

## 5. Neutral shell client + keyring

- [ ] 5.1 New static build target for the neutral shell (hash/404 routing, CSP via meta, no server dependency).
- [ ] 5.2 IndexedDB keyring store: `{ urls[], pinnedPubkey, bearerToken, label }`; add/list/remove; survives reload.
- [ ] 5.3 Pairing UI: QR scan + copy-string paste; parse payload; complete pairing; store entry.
- [ ] 5.4 On connect: nonce → verify signature vs pinnedPubkey; race `urls[]` per network; refuse pin-mismatch with warning. Reuse `ServerSelector`/`server-switch`.

## 6. Settings — device management

- [ ] 6.1 Settings section: list paired devices (label, last-seen); revoke per device (deletes registry row).

## 7. Deploy + docs

- [ ] 7.1 GitHub Pages publish pipeline for `pi-dashboard.dev` (neutral shell artifact).
- [ ] 7.2 Docs: architecture entry (Topology 3, secure-context constraint, Model-1 pairing, bearer keyring, versioned protocol); per-file rows in directory AGENTS.md trees.

## 8. Gates

- [ ] 8.1 `security-hardening` pass: secrets at rest (0600), token entropy, pairing-code TTL/rate-limit, CORS surface, revocation.
- [ ] 8.2 `doubt-driven-review` on the versioned pairing protocol + cross-origin auth before they stand.
- [ ] 8.3 `npm run quality:changed` + `code-review` gate green before commit.
