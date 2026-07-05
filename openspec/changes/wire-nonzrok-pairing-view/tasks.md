# Tasks — wire-nonzrok-pairing-view

> Phasing (design D2): Phase 1 = the critical-path fix (generation view + approve UI) that makes pairing completable at all. Phase 2 = the non-zrok endpoint convenience (add an `https`/`wss` URL from the UI). Phase 2 does not block Phase 1.

## 1. Phase 1 — Client: pairing API + view (critical path)
- [ ] 1.1 Add `packages/client/src/lib/pairing-api.ts` — `getPairPayload()` (`GET /api/pair/payload`), `approvePairing(code, confirmCode, label?)` (`POST /api/pair/approve`) (mirror `paired-devices-api.ts`).
- [ ] 1.2 Add `packages/client/src/components/PairingView.tsx`:
  - [ ] 1.2a Fetch `GET /api/pair/payload`; render QR (via `qrcode`, same idiom as `QrCodeDialog.tsx`) + copyable base64url string.
  - [ ] 1.2b Show fingerprint `id`, one-time code TTL countdown, and `urls[]` list.
  - [ ] 1.2c Empty state (`no_reachable_endpoint`) per design D5/D6: state the secure-context requirement (browser + plain-http LAN cannot pair); offer secure-road options — Start tunnel (`/tunnel-setup`), Add HTTPS URL (Phase 2, with short help linking Caddy+LE-DNS-01 / `tailscale cert` / mkcert), and the `http://localhost` same-machine note. Do NOT imply plain LAN works in a browser.
  - [ ] 1.2d Approval step: pending-device confirm-code input → `POST /api/pair/approve`; on success device joins paired list. **This is the blocker that makes pairing completable — no separate server work needed; the endpoint already exists.**
- [ ] 1.3 Mount in `SettingsPanel.tsx` Security section (near `PairedDevicesSection`, line ~1125) as "Pair a device".

## 2. Phase 2 — Non-zrok endpoint entry via existing `PUT /api/config` (no new route)
- [ ] 2.1 Reuse the existing config-write path: `PUT /api/config` with `{ pairing: { publicBaseUrls: [...] } }` (handled by `writeConfigPartial`, generic top-level merge — no whitelist, already persists this field today). Do NOT add a bespoke pairing route. **Caveat:** the merge is shallow at `pairing`, so send the FULL `pairing` object (read current via `GET /api/config`, append, PUT) to avoid clobbering sibling fields.
- [ ] 2.2 Add "Add HTTPS URL" control in `PairingView` (or the existing Settings config surface): read current `pairing.publicBaseUrls`, append the entered URL, PUT via the existing config API; on success re-fetch payload so the new endpoint appears in the QR — **no hand JSON edit**.
- [ ] 2.3 Client-side validation for UX feedback only: reject non-`https`/`wss` before PUT with an inline message. The security gate is unchanged and server-side: `reachableUrls()` already drops non-`https`/`wss` at read-time (D4/D14), so a bad entry can never be advertised regardless of client validation.
- [ ] 2.4 (Optional, defense-in-depth) add `https`/`wss` validation to the config validator in `config.ts` for `pairing.publicBaseUrls`, so a hand-edited or API-written plain-http entry is stripped on load. Only if `security-hardening` (task 5.1) deems the read-time filter insufficient.

## 3. Tests
- [ ] 3.1 Client test: empty state renders when payload is `no_reachable_endpoint`; QR + copy-string render when payload present.
- [ ] 3.2 Client test: approve with matching confirm code moves device to paired list; wrong code shows error (Phase 1).
- [ ] 3.3 Client test (Phase 2): adding an https URL PUTs the full `pairing` object and re-fetches payload; a plain-http entry is rejected client-side and never sent.

## 4. Docs (Rule 6 — delegate to subagent, caveman style)
- [ ] 4.1 `docs/architecture.md` — pairing-view operator flow; non-zrok endpoint added via existing `PUT /api/config` (no new route); D4/D14 read-time filter is the gate.
- [ ] 4.2 Per-file rows: `packages/client/src/components/AGENTS.md` (`PairingView.tsx`), `packages/client/src/lib/AGENTS.md` (`pairing-api.ts`). (No `pairing-routes.ts` change — no new route.)
- [ ] 4.3 `docs/faq.md` FAQ entry "Pairing ≠ LAN access; how to get a secure road for LAN pairing" (Rule 6 — delegate to subagent, caveman style): pairing is not the plain-LAN path (Network Guard / bindHost + trusted networks is); QR pairing needs a secure context because the client identity-verify uses `crypto.subtle` (undefined on plain-http non-localhost); browser + plain-http LAN cannot pair; get a secure road via zrok tunnel, publicly-trusted TLS (Caddy + Let's Encrypt DNS-01, `tailscale cert`, or mkcert local CA), noting HTTP-01/TLS-ALPN-01 fail on a no-public-inbound box; a paired bearer token replaces trusted networks. Cross-link the LAN-expose FAQ entry.

## 5. Discipline + gates
- [ ] 5.1 `security-hardening` pass on the Phase-2 config-write path: confirm `PUT /api/config` is auth-gated (it is — same gate as bindHost/bypassHosts) and that the read-time D4/D14 filter in `reachableUrls()` is a sufficient gate against advertising plain-http; decide whether task 2.4 (validator hardening) is required.
- [ ] 5.2 `doubt-driven-review` on Phase 2 before it stands: a UI-written `publicBaseUrls` entry is advertised to pairing devices — verify it cannot be set without an authenticated operator session, and that pairing devices still pin the fingerprint via `/api/pair/challenge` so a wrong URL is refused device-side.
- [ ] 5.3 Quality gate: `npm run quality:changed` clean; `code-review` advisory gate exit 0; tests green.

## 6. Open question (resolve before Phase 1 build)
- [ ] 6.1 Confirm the missing dashboard pairing view is an oversight, NOT a deliberate shell-first deferral. The archived `add-server-keypair-pairing` built the device-side shell (`packages/shell`) + mocked `mockups/1-dashboard-pairing.html` but never wired it into `packages/client`. If the maintainer intends the neutral shell to own ALL pairing UI (including server-side generation), this change is redundant — verify intent before building.
