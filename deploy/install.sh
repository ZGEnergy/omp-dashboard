#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-$HOME/.omp-dashboard}"
LOCAL_BIN="$HOME/.local/bin"
REPO_URL="https://github.com/ZGEnergy/omp-dashboard.git"
REF="${OMP_DASH_REF:-omp-minimal}"

# ── Bootstrap for `curl … | bash` ────────────────────────────────────────────
# When piped over stdin there is no sibling lib.sh/templates, and stdin is the
# script itself (so interactive prompts can't reach the terminal). Detect that,
# clone the repo, then re-exec the checked-out installer with stdin on the tty
# so the prompts work.
_self="${BASH_SOURCE[0]:-}"
if [[ -z "$_self" || ! -f "$(dirname "$_self")/lib.sh" ]]; then
  command -v git >/dev/null 2>&1 || { echo "git is required to install." >&2; exit 1; }
  echo "==> Fetching the installer ($REF -> $PREFIX)"
  if [[ -d "$PREFIX/.git" ]]; then
    git -C "$PREFIX" fetch --depth 1 origin "$REF" && git -C "$PREFIX" checkout -q FETCH_HEAD
  else
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$PREFIX"
  fi
  # Reconnect stdin to the terminal for the prompts (stdin is the piped script).
  # Fall back to inherited stdin when /dev/tty can't be opened (headless / CI).
  if { : < /dev/tty; } 2>/dev/null; then
    exec bash "$PREFIX/deploy/install.sh" "$@" < /dev/tty
  else
    exec bash "$PREFIX/deploy/install.sh" "$@"
  fi
fi

DEPLOY_DIR="$(cd "$(dirname "$_self")" && pwd)"
# shellcheck source=/dev/null
source "$DEPLOY_DIR/lib.sh"

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
  log "Installing deps + building client (a few minutes)"
  # Headless self-host never runs the Electron desktop app → skip its ~150 MB binary
  # download; also skip npm audit/fund network calls. Nothing depends on the electron ws.
  ( cd "$PREFIX" \
    && export ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm_config_audit=false npm_config_fund=false \
    && { npm ci || npm install --force; } \
    && npm run build )
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
  # An enabled environment writes ~/.zrok/environment.json (robust marker;
  # `zrok status` prints a colored table without the word "enabled").
  if [[ -f "$HOME/.zrok/environment.json" ]]; then log "zrok already enabled."; return; fi
  echo
  log "Create a FREE account at https://zrok.io then copy your account token (Enable your environment)."
  local token
  read -rp "Paste your zrok account token: " token
  [[ -n "$token" ]] || die "No token provided."
  zrok enable "$token"
}

zrok_reserve() {
  local name email
  log "Your dashboard gets a public URL like https://joebob.share.zrok.io — pick the name part."
  while :; do
    read -rp "Public URL name (lowercase letters/numbers/hyphens, e.g. joebob): " name
    validate_share_name "$name" && break || warn "Use lowercase letters, numbers, hyphens (3-31 chars, must start with a letter or number)."
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

# De-isolated: the service runs under the real HOME so the dashboard sees omp's
# real ~/.omp credentials + sessions. Config lives at the standard ~/.pi/dashboard.
CONFIG_DIR="$HOME/.pi/dashboard"
UNIT_DIR="$HOME/.config/systemd/user"

write_config() {
  mkdir -p "$CONFIG_DIR"
  sed 's#__BIND_HOST__#0.0.0.0#g' "$DEPLOY_DIR/config.template.json" \
    > "$CONFIG_DIR/config.json"
  log "Wrote $CONFIG_DIR/config.json"
}

install_services() {
  mkdir -p "$UNIT_DIR"
  sed -e "s#__PREFIX__#$PREFIX#g" -e "s#__OMP_DIR__#$OMP_DIR#g" -e "s#__NODE_DIR__#$NODE_DIR#g" \
    "$DEPLOY_DIR/omp-dashboard.service.template" > "$UNIT_DIR/omp-dashboard.service"
  sed -e "s#__LOCAL_BIN__#$LOCAL_BIN#g" -e "s#__SHARE_NAME__#$SHARE_NAME#g" \
    "$DEPLOY_DIR/omp-dashboard-zrok.service.template" > "$UNIT_DIR/omp-dashboard-zrok.service"
  systemctl --user daemon-reload
  systemctl --user enable --now omp-dashboard.service omp-dashboard-zrok.service
  loginctl enable-linger "$USER" || warn "enable-linger failed; services may not start before login."
  log "Services enabled (start on boot via linger)."
}

write_launcher() {
  mkdir -p "$LOCAL_BIN"
  cat > "$LOCAL_BIN/omp-dashboard" <<EOF
#!/usr/bin/env bash
# Foreground run of the omp-dashboard fork (for debugging). Services run it persistently.
exec env PATH="$OMP_DIR:$NODE_DIR:\$PATH" \\
  PI_CODING_AGENT_DIR="$HOME/.omp/agent" \\
  PI_CODING_AGENT_SESSION_DIR="$HOME/.omp/agent/sessions" \\
  PI_DASHBOARD_NO_MDNS=1 \\
  "$PREFIX/node_modules/.bin/tsx" "$PREFIX/packages/server/src/cli.ts" \\
  --host 0.0.0.0 --port 8088 --pi-port 9098 "\$@"
EOF
  chmod +x "$LOCAL_BIN/omp-dashboard"
  log "Wrote launcher $LOCAL_BIN/omp-dashboard"
}

configure_omp_autoattach() {
  # Make manual `omp` sessions auto-attach to THIS dashboard — otherwise they
  # never show up in the UI. Points omp's global extensions[] at the installed
  # bridge and pins each session's bridge to this dashboard's pi-port.
  local bridge="$PREFIX/packages/extension/src/bridge.ts"
  local settings="$HOME/.omp/agent/settings.json"
  local env_file="$HOME/.omp/agent/.env"
  [[ -f "$bridge" ]] || { warn "Bridge missing at $bridge — skipping omp auto-attach."; return; }
  # Merge the bridge into omp's extensions[] without clobbering other settings.
  node -e '
    const fs=require("node:fs"), path=require("node:path");
    const [p,bridge]=process.argv.slice(1);
    let j={}; try { j=JSON.parse(fs.readFileSync(p,"utf8")||"{}"); } catch {}
    const ext=Array.isArray(j.extensions)?j.extensions:[];
    if(!ext.includes(bridge)) ext.push(bridge);
    j.extensions=ext;
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.writeFileSync(p, JSON.stringify(j,null,2)+"\n");
  ' "$settings" "$bridge"
  touch "$env_file"
  grep -q '^PI_DASHBOARD_URL=' "$env_file" || printf 'PI_DASHBOARD_URL=ws://localhost:9098\n' >> "$env_file"
  grep -q '^PI_DASHBOARD_NO_MDNS=' "$env_file" || printf 'PI_DASHBOARD_NO_MDNS=1\n' >> "$env_file"
  log "omp auto-attach configured — new omp sessions appear in the dashboard."
}

report() {
  cat <<EOF

$(log "Install complete.")
  Local URL : http://localhost:8088
  Public URL: $SHARE_URL   (Google OAuth, only $SHARE_EMAIL)
  Sessions  : new 'omp' sessions auto-attach; restart any already-running omp to see it.
  Logs      : journalctl --user -u omp-dashboard -f
              journalctl --user -u omp-dashboard-zrok -f
  Update    : re-run this installer (or: cd $PREFIX && git pull && npm run build && systemctl --user restart omp-dashboard)
  Uninstall : $PREFIX/deploy/uninstall.sh
  NOTE: $LOCAL_BIN must be on your PATH to use the 'omp-dashboard' launcher.
EOF
}

main() {
  if [[ "${1:-}" == "--check-only" ]]; then check_prereqs; log "check-only: OK"; exit 0; fi
  check_prereqs
  fetch_and_build
  ensure_zrok
  zrok_enable
  zrok_reserve
  write_config
  install_services
  write_launcher
  configure_omp_autoattach
  report
}

main "$@"
