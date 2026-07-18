#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$DIR/lib.sh"

fail=0
ok()   { if "$@"; then echo "PASS: $*"; else echo "FAIL(expected 0): $*"; fail=1; fi; }
notok(){ if "$@"; then echo "FAIL(expected 1): $*"; fail=1; else echo "PASS(reject): $*"; fi; }
assert_eq()  { if [[ "$1" == "$2" ]]; then echo "PASS: $3"; else echo "FAIL: $3 (got '$1', want '$2')"; fail=1; fi; }
assert_has() { if grep -qF -- "$2" <<<"$1"; then echo "PASS: $3"; else echo "FAIL: $3 (missing '$2')"; fail=1; fi; }
assert_no()  { if grep -qF -- "$2" <<<"$1"; then echo "FAIL: $3 (should not contain '$2')"; fail=1; else echo "PASS: $3"; fi; }
assert_before() { local p1 p2; p1="$(grep -nF -- "$2" <<<"$1" | head -1 | cut -d: -f1)"; p2="$(grep -nF -- "$3" <<<"$1" | head -1 | cut -d: -f1)"
  if [[ -n "$p1" && -n "$p2" && "$p1" -lt "$p2" ]]; then echo "PASS: $4"; else echo "FAIL: $4 ('$2'@$p1 not before '$3'@$p2)"; fail=1; fi
}

# ── share name (existing) ────────────────────────────────────────────────────
ok    validate_share_name cmditch2
ok    validate_share_name abc
notok validate_share_name ab
notok validate_share_name "-bad"
notok validate_share_name "Bad_Name"
notok validate_share_name "has space"

# ── zge email (existing) ─────────────────────────────────────────────────────
ok    validate_zge_email coury@zerogcapital.com
notok validate_zge_email coury@gmail.com
notok validate_zge_email "coury@zerogcapital.com.evil.com"
notok validate_zge_email "not-an-email"

have bash || { echo "FAIL: have bash"; fail=1; }
have definitely-not-a-real-binary-xyz && { echo "FAIL: have bogus"; fail=1; }

# ── hostname label validation (new) ──────────────────────────────────────────
ok    validate_hostname_label omp-joe
ok    validate_hostname_label omp-nate
ok    validate_hostname_label omp-coury
notok validate_hostname_label "omp-joe.zgenergy.app"
notok validate_hostname_label "omp-Joe"
notok validate_hostname_label "-omp-joe"
notok validate_hostname_label "omp-joe-"
notok validate_hostname_label "omp_joe"
notok validate_hostname_label ""

# ── provider switch validation (new) ─────────────────────────────────────────
ok    validate_tunnel_provider zrok
ok    validate_tunnel_provider cloudflare
notok validate_tunnel_provider ""
notok validate_tunnel_provider bogus
notok validate_tunnel_provider ZROK

# ── cloudflared unit templating (new) ────────────────────────────────────────
CFTPL="$DIR/omp-dashboard-cloudflared.service.template"
ok    test -f "$CFTPL"
rendered="$(sed -e 's#__LOCAL_BIN__#/home/tester/.local/bin#g' \
                -e 's#__ENV_FILE__#/home/tester/.config/omp-dashboard/cloudflared.env#g' \
                "$CFTPL")"
exec_start="$(sed -n 's/^ExecStart=//p' <<<"$rendered")"
assert_has "$rendered" "Requires=omp-dashboard.service"                       "cloudflared unit Requires server"
assert_has "$rendered" "After=omp-dashboard.service"                         "cloudflared unit After server"
assert_has "$rendered" "Restart=always"                                      "cloudflared unit Restart=always"
assert_has "$rendered" "EnvironmentFile=/home/tester/.config/omp-dashboard/cloudflared.env" "cloudflared unit reads EnvironmentFile"
assert_has "$rendered" "cloudflared tunnel run"                              "cloudflared unit runs the tunnel"
assert_has "$exec_start" "cloudflared tunnel run"                            "cloudflared ExecStart runs the tunnel"
assert_has "$rendered" 'TUNNEL_TOKEN'                                        "cloudflared unit uses the TUNNEL_TOKEN env var"
assert_no  "$exec_start" '${TUNNEL_TOKEN}'                                "cloudflared ExecStart does not expose the tunnel token"
assert_no  "$exec_start" "--token"                                         "cloudflared ExecStart does not pass a tunnel token argument"
assert_no  "$rendered" "__ENV_FILE__"                                        "cloudflared unit fully templated (env file)"
assert_no  "$rendered" "__LOCAL_BIN__"                                       "cloudflared unit fully templated (local bin)"

# ── provisioning ordering invariant (new) ────────────────────────────────────
PROVISION="$DIR/cloudflare-provision.sh"
ok    test -f "$PROVISION"
ok    test -x "$PROVISION"

if [[ -x "$PROVISION" ]]; then
  provision_source="$(cat "$PROVISION")"
  provision_usage="$(sed -n '1,/^set -euo pipefail/p' "$PROVISION")"
  assert_no  "$provision_usage" 'CLOUDFLARE_API_TOKEN=...' "provisioner usage never shows an inline admin-token assignment"
  assert_has "$provision_usage" 'read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN' "provisioner usage reads the admin token silently"
  assert_has "$provision_usage" "printf '\\n'" "provisioner usage adds a newline after silent token entry"
  assert_has "$provision_usage" 'export CLOUDFLARE_API_TOKEN' "provisioner usage exports the silently read admin token"
  assert_before "$provision_usage" 'export CLOUDFLARE_API_TOKEN' 'CF_ACCOUNT_ID=<account-id>' "provisioner usage exports the token before the non-secret command invocation"

  MOCKDIR="$(mktemp -d)"
  CALLLOG="$MOCKDIR/calls.log"
  BODYLOG="$MOCKDIR/bodies.log"
  HEADERLOG="$MOCKDIR/headers.log"
  FLAGLOG="$MOCKDIR/flags.log"
  ARGVLOG="$MOCKDIR/argv.log"
  cat > "$MOCKDIR/curl" <<'MOCK'
#!/usr/bin/env bash
url=""
body=""
printf '%s\n' "$@" >> "$ARGVLOG"
cat >> "$HEADERLOG"
for a in "$@"; do
  case "$a" in
    https://*) url="$a" ;;
    --fail) printf '%s\n' "$a" >> "$FLAGLOG" ;;
  esac
done
while (($#)); do
  case "$1" in
    --data) body="$2"; shift 2 ;;
    -H) printf '%s\n' "$2" >> "$HEADERLOG"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s\n' "$url" >> "$CALLLOG"
printf '%s\n' "$body" >> "$BODYLOG"
case "$url" in
  *"/accounts/"*"/cfd_tunnel"*"/configurations"*) printf '{"success":true,"result":{"config":{}}}' ;;
  *"/accounts/"*"/cfd_tunnel"*)                    printf '{"success":true,"result":{"id":"tun-abc-123","token":"eyJtunnel-token"}}' ;;
  *"/accounts/"*"/access/apps/"*"/policies"*)      printf '{"success":true,"result":{"id":"pol-1"}}' ;;
  *"/accounts/"*"/access/apps"*)                   printf '{"success":true,"result":{"id":"app-1"}}' ;;
  *"/zones/"*"/dns_records"*)                       printf '{"success":true,"result":{"id":"dns-1"}}' ;;
  *) printf '{"success":true,"result":{}}' ;;
esac
MOCK
  chmod +x "$MOCKDIR/curl"

  out="$(CALLLOG="$CALLLOG" BODYLOG="$BODYLOG" HEADERLOG="$HEADERLOG" FLAGLOG="$FLAGLOG" ARGVLOG="$ARGVLOG" PATH="$MOCKDIR:$PATH" \
    CLOUDFLARE_API_TOKEN=fake CF_ACCOUNT_ID=acct123 CF_ZONE_ID=zone123 CF_DOMAIN=zgenergy.app \
    bash "$PROVISION" joe joe@zerogcapital.com 2>&1)" || true

  calls="$(cat "$CALLLOG" 2>/dev/null || true)"
  bodies="$(cat "$BODYLOG" 2>/dev/null || true)"
  headers="$(cat "$HEADERLOG" 2>/dev/null || true)"
  flags="$(cat "$FLAGLOG" 2>/dev/null || true)"
  argv="$(cat "$ARGVLOG" 2>/dev/null || true)"
  assert_has "$calls" "/accounts/acct123/cfd_tunnel"                         "provision uses the tunnel endpoint"
  assert_has "$calls" "/accounts/acct123/cfd_tunnel/tun-abc-123/configurations" "provision configures the tunnel endpoint"
  assert_has "$calls" "/accounts/acct123/access/apps"                        "provision uses the Access app endpoint"
  assert_has "$calls" "/accounts/acct123/access/apps/app-1/policies"         "provision uses the Access policy endpoint"
  assert_has "$calls" "/zones/zone123/dns_records"                            "provision uses the DNS endpoint"
  assert_has "$bodies" '"config_src":"cloudflare"'                           "tunnel payload requests cloudflare config"
  assert_has "$bodies" '"domain":"omp-joe.zgenergy.app"'                     "Access payload targets the tunnel hostname"
  assert_has "$bodies" '"email":{"email":"joe@zerogcapital.com"}'          "Access policy payload allows only the member email"
  assert_has "$bodies" '"content":"tun-abc-123.cfargotunnel.com"'            "DNS payload targets the tunnel"
  assert_has "$bodies" '"proxied":true'                                        "DNS route is proxied"
  assert_has "$headers" "Authorization: Bearer fake"                           "provision supplies the admin token through the Authorization header"
  assert_no  "$argv" "fake"                                                       "provision never puts the admin token in curl argv"
  assert_has "$flags" "--fail"                                                  "provision fails on HTTP API errors"
  assert_no "$bodies" "fake"                                                     "provision never puts the admin token in request bodies"
  assert_before "$calls" "/access/apps/app-1/policies" "/dns_records"         "Access policy created BEFORE DNS route (security invariant)"
  assert_has "$out" "eyJtunnel-token"                                           "provision prints the tunnel token for hand-off"
  assert_no  "$out" "fake"                                                       "provision never echoes the admin API token"
  rm -rf "$MOCKDIR"

  FAILMOCK="$(mktemp -d)"
  FAILCALLLOG="$FAILMOCK/calls.log"
  cat > "$FAILMOCK/curl" <<'MOCK'
#!/usr/bin/env bash
url=""
for a in "$@"; do [[ "$a" == https://* ]] && url="$a"; done
printf '%s\n' "$url" >> "$CALLLOG"
case "$url" in
  *"/accounts/"*"/cfd_tunnel"*"/configurations"*) printf '{"success":true,"result":{"config":{}}}' ;;
  *"/accounts/"*"/cfd_tunnel"*)                    printf '{"success":true,"result":{"id":"tun-abc-123","token":"eyJtunnel-token"}}' ;;
  *"/accounts/"*"/access/apps/"*"/policies"*)      printf '{"success":false,"errors":[{"message":"policy denied"}]}' ;;
  *"/accounts/"*"/access/apps"*)                   printf '{"success":true,"result":{"id":"app-1"}}' ;;
  *"/zones/"*"/dns_records"*)                       printf '{"success":true,"result":{"id":"dns-1"}}' ;;
  *) printf '{"success":true,"result":{}}' ;;
esac
MOCK
  chmod +x "$FAILMOCK/curl"
  policyfailure="$(CALLLOG="$FAILCALLLOG" PATH="$FAILMOCK:$PATH" \
    CLOUDFLARE_API_TOKEN=fake CF_ACCOUNT_ID=acct123 CF_ZONE_ID=zone123 CF_DOMAIN=zgenergy.app \
    bash "$PROVISION" joe joe@zerogcapital.com 2>&1)"; rc_policy=$?
  failcalls="$(cat "$FAILCALLLOG" 2>/dev/null || true)"
  assert_eq "$rc_policy" "1" "provision stops on an unsuccessful Access policy response"
  assert_no "$failcalls" "/dns_records" "provision never creates DNS after an Access policy failure"
  rm -rf "$FAILMOCK"

  BADMOCK="$(mktemp -d)"
  cat > "$BADMOCK/curl" <<'MOCK'
#!/usr/bin/env bash
echo "CURL-SHOULD-NOT-RUN" >&2
exit 99
MOCK
  chmod +x "$BADMOCK/curl"
  bademail="$(PATH="$BADMOCK:$PATH" CLOUDFLARE_API_TOKEN=fake CF_ACCOUNT_ID=a CF_ZONE_ID=z \
    bash "$PROVISION" joe joe@gmail.com 2>&1)"; rc_email=$?
  assert_eq "$rc_email" "1" "provision rejects a non-zge email"
  assert_no "$bademail" "CURL-SHOULD-NOT-RUN" "provision validates email before any API call"
  badperson="$(PATH="$BADMOCK:$PATH" CLOUDFLARE_API_TOKEN=fake CF_ACCOUNT_ID=a CF_ZONE_ID=z \
    bash "$PROVISION" "Joe.Bad" joe@zerogcapital.com 2>&1)"; rc_person=$?
  assert_eq "$rc_person" "1" "provision rejects an invalid person/hostname"
  assert_no "$badperson" "CURL-SHOULD-NOT-RUN" "provision validates hostname before any API call"
  rm -rf "$BADMOCK"
fi


# ── installer Cloudflare safety (new) ────────────────────────────────────────
INSTALLER="$DIR/install.sh"
ok test -f "$INSTALLER"
if [[ -f "$INSTALLER" ]]; then
  installer_source="$(cat "$INSTALLER")"
  assert_no  "$installer_source" 'zrok enable "$token"' "installer never passes a zrok account token on argv"
  assert_no  "$installer_source" 'read -rsp "Paste your zrok account token: "' "installer never prompts for a zrok account token"
  assert_has "$installer_source" 'require_zrok_environment' "installer requires a pre-enabled zrok environment"

  assert_has "$installer_source" 'CLOUDFLARED_SHA256_AMD64="5237675a5e806120729acc78c5be02f9db5f406717699587abfa72b49b39fe40"' "cloudflared amd64 checksum is pinned"
  assert_has "$installer_source" 'CLOUDFLARED_SHA256_ARM64="96e8f95e878c1d4154d91c42781749ab66ca8088f1f3e6e6bc78c25c921e6b64"' "cloudflared arm64 checksum is pinned"
  assert_has "$installer_source" 'sha256sum -c -' "cloudflared verifies its temporary download"
  assert_before "$installer_source" 'mktemp "$LOCAL_BIN/.cloudflared.XXXXXX"' 'mv -f "$tmp" "$LOCAL_BIN/cloudflared"' "cloudflared installs atomically after verification"
  assert_has "$installer_source" 'read -rsp "Paste the tunnel token from your admin: " token' "Cloudflare token prompt is silent"
  assert_has "$installer_source" 'umask 077; mktemp "$env_dir/.cloudflared.env.XXXXXX"' "Cloudflare env temporary file is private from creation"
  assert_before "$installer_source" 'enable --now omp-dashboard.service omp-dashboard-cloudflared.service' 'disable --now omp-dashboard-zrok.service' "Cloudflare starts before zrok is disabled"
  assert_before "$installer_source" 'enable --now omp-dashboard.service omp-dashboard-zrok.service' 'disable --now omp-dashboard-cloudflared.service' "zrok starts before Cloudflare is disabled"
  assert_before "$installer_source" 'systemctl --user restart omp-dashboard-cloudflared.service' 'disable --now omp-dashboard-zrok.service' "Cloudflare replacement token is activated before zrok is disabled"
  main_block="$(sed -n '/^main() {/,/^}/p' "$INSTALLER")"
  assert_before "$main_block" 'fetch_and_build' 'cloudflare_setup' "Cloudflare token is not written before build succeeds"
  cloudflare_setup_block="$(sed -n '/^cloudflare_setup() {/,/^}/p' "$INSTALLER")"
  rollback_block="$(sed -n '/^rollback_cloudflared_activation() {/,/^}/p' "$INSTALLER")"
  restore_block="$(sed -n '/^restore_cloudflared_env() {/,/^}/p' "$INSTALLER")"
  assert_has "$cloudflare_setup_block" 'cp -p "$CLOUDFLARED_ENV" "$CLOUDFLARED_ENV_BACKUP"' "Cloudflare rollback backs up prior env content and mode"
  assert_has "$restore_block" 'mv -f "$CLOUDFLARED_ENV_BACKUP" "$CLOUDFLARED_ENV"' "Cloudflare activation rollback moves the backed-up env to the live env path"
  assert_has "$rollback_block" 'restore_cloudflared_env' "Cloudflare activation rollback restores the prior env"
  assert_has "$rollback_block" 'systemctl --user stop omp-dashboard-cloudflared.service' "Cloudflare activation rollback stops the attempted unit"
  assert_has "$rollback_block" 'systemctl --user disable omp-dashboard-cloudflared.service' "Cloudflare activation rollback disables a newly enabled unit"
  assert_has "$rollback_block" 'if (( ! CLOUDFLARED_UNIT_WAS_ENABLED )); then' "Cloudflare rollback disables only a unit enabled by the failed activation"

  INSTALL_TEST_DIR="$(mktemp -d)"
  cp "$INSTALLER" "$INSTALL_TEST_DIR/install.sh"
  cp "$DIR/lib.sh" "$INSTALL_TEST_DIR/lib.sh"
  sed '$d' "$INSTALL_TEST_DIR/install.sh" > "$INSTALL_TEST_DIR/functions.sh"

  non_tty="$(bash -c 'source "$1"; require_interactive_stdin "the tunnel provider"' _ "$INSTALL_TEST_DIR/functions.sh" 2>&1)"; rc_non_tty=$?
  assert_eq "$rc_non_tty" "1" "installer rejects non-TTY required prompts"
  assert_has "$non_tty" "stdin is not a terminal" "non-TTY prompt error explains the remedy"

  ZROK_ENV_TEST_DIR="$(mktemp -d)"
  zrok_missing="$(HOME="$ZROK_ENV_TEST_DIR" bash -c 'source "$1"; require_zrok_environment' _ "$INSTALL_TEST_DIR/functions.sh" 2>&1)"; rc_zrok_missing=$?
  assert_eq "$rc_zrok_missing" "1" "installer rejects a missing zrok enabled environment"
  assert_has "$zrok_missing" "zrok is not enabled" "missing zrok environment error identifies the prerequisite"
  assert_has "$zrok_missing" "Before running this installer" "missing zrok environment error explains when to enable it"
  assert_has "$zrok_missing" "zrok enable <token>" "missing zrok environment error gives the required enable command"

  mkdir -p "$ZROK_ENV_TEST_DIR/.zrok"
  : > "$ZROK_ENV_TEST_DIR/.zrok/environment.json"
  zrok_enabled="$(HOME="$ZROK_ENV_TEST_DIR" bash -c 'source "$1"; require_zrok_environment' _ "$INSTALL_TEST_DIR/functions.sh" 2>&1)"; rc_zrok_enabled=$?
  assert_eq "$rc_zrok_enabled" "0" "installer accepts an existing zrok enabled environment"
  assert_has "$zrok_enabled" "zrok environment is already enabled" "installer recognizes the zrok enabled-environment marker"
  rm -rf "$ZROK_ENV_TEST_DIR"

  ENV_TEST_DIR="$(mktemp -d)"
  printf 'TUNNEL_TOKEN=old-token\n' > "$ENV_TEST_DIR/cloudflared.env"
  chmod 600 "$ENV_TEST_DIR/cloudflared.env"
  env_result="$(bash -c '
    source "$1"
    CLOUDFLARED_ENV="$2/cloudflared.env"
    require_interactive_stdin() { :; }
    read() {
      local target="${!#}"
      case "$target" in token) printf -v "$target" %s new-token ;; host) printf -v "$target" %s omp-joe.zgenergy.app ;; esac
    }
    cloudflare_setup
    printf "new=%s mode=%s silent=%s\\n" "$(cat "$CLOUDFLARED_ENV")" "$(stat -c %a "$CLOUDFLARED_ENV")" "$(declare -f read | grep -c -- "-s")"
    restore_cloudflared_env
    printf "restored=%s\\n" "$(cat "$CLOUDFLARED_ENV")"
  ' _ "$INSTALL_TEST_DIR/functions.sh" "$ENV_TEST_DIR" 2>&1)"; rc_env=$?
  assert_eq "$rc_env" "0" "Cloudflare env update succeeds with a private temporary file"
  assert_has "$env_result" "new=TUNNEL_TOKEN=new-token mode=600" "Cloudflare replacement token is mode 0600"
  assert_has "$env_result" "restored=TUNNEL_TOKEN=old-token" "Cloudflare activation rollback restores prior token"
  rm -rf "$ENV_TEST_DIR" "$INSTALL_TEST_DIR"
fi

exit "$fail"
