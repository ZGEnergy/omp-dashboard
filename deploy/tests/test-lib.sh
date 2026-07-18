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
assert_has "$rendered" "Requires=omp-dashboard.service"                       "cloudflared unit Requires server"
assert_has "$rendered" "After=omp-dashboard.service"                         "cloudflared unit After server"
assert_has "$rendered" "Restart=always"                                      "cloudflared unit Restart=always"
assert_has "$rendered" "EnvironmentFile=/home/tester/.config/omp-dashboard/cloudflared.env" "cloudflared unit reads EnvironmentFile"
assert_has "$rendered" "cloudflared tunnel run"                              "cloudflared unit runs the tunnel"
assert_has "$rendered" 'TUNNEL_TOKEN'                                        "cloudflared unit uses the TUNNEL_TOKEN env var"
assert_no  "$rendered" "__ENV_FILE__"                                        "cloudflared unit fully templated (env file)"
assert_no  "$rendered" "__LOCAL_BIN__"                                       "cloudflared unit fully templated (local bin)"

# ── provisioning ordering invariant (new) ────────────────────────────────────
PROVISION="$DIR/cloudflare-provision.sh"
ok    test -f "$PROVISION"
ok    test -x "$PROVISION"

if [[ -x "$PROVISION" ]]; then
  MOCKDIR="$(mktemp -d)"
  CALLLOG="$MOCKDIR/calls.log"
  cat > "$MOCKDIR/curl" <<'MOCK'
#!/usr/bin/env bash
url=""
for a in "$@"; do case "$a" in https://*) url="$a";; esac; done
echo "$url" >> "$CALLLOG"
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

  out="$(CALLLOG="$CALLLOG" PATH="$MOCKDIR:$PATH" \
    CLOUDFLARE_API_TOKEN=fake CF_ACCOUNT_ID=acct123 CF_ZONE_ID=zone123 CF_DOMAIN=zgenergy.app \
    bash "$PROVISION" joe joe@zerogcapital.com 2>&1)" || true

  calls="$(cat "$CALLLOG" 2>/dev/null || true)"
  assert_has "$calls" "/cfd_tunnel"                       "provision creates a tunnel"
  assert_has "$calls" "/access/apps"                      "provision creates an Access app"
  assert_has "$calls" "/dns_records"                      "provision creates a DNS record"
  assert_before "$calls" "/access/apps" "/dns_records"    "Access app created BEFORE DNS route (security invariant)"
  assert_has "$out" "eyJtunnel-token"                     "provision prints the tunnel token for hand-off"
  assert_no  "$out" "fake"                                "provision never echoes the admin API token"
  rm -rf "$MOCKDIR"

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

exit "$fail"
