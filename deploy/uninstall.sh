#!/usr/bin/env bash
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$DEPLOY_DIR/lib.sh"

UNIT_DIR="$HOME/.config/systemd/user"
LOCAL_BIN="$HOME/.local/bin"

log "Stopping + disabling services"
systemctl --user disable --now omp-dashboard-zrok.service omp-dashboard-cloudflared.service omp-dashboard.service 2>/dev/null || true
rm -f "$UNIT_DIR/omp-dashboard.service" "$UNIT_DIR/omp-dashboard-zrok.service" "$UNIT_DIR/omp-dashboard-cloudflared.service"
systemctl --user daemon-reload 2>/dev/null || true
# Remove the mode-600 cloudflared token env file (harmless if it never existed).
rm -f "$HOME/.config/omp-dashboard/cloudflared.env"

name=""
read -rp "Release the zrok reserved share too? Enter its name (blank to skip): " name || true
if [[ -n "$name" ]]; then
  if have zrok; then zrok release "$name" || warn "Could not release '$name' (not reserved?)."; else warn "zrok not found; skipping release."; fi
fi

rm -f "$LOCAL_BIN/omp-dashboard"

# Reverse the omp auto-attach configured on install, so omp stops trying to load
# the dashboard bridge once the clone is gone.
PREFIX="${PREFIX:-$HOME/.omp-dashboard}"
SETTINGS="$HOME/.omp/agent/settings.json"
ENV_FILE="$HOME/.omp/agent/.env"
if [[ -f "$SETTINGS" ]] && have node; then
  node -e '
    const fs=require("node:fs");
    const [p,prefix]=process.argv.slice(1);
    let j; try { j=JSON.parse(fs.readFileSync(p,"utf8")); } catch { process.exit(0); }
    if(Array.isArray(j.extensions)){
      j.extensions=j.extensions.filter(e=>!String(e).startsWith(prefix));
      if(j.extensions.length===0) delete j.extensions;
      fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
    }
  ' "$SETTINGS" "$PREFIX" || true
fi
[[ -f "$ENV_FILE" ]] && sed -i '/^PI_DASHBOARD_URL=/d; /^PI_DASHBOARD_NO_MDNS=/d' "$ENV_FILE" 2>/dev/null || true

log "Removed launcher + units, reverted omp auto-attach. Kept ~/.omp/agent + the clone."
log "Delete the clone manually if desired (default: ~/.omp-dashboard)."
