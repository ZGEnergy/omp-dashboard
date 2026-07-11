# Self-host installer (opinionated, ZGEnergy)

Reproduces the maintainer's secure setup on your own machine: the omp-dashboard
fork on `localhost:8088`, exposed at `https://<name>.share.zrok.io` behind Google
OAuth locked to your single `@zerogcapital.com` address, with the server and the
zrok tunnel running as systemd **user** services that survive reboot.

> This is the opinionated path. For the plain/manual install, see the repo root
> [`README.md`](../README.md) (upstream paths A–D).

## Prerequisites

- Linux with a systemd **user** session.
- **omp** installed and authenticated (`~/.omp/agent` exists). See <https://github.com/can1357/oh-my-pi>.
- **Node.js ≥ 22.18** (≥ 22.22 preferred — below it `npm install` uses `--force`, which the installer handles), plus **git** and **curl**.
- A free <https://zrok.io> account (you paste its token during install).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ZGEnergy/omp-dashboard/omp-minimal/deploy/install.sh | bash
```

Run it in a real terminal — it prompts for your zrok token, a share name, and your
`@zerogcapital.com` email. If you pipe it and stdin isn't a TTY (so the prompts
can't read), download and run it directly instead:

```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/ZGEnergy/omp-dashboard/omp-minimal/deploy/install.sh
bash install.sh
```

Check prerequisites without installing anything:

```bash
bash install.sh --check-only
```

## What it sets up

- Clone at `~/.omp-dashboard` (override with `PREFIX=/path`), with the client built.
- Isolated dashboard home `~/.omp-dash-home` — config sets
  `trustedNetworks:["127.0.0.1/32"]`, `tunnel.enabled:false`, and the server runs
  with `PI_DASHBOARD_NO_MDNS=1`.
- `omp-dashboard.service` (server) + `omp-dashboard-zrok.service` (tunnel), enabled
  and lingering so they start at boot.
- A foreground `omp-dashboard` launcher in `~/.local/bin` (for debugging).

## Manage

- **Logs:** `journalctl --user -u omp-dashboard -f` / `journalctl --user -u omp-dashboard-zrok -f`
- **Restart:** `systemctl --user restart omp-dashboard`
- **Update:** re-run the installer, or
  `cd ~/.omp-dashboard && git pull && npm run build && systemctl --user restart omp-dashboard`
- **Change the allowed email:** `zrok release <name>` then re-run the installer
  (the OAuth restriction is fixed at reserve time).
- **Uninstall:** `~/.omp-dashboard/deploy/uninstall.sh`

## Security notes

The only non-loopback way in is the zrok edge, gated by Google OAuth to your one
`@zerogcapital.com` email. The server itself trusts only `127.0.0.1`. **Keep the
email restriction** — removing it opens the endpoint to any Google account that
passes the tunnel.
