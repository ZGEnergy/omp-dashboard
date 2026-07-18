# omp-dashboard: Cloudflare Tunnel + Access as a zrok alternative (toggle)

**Date:** 2026-07-18
**Status:** Design — awaiting review
**Repo touched:** `omp-dashboard` (`deploy/`)
**Related:** `project_omp_dashboard.md`, `project_omp_collab_self_hosted_relay.md` (the GKE relay is the longer-term successor; this is a near-term stability fix)

## Problem

The omp-dashboard self-host (`deploy/`) exposes the dashboard publicly through **zrok**, which has proven unstable in practice. zrok bundles two responsibilities into one command:

1. **Tunnel** — `zrok share reserved <name> --headless` (a `Restart=always` systemd *user* service) dials outbound to zrok's edge, yielding a public `https://<name>.share.zrok.io` with no inbound ports and no static IP. The dashboard stays on `localhost:8088` and trusts only `127.0.0.1`.
2. **Edge OAuth** — the reserve is created with `--oauth-provider google --oauth-email-address-pattern <email>`, so zrok's frontend performs the Google login and rejects any non-allowed address **before** traffic reaches localhost. The dashboard has no auth of its own in this deployment; it relies entirely on the tunnel edge for identity.

Any replacement must cover **both** responsibilities and must pass **WebSockets** cleanly — the dashboard is WS-heavy (dual WS servers: browser client + pi bridge).

## Goals

- Replace zrok with a materially more stable tunnel + edge-OAuth provider: **Cloudflare Tunnel (`cloudflared`) + Cloudflare Access**.
- Keep the swap **hot / reversible**: add Cloudflare *alongside* zrok as a selectable provider in the installer; switching back to zrok is a re-run.
- Preserve the existing security posture: server bound locally, `127.0.0.1`-only trust, single-email gate at the edge.
- Scale to the initial team of 5: one shared domain, one subdomain per person, each gated to that person's email — at ~$0 marginal cost per person.
- Match the current "paste a token" onboarding UX for team members.

## Non-goals

- Retiring zrok. It stays as a fallback/toggle.
- Enabling the dashboard's own JWT auth (the edge remains the gate, same as today).
- The GKE self-hosted relay (tracked separately; this is the near-term bridge).
- FCM/web-push work (unrelated, tracked elsewhere).
- Advanced Certificate Manager / multi-level subdomains (see naming decision — deliberately avoided).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Provider | Cloudflare Tunnel + Cloudflare Access |
| Domain | `zgenergy.app` via Cloudflare Registrar (~$10/yr), in a **shared ZGEnergy Cloudflare account** |
| Per-person addressing | **Single-level** subdomains: `omp-<person>.zgenergy.app` |
| Initial roster | `omp-joe`, `omp-nate`, `omp-tom`, `omp-coury`, `omp-tyler` (5 people) |
| Access policy | Per-subdomain Access app, `Allow → Include → Emails → <person>@zerogcapital.com` (single email each) |
| Identity provider | Google IdP configured once at the account level (One-Time-PIN is the zero-setup fallback) |
| TLS | Free Universal SSL — `*.zgenergy.app` covers every `omp-<person>` host. **No ACM.** |
| Onboarding | **Central-token**: admin provisions per person and hands out a tunnel token; member pastes it |
| Rollout | Toggle **alongside** zrok in `install.sh`; only one tunnel unit enabled at a time |

### Why a dedicated domain (not `zg.energy`)

`zg.energy` is registered on Squarespace. Cloudflare Tunnel routes a named tunnel via a CNAME to `<tunnel-id>.cfargotunnel.com`, which only exists inside a **Cloudflare-managed zone**. On Cloudflare's free/Pro plans the only way to manage a zone is **full nameserver delegation** — subdomain-only zones are **Enterprise**. So the choices were: move all of `zg.energy`'s nameservers/records to Cloudflare (disproportionate risk to production company site/email), or a dedicated cheap domain fully on Cloudflare (zero risk, self-serve). A fresh `zgenergy.app` on Cloudflare Registrar was chosen. The hostname is cosmetic; every dashboard is OAuth-gated and seen only by its owner.

### Why single-level naming (`omp-<person>`, not `<person>.omp`)

Free Universal SSL covers the apex and **one** wildcard level (`*.zgenergy.app`). A two-level host like `joe.omp.zgenergy.app` is **not** covered and would require Advanced Certificate Manager (~$10/mo) for a `*.omp.zgenergy.app` cert. Because `.app` is an **HSTS-preloaded TLD** (browsers hard-force HTTPS with no HTTP fallback), an uncovered host does not degrade — it simply fails to load. Collapsing the grouping into a single hyphenated label (`omp-<person>`) keeps the "omp" namespace and collision-safety while staying inside free `*.zgenergy.app` coverage. No recurring TLS cost.

## Architecture

### What stays untouched

- The dashboard server on `localhost:8088` (bound `0.0.0.0`, `trustedNetworks:["127.0.0.1/32"]`, `PI_DASHBOARD_NO_MDNS=1`).
- `omp-dashboard.service` (the server unit) and the `~/.pi/dashboard/config.json` it uses.
- The pi bridge on `localhost:9098`. **The bridge WS is local — it never traverses the tunnel or Access.** No service tokens needed.

### What changes — a 1:1 sibling of the second systemd unit

| Piece | Today (zrok) | Cloudflare |
|---|---|---|
| Tunnel unit | `omp-dashboard-zrok.service` → `zrok share reserved …` | `omp-dashboard-cloudflared.service` → `cloudflared tunnel run --token …` |
| Public URL | `<name>.share.zrok.io` (free subdomain) | `omp-<person>.zgenergy.app` (dedicated Cloudflare zone) |
| Edge OAuth | zrok `--oauth-provider google --oauth-email-address-pattern` | Cloudflare **Access** app + policy (single email) |
| Onboarding secret | zrok account token pasted by user | **cloudflared tunnel token** pasted by user |

The member runs a **remotely-managed** tunnel: the ingress config (public hostname → `http://localhost:8088`) lives in Cloudflare and travels with the token, so the member needs no local `config.yml` and no Cloudflare console access.

### Components

1. **Member installer provider** (`install.sh`, `TUNNEL_PROVIDER=cloudflare`) — downloads `cloudflared`, stores the pasted token, installs+enables `omp-dashboard-cloudflared.service`, disables the zrok unit. Provider-agnostic steps (build, config, server unit, launcher, omp auto-attach, report) are unchanged and shared.
2. **Admin provisioning helper** (`deploy/cloudflare-provision.sh`, admin-only) — run once per person by whoever holds the Cloudflare API token. Creates the named tunnel, sets its ingress to `http://localhost:8088`, creates the Access app+policy for `omp-<person>.zgenergy.app`, routes DNS, and prints the tunnel token to hand off.
3. **`omp-dashboard-cloudflared.service.template`** — new systemd user unit, sibling to the zrok template, `Restart=always`, reads the token from an `EnvironmentFile` (mode 600), not inline.

### WebSockets

`cloudflared` tunnels WebSockets natively. Access issues a `CF_Authorization` cookie after the browser Google login; that cookie rides the WS upgrade, so the gated browser WS (`/ws/browser`) and the phone PWA both work. The pi bridge WS stays on `localhost:9098`, outside the tunnel.

## Flows

### Admin provisioning (once per person)

Prereqs (one-time, admin): `zgenergy.app` in the shared Cloudflare account; Google IdP configured in Zero Trust; a scoped Cloudflare **API token** (Account → Cloudflare Tunnel:Edit + Access: Apps and Policies:Edit; Zone → DNS:Edit for `zgenergy.app`), plus the Account ID and Zone ID.

`deploy/cloudflare-provision.sh <person> <email>` (uses `CLOUDFLARE_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_ZONE_ID`, `CF_DOMAIN=zgenergy.app`):

1. Create named tunnel `omp-<person>` → obtain tunnel id + token.
2. Set tunnel ingress config: hostname `omp-<person>.zgenergy.app` → `http://localhost:8088`; catch-all `http_status:404`.
3. **Create the Access app + policy first** (self-hosted app for `omp-<person>.zgenergy.app`, policy `Allow → Include → Emails → <email>`).
4. **Then** create the DNS route (CNAME `omp-<person>` → `<tunnel-id>.cfargotunnel.com`, proxied).
5. Print the tunnel token + the URL for hand-off.

Step ordering (3 before 4) is a **hard safety invariant**: the tunnel fully exposes the dashboard (cloudflared connects from localhost, which the server trusts), so Access must gate the hostname before DNS resolves publicly — no open window.

### Member install (paste token)

`install.sh` with `TUNNEL_PROVIDER=cloudflare` (prompted or env):

1. Shared steps: prereq checks, fetch+build, `write_config`, server unit, launcher, omp auto-attach (all unchanged).
2. `ensure_cloudflared` — download a pinned `cloudflared` to `~/.local/bin` (mirrors `ensure_zrok`).
3. Prompt: paste the tunnel token (from the admin); optional hostname for the report.
4. Write token to `~/.config/omp-dashboard/cloudflared.env` (mode 600, `TUNNEL_TOKEN=…`).
5. Template + install `omp-dashboard-cloudflared.service`; `systemctl --user disable --now omp-dashboard-zrok.service` if present; `enable --now` the cloudflared unit; `enable-linger`.
6. Report the public URL, logs command, update/uninstall.

### Switch / rollback

Re-run the installer with the other provider. It disables the current tunnel unit and enables the other; the server unit and dashboard state are untouched. zrok ⇄ Cloudflare is a re-run, giving the A/B + instant rollback the deliverable calls for.

## Files touched (`omp-dashboard/deploy/`)

- `install.sh` — add `TUNNEL_PROVIDER` switch; extract shared steps; add `ensure_cloudflared`, cloudflared token prompt, cloudflared service install; disable the non-selected unit.
- `omp-dashboard-cloudflared.service.template` — **new**.
- `cloudflare-provision.sh` — **new** (admin-only provisioning helper).
- `lib.sh` — hostname validation + any shared provider helpers.
- `uninstall.sh` — remove the cloudflared unit + `cloudflared.env` in addition to the zrok unit.
- `README.md` — document both providers, the one-time domain/account/IdP/API-token prerequisites, the central-token onboarding, and switching.
- `tests/test-lib.sh` — extend for provider switching + new unit templating + hostname validation.

## Security invariants

- **Access before DNS route** (provisioning helper enforces ordering) — no window where the hostname resolves ungated.
- **Single email per subdomain** — never a domain-wide allow for these personal dashboards.
- **Server trust unchanged** — `trustedNetworks:["127.0.0.1/32"]`; cloudflared is localhost, so the edge (Access) is the sole gate, exactly as with zrok.
- **Token secrecy** — member tunnel token in a mode-600 `EnvironmentFile`, not inline in `ExecStart` (improvement over inline handling). Admin API token scoped minimally, stored only on the admin box, never distributed.
- **Domain ownership** — `zgenergy.app` in a shared ZGEnergy Cloudflare account so it survives any one person's departure.

## Testing & verification

- Unit: extend `deploy/tests/test-lib.sh` for the provider switch, hostname validation, and cloudflared unit templating.
- Manual (member): browse `https://omp-<person>.zgenergy.app` → Google login → dashboard renders, browser WS connects, phone PWA loads; `journalctl --user -u omp-dashboard-cloudflared -f` is clean; local `curl http://localhost:8088/api/health` OK.
- Rollback: re-run with `zrok`, confirm the cloudflared unit is disabled and the zrok URL is live again.
- Negative: before Access is attached, the hostname must not be reachable (validates the ordering invariant).

## Prerequisites (one-time, admin)

1. Register `zgenergy.app` via Cloudflare Registrar (~$10/yr) in a shared ZGEnergy Cloudflare account (registrar domains land on Cloudflare nameservers immediately — zone active at once).
2. Configure Google as an Access identity provider in Zero Trust (or accept One-Time-PIN as the fallback).
3. Mint a scoped Cloudflare API token for `cloudflare-provision.sh`; record Account ID + Zone ID.

## Open questions

- Google IdP vs One-Time-PIN for the first cut (Google matches current UX; OTP is zero-setup and still single-email-gated).
- Whether to script the admin helper in bash+curl or a small TS script (the repo is TS-heavy; bash matches the existing installer). Default: bash+curl to stay consistent with `deploy/`.
- Confirm each teammate's exact `@zerogcapital.com` address for their Access policy at provisioning time.
