# Design — tunnel providers behind a provider abstraction

## Provider matrix

|            | zrok         | ngrok       | tailscale            | zerotier            |
|------------|--------------|-------------|----------------------|---------------------|
| public     | `share public` | `http`    | `funnel`             | — (unsupported)     |
| private    | —            | —           | `serve` / MagicDNS   | join network → mesh IP |
| lifecycle  | child        | child       | **daemon**           | **daemon**          |
| URL source | child stdout | child stdout| `status --json`      | `zerotier-cli status` |
| URL type   | https        | https       | https (funnel) + name| raw `http://IP:port` |
| enrollment | `~/.zrok2` env | `add-authtoken` | `tailscale up` | `join <netid>` (+ approve) |
| modes      | public       | public      | **both**             | private only        |

zrok is the legacy default. ngrok is the cheap validation case (child model, mirrors zrok, no daemon edge). Tailscale unlocks the daemon path and is the only provider meeting the "both modes" bar. ZeroTier rides Tailscale's daemon work and is private-only with a no-TLS/no-name wrinkle.

## D1: TunnelProvider interface — generic lifecycle up, provider specifics down

```
interface TunnelProvider {
  id: "zrok" | "ngrok" | "tailscale" | "zerotier"
  kind: "child" | "daemon"
  supportsMode(mode): boolean            // ngrok/zrok → public only; zerotier → private only
  detectBinary(): boolean                // via existing ToolResolver
  isEnrolled(): boolean                  // zrok env | ngrok authtoken | tailscale logged-in | zt joined
  connect(port, mode, opts): Promise<ProviderEndpoints>
  disconnect(port): Promise<void>
  status(): ProviderStatus               // endpoints[] + health
}
```

Stays provider-neutral in the core (`tunnel.ts` refactor): PID files, spawn timeout/retry, the health watchdog, orphan scavenge. Moves into each implementation: binary name, spawn args, URL regex/parse, enrollment check, teardown command.

**Child vs daemon is the sharp edge.** zrok/ngrok: the tunnel *is* a child process the server owns and kills; PID file + watchdog apply unchanged. Tailscale/ZeroTier: the tunnel is state on a long-lived daemon; `connect`/`disconnect` are idempotent config commands, URL comes from `status --json`, there is no PID we own. PID-file/watchdog machinery therefore becomes **provider-optional**, gated on `kind`.

Spawn shapes:
```
zrok :   zrok  share public --headless http://localhost:PORT        (+ reserved <tok>)
ngrok:   ngrok http PORT --log stdout --log-format json             (+ --url https://<reserved>)
tsc  :   tailscale serve --bg PORT        |  tailscale funnel PORT on
zt   :   zerotier-cli join <netid>        (daemon must be running)
```

## D2: config — provider + mode, keys stay `tunnel`

```jsonc
tunnel: {
  enabled: true,
  provider: "zrok"|"ngrok"|"tailscale"|"zerotier",   // required when enabled
  mode: "public"|"private",                           // required; validated against supportsMode
  zrok:      { reservedToken?: string },
  ngrok:     { authtoken?: string, domain?: string },  // domain = reserved URL
  tailscale: { authKey?: string },
  zerotier:  { networkId?: string },
  watchdog: { ... }                                    // generic, child-model only
}
```
Back-compat resolver: legacy bare `reservedToken` + no `provider` → `{ provider:"zrok", mode:"public", zrok:{reservedToken} }`. Refuse to connect if `provider=tailscale` (or any) and `mode` unset, or if `!supportsMode(mode)`.

## D3: step-action taxonomy (setup guide)

The dashboard server runs **unprivileged**, so what a button may run is gated on sudo/interactivity, not on our preference:

| step type   | button?    | behaviour |
|-------------|------------|-----------|
| install     | ✗ copy     | stays copy-paste + live ✓ detection (needs elevation / slow / streaming) |
| auth-token  | ✓ run      | token field + **Authenticate** → whitelisted Recipe (`ngrok config add-authtoken`, `zrok enable`, `tailscale up --authkey`) |
| activate    | ✓ run      | **Enable funnel** / **Connect** → whitelisted Recipe (no sudo) |
| browser-auth| ⧉ open     | `tailscale up` prints an auth URL; server captures it, UI opens it |
| external    | link only  | admin-console gates (MagicDNS, HTTPS certs, Funnel ACL) we cannot automate |

**Security contract (non-negotiable):** the run endpoint executes a fixed Recipe keyed by `(provider, step)` with the token/netid as a *validated parameter* — never an arbitrary command string. Runs over the authenticated loopback path; the secret is written to the provider's own config (`~/.zrok2`, `ngrok.yml`, tailscale state) and never logged. Uses the existing `platform/runner.ts` Recipe engine (fits sub-second enroll; NOT install, which is left copy-paste).

## D4: endpoints — "Accessible at" + QR pairing

`getReachableUrls()` becomes multi-sourced from every active provider endpoint. Each endpoint carries `{ kind: public|mesh|magicdns|lan|local, url, tls: boolean }`.

- **Manual operator endpoint (migrated from `wire-nonzrok-pairing-view`).** Beyond provider endpoints, an operator may add a non-provider `https`/`wss` URL (their own reverse-proxy / funnel) via the UI. It persists to `pairing.publicBaseUrls` through the existing auth-gated `PUT /api/config` (`writeConfigPartial`, generic top-level merge — **no new route**; client sends the full `pairing` object because the merge is shallow) and joins `getReachableUrls()` as a `{ kind: public, tls: true }` source. The `https`/`wss` gate is enforced server-side at **read time** in `reachableUrls()` (D4/D14), so a plain-http entry is dropped before advertisement regardless of how it was written; client validation is UX feedback only. This closes the JSON-only gap the archived pairing change left, without a bespoke pairing route.
- **"Accessible at"** lists all, with TLS/no-TLS badge.
- **Two QR kinds, split by transport (Decision 1, corrected after doubt review).**
  - **Pairing QR** — encodes the secure pairing payload `{ v, id, code, urls[] }`. `urls[]` carries **TLS endpoints only** (`https`/`wss`): public tunnel URLs, and MagicDNS names that have a provisioned `tailscale cert` (a real secure context). This is **unchanged D14 — no relaxation.** The crypto challenge/redeem handshake (`crypto.subtle`, secure-context-only) runs and a bearer is issued over TLS. Electron consumes the same payload as a `pi:pair:v1.…` copy-string.
  - **Link QR** — for **no-TLS http endpoints** (mesh `100.x`/`10.x`, LAN). Encodes **just the URL string**, not the pairing payload. Scanning opens the dashboard directly; the pairing handshake is never attempted, so `crypto.subtle`-on-http never fires and **no bearer/secret is transmitted from the QR**. Access on arrival is governed by `config.trustedNetworks` (mesh IP trusted → no-auth) or normal login. On Tailscale/ZeroTier the WireGuard/mesh underlay encrypts transport regardless.

  **Why the split (doubt-review findings):** including http mesh endpoints *in the pairing payload* was disproven — browsers cannot run `crypto.subtle` over a non-secure http origin (W3C secure contexts), so scan-to-connect could not function on the private side; and where it did (Electron), the bearer leaked in clear to a mesh that is NOT a single-owner enclave (Tailscale Share, ZeroTier guest). The link QR gives the private-mesh convenience without either failure mode. Raw http mesh IPs never enter `urls[]`, so distinguishing mesh-IP from plain-LAN by inspection (unimplementable — ZeroTier assigns any RFC1918 range) is moot.

## D5: trusted-network block events

`localhost-guard` records recent denials into a bounded ring buffer (source IP + best-effort provider/network hint), exposed via an auth-gated endpoint. UI surfaces a "refused — Trust this network?" banner → one-click add to `config.trustedNetworks` (exact IP, or offer the mesh subnet), plus remove. Section lives once, on the **Security** page (shared with auth); the Gateway page cross-references it.

## D6: UI surfaces

Reusable section components (`GatewayProviderSection`, `GatewayEndpoints`, `GatewayPairQR`, `GatewaySetupGuide`) composed into two hosts:
- **Gateway settings page** (own page under Network nav) — persist/configure; full-width; Save footer. Trusted networks referenced from Security (no dupe).
- **Gateway dialog** (tabbed: Setup / Access & QR / Security) — do-it-now, from a button.

All user-facing strings say **"Gateway"**; internal identifiers stay `tunnel`. A UI label map, nothing on the wire.

## Decisions resolved
- **D1 (QR endpoints):** two QR kinds by transport — **pairing QR** carries TLS-only `urls[]` (D14 intact, incl. `tailscale cert` MagicDNS https); **link QR** carries a plain URL for no-TLS http endpoints (no pairing payload, no crypto, no bearer over the wire). Corrected after doubt review disproved mesh-in-payload (crypto.subtle-on-http impossible; clear-text bearer leak on non-enclave mesh).
- **D2 (Docker):** host-first; Tailscale/ZeroTier daemon-in-container is a follow-up change. zrok stays in the image.

## Sequencing rationale
Land the abstraction + zrok-behind-seam (no behaviour change), then **ngrok** (like-for-like, proves the seam cheaply), then **Tailscale** (daemon + both modes + Funnel gates), then **ZeroTier** (private-only, rides the daemon work). QR/pairing wiring and the Gateway UI relabel come after providers work. The Gateway relabel is a mechanical UI-string pass, sequenced last.
