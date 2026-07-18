# Self-host installer (opinionated, ZGEnergy)

Reproduces the maintainer's secure setup on your own machine: the omp-dashboard
fork on `localhost:8088`, exposed to the internet behind single-user identity
gating, with the server and the tunnel running as systemd **user** services that
survive reboot.

Two tunnel providers are supported, selectable with `TUNNEL_PROVIDER`:

- **`zrok`** (default / fallback) — a free zrok reserved public share behind
  Google OAuth locked to your one `@zerogcapital.com` address.
- **`cloudflare`** — a Cloudflare Tunnel fronted by Cloudflare Access, gated to a
  single `@zerogcapital.com` email. Your admin provisions the tunnel once and
  hands you a token to paste.

Only **one** tunnel unit is enabled at a time. Switching providers leaves the
server, `config.json`, and dashboard state untouched.

> This is the opinionated path. For the plain/manual install, see the repo root
> [`README.md`](../README.md) (upstream paths A–D).

## Prerequisites

- Linux with a systemd **user** session.
- **omp** installed and authenticated (`~/.omp/agent` exists). See <https://github.com/can1357/oh-my-pi>.
- **Node.js ≥ 22.18** (≥ 22.22 preferred — below it `npm install` uses `--force`, which the installer handles), plus **git** and **curl**.
- For `zrok`: a free <https://zrok.io> account with an environment enabled before running the installer (see [zrok member install](#zrok-member-install)).
- For `cloudflare`: a tunnel token from your ZGEnergy admin (see Admin setup below).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ZGEnergy/omp-dashboard/main/deploy/install.sh | bash
```

Run it in a real terminal — it prompts for the tunnel provider, then the
provider-specific inputs. If you pipe it and stdin isn't a TTY (so the prompts
can't read), download and run it directly instead:

```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/ZGEnergy/omp-dashboard/main/deploy/install.sh
bash install.sh
```

Pick a provider non-interactively by presetting `TUNNEL_PROVIDER`:

```bash
TUNNEL_PROVIDER=cloudflare bash install.sh
TUNNEL_PROVIDER=zrok       bash install.sh
```

Check prerequisites without installing anything:

```bash
bash install.sh --check-only
```

### zrok member install

Before running the installer, enable zrok v1.1.11 in a separate interactive
terminal. It accepts its account token only as the required positional
`enable <token>` argument; it has no stdin, environment-variable, or file token
interface. Use this no-history/no-echo pattern so no secret literal is entered
in shell history or echoed:

```bash
read -rsp "zrok account token: " zrok_token
printf '\n'
zrok enable "$zrok_token"
unset zrok_token
```

zrok v1.1.11 therefore puts the token in its process argv temporarily; this
unavoidable exposure happens outside the installer. Once the command succeeds,
run the installer. It verifies the enabled environment, then prompts only for a
share name and your `@zerogcapital.com` email (the only account allowed in). It
reserves `https://<name>.share.zrok.io` behind Google OAuth and runs
`omp-dashboard-zrok.service`.

### Cloudflare member install

Your admin provisions your tunnel with `deploy/cloudflare-provision.sh` and gives
you a **tunnel token**. During install, choose `cloudflare` and paste that token.
The installer writes it mode-600 to `~/.config/omp-dashboard/cloudflared.env` and
runs `omp-dashboard-cloudflared.service`, which reads `TUNNEL_TOKEN` from that
env file (never inline). Your public URL is `https://omp-<you>.zgenergy.app`,
gated by Cloudflare Access to your single email.

## Admin setup (Cloudflare, one-time)

Do this once for the whole team:

1. Register `zgenergy.app` on **Cloudflare Registrar** inside a **shared
   ZGEnergy Cloudflare account** (so every member's subdomain lives in one zone).
2. In **Zero Trust → Settings → Authentication**, configure **Google** as the
   Access identity provider. This deployment uses **Google OAuth exclusively** —
   One-Time PIN (OTP) is not used.
3. Mint a **scoped** Cloudflare API token (My Profile → API Tokens → Create
   Custom Token) with exactly these permissions:
   - **Account** → **Cloudflare Tunnel : Edit**
   - **Account** → **Access: Apps and Policies : Edit**
   - **Zone** → **DNS : Edit** for `zgenergy.app`
4. Record the **Account ID** and the **Zone ID** for `zgenergy.app`.

### Provision a member

Run the admin provisioning command per person. The admin token comes from the
environment only — never inline in the command history file, never committed,
never logged:

```bash
read -rs CLOUDFLARE_API_TOKEN
printf '\n'
export CLOUDFLARE_API_TOKEN
CF_ACCOUNT_ID=<account-id> \
CF_ZONE_ID=<zone-id> \
CF_DOMAIN=zgenergy.app \
  deploy/cloudflare-provision.sh <person> <email>
```

It performs these steps **in this order**:

1. Create a named tunnel `omp-<person>`.
2. Set the tunnel ingress → `http://localhost:8088`.
3. Create the Access application **and** its single-email allow policy.
4. **Then** create the DNS route (CNAME → the tunnel).

Creating the Access app + policy **before** the DNS route is a hard security
invariant: the hostname never resolves to the origin while it is still ungated.

The command prints the **tunnel token** and the **public URL** for hand-off. Give
the token to the member; they paste it into the installer. The admin API token is
never printed.

### Roster examples

| person | hostname | email |
|--------|----------|-------|
| joe   | `omp-joe.zgenergy.app`   | joe@zerogcapital.com   |
| nate  | `omp-nate.zgenergy.app`  | nate@zerogcapital.com  |
| tom   | `omp-tom.zgenergy.app`   | tom@zerogcapital.com   |
| coury | `omp-coury.zgenergy.app` | coury@zerogcapital.com |
| tyler | `omp-tyler.zgenergy.app` | tyler@zerogcapital.com |

Central-token onboarding: the admin provisions each person and hands out the
per-person tunnel token; the member only pastes it — no admin credentials leave
the admin's machine.

## What it sets up

- Clone at `~/.omp-dashboard` (override with `PREFIX=/path`), with the client built.
- `omp-dashboard.service` (server) plus **one** tunnel unit — either
  `omp-dashboard-zrok.service` or `omp-dashboard-cloudflared.service` — enabled and
  lingering so they start at boot.
- For cloudflare: the mode-600 token file `~/.config/omp-dashboard/cloudflared.env`.
- A foreground `omp-dashboard` launcher in `~/.local/bin` (for debugging).

## Manage

- **Logs:**
  - `journalctl --user -u omp-dashboard -f`
  - zrok: `journalctl --user -u omp-dashboard-zrok -f`
  - cloudflare: `journalctl --user -u omp-dashboard-cloudflared -f`
- **Restart:** `systemctl --user restart omp-dashboard`
- **Update:** re-run the installer, or
  `cd ~/.omp-dashboard && git pull && npm run build && systemctl --user restart omp-dashboard`
- **Switch provider / rollback:** re-run the installer and choose the other
  provider (or preset `TUNNEL_PROVIDER`). The installer disables the previous
  tunnel unit and enables the new one; only one is ever active. The server and
  dashboard state are untouched.
- **Change the allowed email:**
  - zrok: `zrok release <name>` then re-run the installer (the OAuth restriction
    is fixed at reserve time).
  - cloudflare: the admin edits the Access policy (or re-provisions).
- **Uninstall:** `~/.omp-dashboard/deploy/uninstall.sh`

## Security notes

The only non-loopback way in is the tunnel edge, gated to your one
`@zerogcapital.com` identity — Google OAuth (zrok) or Cloudflare Access
(cloudflare). The server itself trusts only `127.0.0.1`. **Keep the single-email
restriction** — removing it opens the endpoint to anyone who passes the tunnel.

For cloudflare, the admin API token is scoped to the minimum permissions above,
supplied via `CLOUDFLARE_API_TOKEN` at provisioning time only, and never inlined,
committed, or logged. The member's tunnel token lives mode-600 in
`~/.config/omp-dashboard/cloudflared.env` and is read by systemd, not printed in
the unit's `ExecStart`.
