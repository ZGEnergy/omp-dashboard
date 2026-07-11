#!/usr/bin/env bash
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$DEPLOY_DIR/lib.sh"

UNIT_DIR="$HOME/.config/systemd/user"
LOCAL_BIN="$HOME/.local/bin"

log "Stopping + disabling services"
systemctl --user disable --now omp-dashboard-zrok.service omp-dashboard.service 2>/dev/null || true
rm -f "$UNIT_DIR/omp-dashboard.service" "$UNIT_DIR/omp-dashboard-zrok.service"
systemctl --user daemon-reload 2>/dev/null || true

read -rp "Release the zrok reserved share too? Enter its name (blank to skip): " name
if [[ -n "$name" ]]; then
  if have zrok; then zrok release "$name" || warn "Could not release '$name' (not reserved?)."; else warn "zrok not found; skipping release."; fi
fi

rm -f "$LOCAL_BIN/omp-dashboard"
log "Removed launcher + units. Kept ~/.omp/agent, ~/.omp-dash-home, and the clone."
log "Delete the clone manually if desired (default: ~/.omp-dashboard)."
