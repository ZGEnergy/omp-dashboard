## Why

The `add-server-keypair-pairing` change (archived `2026-07-04`) shipped the full pairing **backend** (`/api/pair/{payload,redeem,challenge,approve,poll}` in `packages/server/src/routes/pairing-routes.ts`) and the **device-side** shell (`packages/shell/src/components/PairView.tsx`, which calls `/api/pair/redeem` + `/api/pair/challenge`). It also shipped the paired-devices **list/revoke** panel (`packages/client/src/components/PairedDevicesSection.tsx`).

What it did **not** ship is the **operator-side pairing view** in the web dashboard. Verified against current code:

- `/api/pair/payload` (mints the `{v,id,code,urls[]}` QR payload) has **zero callers** anywhere in the repo — `grep -rn "pair/payload" packages/` returns only the route definition.
- `/api/pair/approve` (the D12 typed compare-code approval) has **zero web-client callers** — `grep -rn "pair/approve" packages/client` is empty. The endpoint requires an authenticated browser session, so with no web UI the pairing flow **cannot be completed** by an operator today.
- The proposal mocked both surfaces — `mockups/1-dashboard-pairing.html` (QR + copy-string + wss endpoints + paired list) and `mockups/2-pairing-empty.html` ("no secure road" empty state: start tunnel / enable TLS / localhost hatch) — but neither was wired into `packages/client`.

> **Scope note (split resolved):** an earlier draft of this change also owned a
> **Phase 2** — a config-free UI to add a non-zrok `https`/`wss` endpoint
> (`pairing.publicBaseUrls`, today JSON-only, no UI writer). That work feeds the
> **same** `getReachableUrls()` / `urls[]` source of truth and the same
> "start tunnel" empty-state action that `add-tunnel-providers` rewrites for its
> multi-provider **Gateway** endpoints surface. To avoid two changes editing the
> same function, **Phase 2 has been migrated to `add-tunnel-providers`** (its
> "Accessible at" endpoints section). This change is now **Phase 1 only**: the
> operator-side pairing view + typed-approve UI — the blocker that makes pairing
> completable at all, client-only, with no tunnel dependency.

Net effect: the shipped `qr-device-pairing` spec has scenarios ("**WHEN** a user opens the pairing view") with no implementation behind them. This change closes that gap.

**Open question (must resolve before build):** the archived change built the device-side shell (`packages/shell`) and mocked `mockups/1-dashboard-pairing.html` but never wired the server-side view into `packages/client`. This proposal assumes that is an oversight. If the maintainer intends the neutral shell to own ALL pairing UI, this change is redundant — confirm intent first (tasks 6.1).

## What Changes

- **NEW** `packages/client/src/components/PairingView.tsx` — operator-side pairing surface (implements mockup `1-dashboard-pairing.html`):
  - On open, calls `GET /api/pair/payload`; renders the returned payload BOTH as a QR (reusing the existing `qrcode` dep, same idiom as `QrCodeDialog.tsx`) AND as the copyable base64url string (camera-less fallback).
  - Shows the server fingerprint (`id`), the one-time code TTL countdown (~60s), and the list of `urls[]` (wss endpoints) so the operator can see whether a secure road exists.
  - Empty state (implements mockup `2-pairing-empty.html`): when `GET /api/pair/payload` returns `no_reachable_endpoint`, explains that a tunnel or a publicly-trusted TLS URL is required, with actions: **Start tunnel** (→ `/tunnel-setup`) and a note about the `http://localhost` escape hatch. The **Add HTTPS URL** affordance is delivered by `add-tunnel-providers` (migrated Phase 2); this view links to it when present.
  - Approval step: after a device redeems, surfaces the pending device + a field for the operator to **type the numeric confirm code** shown on the device, calling `POST /api/pair/approve` (D12 active typed compare-and-match). On success the device moves into the paired list.
- **MODIFY** `packages/client/src/components/SettingsPanel.tsx` — mount `PairingView` under the existing Security section (near `PairedDevicesSection`, `SettingsPanel.tsx:1125`), or expose it via a "Pair a device" button that opens the view.
- **NEW** `packages/client/src/lib/pairing-api.ts` — thin client for `pair/payload` and `pair/approve` (mirrors `paired-devices-api.ts`).
- **Migrated out:** the config-free non-zrok endpoint entry (`pairing.publicBaseUrls` UI via existing `PUT /api/config`) now lives in `add-tunnel-providers`. It reuses the same `getReachableUrls()` / `urls[]` path that change already rewrites for multi-provider endpoints.
- **DOCUMENTATION** — delegated per Rule 6 (caveman style): `docs/architecture.md` pairing-view section (operator flow, non-zrok endpoint via existing `PUT /api/config`, D4/D14 read-time filter); a `docs/faq.md` entry "Pairing ≠ LAN access; how to get a secure road for LAN pairing" (secure-context requirement via `crypto.subtle`; TLS options: zrok / Caddy+LE-DNS-01 / `tailscale cert` / mkcert; bearer replaces trusted networks); + per-file rows in the `packages/client/src/components` and `packages/client/src/lib` `AGENTS.md` trees.

## Impact

- Affected specs: `qr-device-pairing` (MODIFIED — adds operator-view + typed-approve requirements behind existing "pairing view" scenarios), no change to `bearer-device-auth` / `server-identity-keypair` token model.
- Affected code: `packages/client` only (new view + api + settings mount). **No server route added** — every pairing endpoint already exists.
- No protocol/version change: every pairing endpoint already exists; the `v` handshake is untouched.
- Security surface: the approve flow reuses the existing D12 typed-compare endpoint (`POST /api/pair/approve`) unchanged; it is already auth-gated. No new write path.

## Discipline Skills

- `doubt-driven-review` — resolve the open question (task 6.1) before build: confirm the missing dashboard pairing view is an oversight, not a deliberate shell-first deferral where `packages/shell` owns all pairing UI (which would make this change redundant).
