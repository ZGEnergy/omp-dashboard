# Tasks — Gateway QR network selector

## 1. Tests first (TDD)
- [ ] 1.1 In `GatewayPairQR` component tests, assert the default render shows **exactly one** `gateway-qr-canvas` (not one-per-endpoint).
- [ ] 1.2 Assert the selector lists every endpoint (pairing + link) as selectable rows with `role="radio"` and the correct `kind` pill + mode tag.
- [ ] 1.3 Assert default selection = the public TLS pairing endpoint when one exists; QR encodes the pairing copy-string.
- [ ] 1.4 Assert fallback: with no TLS endpoint (`no_reachable_endpoint` / empty `pairingEps`), default selects the first link endpoint and QR encodes its bare URL.
- [ ] 1.5 Assert selecting a `link` row hides the copy-string, confirmation-code input, and expiry countdown, and shows the "opens the dashboard directly" note.
- [ ] 1.6 Assert selecting back to the pairing row restores the copy-string + confirmation input + Approve.
- [ ] 1.7 Verify tests fail against the current multi-QR implementation.

## 2. Implementation
- [ ] 2.1 Add `selected: TunnelEndpoint | null` state; initialise/reset to `pairingEps[0] ?? linkEps[0]` on load and whenever endpoints/payload reload.
- [ ] 2.2 Replace the endpoint mini-list + `linkEps.map(QrCanvas)` wall with a single `QrCanvas` driven by `selected` and a radio-group selector over `pairingEps ++ linkEps`.
- [ ] 2.3 Gate the QR content: `isPairingEligible(selected)` → pairing copy-string; else → `selected.url`.
- [ ] 2.4 Make the context panel swap on `isPairingEligible(selected)`: pairing controls (copy-string, expiry, fp, confirm input, Approve) vs. link note (bare URL + "no pairing, no secret").
- [ ] 2.5 Keep `guardPairingUrls`, `splitEndpoints`, `/api/pair/payload`, `/api/tunnel/endpoints` calls unchanged.

## 3. Accessibility
- [ ] 3.1 Implement the selector as `role="radiogroup"` with per-row `role="radio"` + `aria-checked`, roving `tabIndex`, arrow-key navigation, Space/Enter commit.
- [ ] 3.2 Ensure the selected row is visibly and programmatically distinguishable (not colour-only).

## 4. Docs
- [ ] 4.1 Update the `GatewayPairQR.tsx` row in `packages/client/src/components/Gateway/AGENTS.md` to note single-QR selector presentation (tunnel default). Add `See change: add-gateway-qr-network-selector`.
- [ ] 4.2 Update the file header comment in `GatewayPairQR.tsx` to describe the selector model.

## 5. Validate
- [ ] 5.1 `npm test` green (new component tests pass, no regressions).
- [ ] 5.2 `npm run quality:changed` clean.
- [ ] 5.3 Manual: with a live tunnel + LAN endpoints, confirm one QR renders, tunnel is default, switching rows swaps QR + panel, and a phone scans the selected QR cleanly. (QA/manual — verified at ship time.)
