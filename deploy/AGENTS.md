# DOX — deploy

Files in this directory. One row per changed file.

| File | Purpose |
|------|---------|
| `README.md` | Document zrok default/fallback and Cloudflare member/admin flows. Keep one tunnel unit active. Require Access policy before DNS route. |
| `cloudflare-provision.sh` | Provision `omp-<person>` tunnel, ingress `http://localhost:8088`, Access app, single-email policy, DNS CNAME. Send `CLOUDFLARE_API_TOKEN` only in Authorization header. Create Access policy before DNS route. Print member tunnel token, never admin token. |
| `install.sh` | Select `TUNNEL_PROVIDER` (`zrok` default/fallback, `cloudflare`). Install one tunnel unit. Store `TUNNEL_TOKEN` in mode-600 `~/.config/omp-dashboard/cloudflared.env`. |
| `lib.sh` | Provide installer helpers. Validate zrok share names, `@zerogcapital.com` emails, single-level host labels, tunnel providers. |
| `omp-dashboard-cloudflared.service.template` | Run `cloudflared tunnel run` after `omp-dashboard.service`. Load `TUNNEL_TOKEN` through mode-600 `EnvironmentFile`. Never expand token in `ExecStart`. Restart always. |
| `tests/test-lib.sh` | Assert hostname/provider validation, Cloudflare unit rendering, Access-before-DNS ordering, token secrecy, installer provider switch. |
| `uninstall.sh` | Disable both tunnel units. Remove Cloudflare unit and `~/.config/omp-dashboard/cloudflared.env`. Keep clone and omp state. |
