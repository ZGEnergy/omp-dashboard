#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$DEPLOY_DIR/lib.sh"

PREFIX="${PREFIX:-$HOME/.omp-dashboard}"
LOCAL_BIN="$HOME/.local/bin"
REPO_URL="https://github.com/ZGEnergy/omp-dashboard.git"
REF="${OMP_DASH_REF:-omp-minimal}"

check_prereqs() {
  [[ "$(uname -s)" == "Linux" ]] || die "This installer supports Linux+systemd only. See deploy/README.md for the manual route."
  have systemctl || die "systemd (systemctl) not found."
  systemctl --user show-environment >/dev/null 2>&1 || die "No systemd *user* session. Log in on a real session or enable lingering first."
  have git   || die "git not found — install git."
  have curl  || die "curl not found — install curl."
  have omp   || die "omp not found on PATH. Install Oh My Pi and authenticate first (see https://github.com/can1357/oh-my-pi)."
  [[ -d "$HOME/.omp/agent" ]] || die "~/.omp/agent missing — run omp once and authenticate before installing."
  have node  || die "Node.js not found — install Node >= 22.22."
  local v; v="$(node -v)"; v="${v#v}"
  local maj="${v%%.*}"
  local rest="${v#*.}"
  local min="${rest%%.*}"
  # node-guard refuses < 22.18 at runtime; npm engines want 22.22 but the build
  # falls back to `npm install --force`, so 22.18-22.21 works with a warning.
  if (( maj < 22 || (maj == 22 && min < 18) )); then
    die "Node $v is too old — need >= 22.18 (node-guard refuses lower)."
  fi
  if (( maj == 22 && min < 22 )); then
    warn "Node $v < 22.22 — npm install may need --force (the installer handles it)."
  fi
  OMP_DIR="$(cd "$(dirname "$(command -v omp)")" && pwd)"
  NODE_DIR="$(cd "$(dirname "$(command -v node)")" && pwd)"
  log "Prereqs OK — omp=$OMP_DIR node=$NODE_DIR"
}

main() {
  if [[ "${1:-}" == "--check-only" ]]; then check_prereqs; log "check-only: OK"; exit 0; fi
  check_prereqs
  log "TODO: remaining steps wired in later tasks"
}

main "$@"
