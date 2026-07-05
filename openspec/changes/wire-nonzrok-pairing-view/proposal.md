## Why

The `add-server-keypair-pairing` change (archived `2026-07-04`) shipped the full pairing **backend** (`/api/pair/{payload,redeem,challenge,approve,poll}` in `packages/server/src/routes/pairing-routes.ts`) and the **device-side** shell (`packages/shell/src/components/PairView.tsx`, which calls `/api/pair/redeem` + `/api/pair/challenge`). It also shipped the paired-devices **list/revoke** panel (`packages/client/src/components/PairedDevicesSection.tsx`).

What it did **not** ship is the **operator-side pairing view** in the web dashboard. Verified against current code:

- `/api/pair/payload` (mints the `{v,id,code,urls[]}` QR payload) has **zero callers** anywhere in the repo — `grep -rn "pair/payload" packages/` returns only the route definition.
- `/api/pair/approve` (the D12 typed compare-code approval) has **zero web-client callers** — `grep -rn "pair/approve" packages/client` is empty. The endpoint requires an authenticated browser session, so with no web UI the pairing flow **cannot be completed** by an operator today.
- The proposal mocked both surfaces — `mockups/1-dashboard-pairing.html` (QR + copy-string + wss endpoints + paired list) and `mockups/2-pairing-empty.html` ("no secure road" empty state: start tunnel / enable TLS / localhost hatch) — but neither was wired into `packages/client`.

Second, the **config-free non-zrok endpoint path** promised by the empty-state mockup is absent. `getReachableUrls()` (`packages/server/src/server.ts:247`) sources `urls[]` from exactly two places:

```js
const tunnelUrl = getTunnelUrl();                              // 1. zrok tunnel (auto)
if (tunnelUrl) urls.push(tunnelUrl);
urls.push(...(loadConfig().pairing?.publicBaseUrls ?? []));    // 2. JSON config only
```

`grep -rn "publicBaseUrls" packages/client packages/electron` returns nothing — **no UI writes it**. So the only config-free way to get a wss endpoint into the QR is the zrok tunnel. A non-zrok endpoint forces a hand-edit of `~/.pi/dashboard/config.json`, which contradicts the design's intent (mockup 2's "enable TLS" action) that a user can pair a device without editing JSON.

Net effect: the shipped `qr-device-pairing` spec has scenarios ("**WHEN** a user opens the pairing view") with no implementation behind them, and the non-zrok path is JSON-only. This change closes both gaps.

**Open question (must resolve before build):** the archived change built the device-side shell (`packages/shell`) and mocked `mockups/1-dashboard-pairing.html` but never wired the server-side view into `packages/client`. This proposal assumes that is an oversight. If the maintainer intends the neutral shell to own ALL pairing UI, this change is redundant — confirm intent first (tasks 6.1).

## What Changes

- **NEW** `packages/client/src/components/PairingView.tsx` — operator-side pairing surface (implements mockup `1-dashboard-pairing.html`):
  - On open, calls `GET /api/pair/payload`; renders the returned payload BOTH as a QR (reusing the existing `qrcode` dep, same idiom as `QrCodeDialog.tsx`) AND as the copyable base64url string (camera-less fallback).
  - Shows the server fingerprint (`id`), the one-time code TTL countdown (~60s), and the list of `urls[]` (wss endpoints) so the operator can see whether a secure road exists.
  - Empty state (implements mockup `2-pairing-empty.html`): when `GET /api/pair/payload` returns `no_reachable_endpoint`, explains that a tunnel or a publicly-trusted TLS URL is required, with actions: **Start tunnel** (→ `/tunnel-setup`), **Add HTTPS URL** (Phase 2, see below), and a note about the `http://localhost` escape hatch.
  - Approval step: after a device redeems, surfaces the pending device + a field for the operator to **type the numeric confirm code** shown on the device, calling `POST /api/pair/approve` (D12 active typed compare-and-match). On success the device moves into the paired list.
- **Phase 2 — config-free non-zrok endpoint entry, reusing the EXISTING config API (no new route):**
  - `pairing.publicBaseUrls` is already persisted by the existing `PUT /api/config` (`writeConfigPartial`, generic top-level merge, no whitelist). A dedicated route would duplicate it, so this change adds NO server route.
  - **NEW** "Add HTTPS URL" control in `PairingView` (or the existing Settings config surface): reads current `pairing.publicBaseUrls` via `GET /api/config`, appends the entered URL, and PUTs the full `pairing` object back — so an operator with their own reverse-proxy / tunnel / funnel URL adds it **without hand-editing JSON**.
  - The security gate is unchanged and server-side: `reachableUrls()` already drops any non-`https`/`wss` entry at read-time (D4/D14), so a bad URL can never be advertised. Client-side validation is UX feedback only. (Optional defense-in-depth: strip non-`https`/`wss` in the config validator — task 2.4.)
- **MODIFY** `packages/client/src/components/SettingsPanel.tsx` — mount `PairingView` under the existing Security section (near `PairedDevicesSection`, `SettingsPanel.tsx:1125`), or expose it via a "Pair a device" button that opens the view.
- **NEW** `packages/client/src/lib/pairing-api.ts` — thin client for `pair/payload` and `pair/approve` (mirrors `paired-devices-api.ts`). The non-zrok URL add reuses the existing `GET`/`PUT /api/config` path, not a pairing-specific client.
- **Phasing:** Phase 1 = generation view + approve UI (the blocker that makes pairing completable at all — both endpoints already exist server-side). Phase 2 = the non-zrok endpoint add. Phase 2 does not block Phase 1.
- **DOCUMENTATION** — delegated per Rule 6 (caveman style): `docs/architecture.md` pairing-view section (operator flow, non-zrok endpoint via existing `PUT /api/config`, D4/D14 read-time filter); a `docs/faq.md` entry "Pairing ≠ LAN access; how to get a secure road for LAN pairing" (secure-context requirement via `crypto.subtle`; TLS options: zrok / Caddy+LE-DNS-01 / `tailscale cert` / mkcert; bearer replaces trusted networks); + per-file rows in the `packages/client/src/components` and `packages/client/src/lib` `AGENTS.md` trees.

## Impact

- Affected specs: `qr-device-pairing` (MODIFIED — adds operator-view + non-zrok-endpoint requirements behind existing "pairing view" scenarios), no change to `bearer-device-auth` / `server-identity-keypair` token model.
- Affected code: `packages/client` only (new view + api + settings mount). **No server route added** — `PUT /api/config` already persists `pairing.publicBaseUrls`. `packages/shared/src/config.ts` optionally gains a read-time validator (task 2.4, defense-in-depth only).
- No protocol/version change: every pairing endpoint already exists; the `v` handshake is untouched.
- Security surface: unchanged config-write path (`PUT /api/config`, already auth-gated same as bindHost/bypassHosts). D4/D14 is enforced server-side at read-time in `reachableUrls()`, so a bad `publicBaseUrls` entry is never advertised. The approve flow reuses the existing D12 typed-compare endpoint unchanged.

## Discipline Skills

- `security-hardening` — Phase 2 reuses the existing auth-gated `PUT /api/config`; confirm the read-time D4/D14 filter in `reachableUrls()` sufficiently prevents plain-http/self-signed advertisement, and decide whether a config-validator strip (task 2.4) is warranted.
- `doubt-driven-review` — before Phase 2 stands: confirm a UI-written `publicBaseUrls` entry cannot be set without an authenticated operator session, and that the read-time D4/D14 filter + device-side fingerprint pinning prevent advertising an attacker-controlled URL.
