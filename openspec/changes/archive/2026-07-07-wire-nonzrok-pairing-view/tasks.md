# Tasks — wire-nonzrok-pairing-view

> Scope: Phase 1 only — the critical-path fix (generation view + typed-approve UI) that makes pairing completable at all. The former Phase 2 (config-free non-zrok `https`/`wss` endpoint entry via `pairing.publicBaseUrls`) is **migrated to `add-tunnel-providers`** — it shares that change's `getReachableUrls()` / `urls[]` source and "Accessible at" surface.

## 1. Client: pairing API + view (critical path)
- [x] 1.1 Add `packages/client/src/lib/pairing-api.ts` — `getPairPayload()` (`GET /api/pair/payload`), `approvePairing(code, confirmCode, label?)` (`POST /api/pair/approve`) (mirror `paired-devices-api.ts`).
- [x] 1.2 Add `packages/client/src/components/PairingView.tsx`:
  - [x] 1.2a Fetch `GET /api/pair/payload`; render QR (via `qrcode`, same idiom as `QrCodeDialog.tsx`) + copyable base64url string.
  - [x] 1.2b Show fingerprint `id`, one-time code TTL countdown, and `urls[]` list.
  - [x] 1.2c Empty state (`no_reachable_endpoint`) per design D5/D6: state the secure-context requirement (browser + plain-http LAN cannot pair); offer secure-road options — Start tunnel (`/tunnel-setup`) and the `http://localhost` same-machine note. Do NOT imply plain LAN works in a browser. (The **Add HTTPS URL** affordance ships with `add-tunnel-providers`; link to it when present.)
  - [x] 1.2d Approval step: pending-device confirm-code input → `POST /api/pair/approve`; on success device joins paired list. **This is the blocker that makes pairing completable — no separate server work needed; the endpoint already exists.**
- [x] 1.3 Mount in `SettingsPanel.tsx` Security section (near `PairedDevicesSection`, line ~1125) as "Pair a device".

## 2. Tests
- [x] 2.1 Client test: empty state renders when payload is `no_reachable_endpoint`; QR + copy-string render when payload present.
- [x] 2.2 Client test: approve with matching confirm code moves device to paired list; wrong code shows error.

## 3. Docs (Rule 6 — delegate to subagent, caveman style)
- [x] 3.1 `docs/architecture.md` — pairing-view operator flow (QR + copy-string + fingerprint + TTL + typed-approve); D4/D14 read-time filter in `reachableUrls()` is the gate that keeps `urls[]` secure.
- [x] 3.2 Per-file rows: `packages/client/src/components/AGENTS.md` (`PairingView.tsx`), `packages/client/src/lib/AGENTS.md` (`pairing-api.ts`). (No `pairing-routes.ts` change — no new route.)
- [x] 3.3 `docs/faq.md` FAQ entry "Pairing ≠ LAN access; how to get a secure road for LAN pairing" (Rule 6 — delegate to subagent, caveman style): pairing is not the plain-LAN path (Network Guard / bindHost + trusted networks is); QR pairing needs a secure context because the client identity-verify uses `crypto.subtle` (undefined on plain-http non-localhost); browser + plain-http LAN cannot pair; get a secure road via zrok tunnel, publicly-trusted TLS (Caddy + Let's Encrypt DNS-01, `tailscale cert`, or mkcert local CA), noting HTTP-01/TLS-ALPN-01 fail on a no-public-inbound box; a paired bearer token replaces trusted networks. Cross-link the LAN-expose FAQ entry.

## 4. Discipline + gates
- [x] 4.1 `doubt-driven-review` before build: resolve the open question (task 5.1) — a redundant view is wasted work.
- [x] 4.2 Quality gate: `npm run quality:changed` clean; `code-review` advisory gate exit 0; tests green.

## 5. Open question (resolve before build)
- [x] 5.1 Confirm the missing dashboard pairing view is an oversight, NOT a deliberate shell-first deferral. The archived `add-server-keypair-pairing` built the device-side shell (`packages/shell`) + mocked `mockups/1-dashboard-pairing.html` but never wired it into `packages/client`. If the maintainer intends the neutral shell to own ALL pairing UI (including server-side generation), this change is redundant — verify intent before building.
