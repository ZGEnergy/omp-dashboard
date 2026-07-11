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

# Pinned to the version proven with our reserve/share commands (v2.x may change
# the CLI). Bump deliberately after testing the reserve + share-reserved flow.
ZROK_VERSION="${ZROK_VERSION:-1.1.11}"

fetch_and_build() {
  if [[ -d "$PREFIX/.git" ]]; then
    log "Updating $PREFIX to $REF"
    git -C "$PREFIX" fetch --depth 1 origin "$REF"
    git -C "$PREFIX" checkout -q FETCH_HEAD
  else
    log "Cloning $REPO_URL ($REF) into $PREFIX"
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$PREFIX"
  fi
  log "Installing deps + building client (this takes a few minutes)"
  ( cd "$PREFIX" && { npm ci || npm install --force; } && npm run build )
}

ensure_zrok() {
  if have zrok; then log "zrok present: $(zrok version 2>/dev/null | tail -1)"; return; fi
  mkdir -p "$LOCAL_BIN"
  local arch
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) die "Unsupported arch $(uname -m) for zrok auto-install; install zrok manually." ;;
  esac
  local url="https://github.com/openziti/zrok/releases/download/v${ZROK_VERSION}/zrok_${ZROK_VERSION}_linux_${arch}.tar.gz"
  log "Downloading zrok ${ZROK_VERSION} ($arch)"
  curl -fsSL "$url" | tar -xz -C "$LOCAL_BIN" zrok
  chmod +x "$LOCAL_BIN/zrok"
  export PATH="$LOCAL_BIN:$PATH"
  have zrok || die "zrok install failed."
  log "zrok installed: $("$LOCAL_BIN/zrok" version 2>/dev/null | tail -1)"
}

zrok_enable() {
  if zrok status 2>/dev/null | grep -qi 'enabled'; then log "zrok already enabled."; return; fi
  echo
  log "Create a FREE account at https://zrok.io then copy your account token (Enable your environment)."
  local token
  read -rsp "Paste your zrok account token: " token; echo
  [[ -n "$token" ]] || die "No token provided."
  zrok enable "$token"
}

zrok_reserve() {
  local name email
  while :; do
    read -rp "Choose a share name (a-z0-9-, 3-31 chars): " name
    validate_share_name "$name" && break || warn "Invalid name."
  done
  while :; do
    read -rp "Your @zerogcapital.com email (the ONLY account allowed in): " email
    validate_zge_email "$email" && break || warn "Must be an @zerogcapital.com address."
  done
  SHARE_NAME="$name"; SHARE_EMAIL="$email"

  local out
  if out="$(zrok reserve public localhost:8088 -n "$name" -b proxy \
        --oauth-provider google --oauth-email-address-pattern "$email" -j 2>&1)"; then
    SHARE_URL="$(printf '%s' "$out" | grep -oE 'https://[a-z0-9-]+\.share\.zrok\.io' | head -1)"
    [[ -n "$SHARE_URL" ]] || SHARE_URL="https://${name}.share.zrok.io"
    log "Reserved $SHARE_URL (restricted to $email)"
  else
    warn "Reserve failed (name likely already reserved on your account):"
    printf '%s\n' "$out"
    read -rp "Release '$name' and re-reserve with this email? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || die "Aborting. Re-run with a different name, or reuse the existing reservation manually."
    zrok release "$name" || true
    zrok reserve public localhost:8088 -n "$name" -b proxy \
      --oauth-provider google --oauth-email-address-pattern "$email" -j >/dev/null
    SHARE_URL="https://${name}.share.zrok.io"
    log "Re-reserved $SHARE_URL (restricted to $email)"
  fi
}

main() {
  if [[ "${1:-}" == "--check-only" ]]; then check_prereqs; log "check-only: OK"; exit 0; fi
  check_prereqs
  fetch_and_build
  ensure_zrok
  zrok_enable
  zrok_reserve
  log "TODO: config + services in Task 5"
}

main "$@"
