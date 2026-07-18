#!/usr/bin/env bash
# Admin-only Cloudflare provisioning for the omp-dashboard Cloudflare Tunnel +
# Access provider. Creates a per-person named tunnel, its ingress config, an
# Access application + single-email policy, and finally the DNS route.
#
# HARD SECURITY INVARIANT: the Access app + policy are created BEFORE the DNS
# route, so the public hostname never resolves to the origin while it is still
# ungated. Do not reorder.
#
# The Cloudflare admin API token is supplied via CLOUDFLARE_API_TOKEN and is
# used ONLY in the Authorization header — never echoed, logged, or printed.
#
# Usage:
#   read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN
#   printf '\n'
#   export CLOUDFLARE_API_TOKEN
#   CF_ACCOUNT_ID=<account-id> CF_ZONE_ID=<zone-id> [CF_DOMAIN=zgenergy.app] \
#     cloudflare-provision.sh <person> <email>
#
# Prints the per-person tunnel token + public URL for hand-off to the member.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$DEPLOY_DIR/lib.sh"

person="${1:-}"
email="${2:-}"
[[ -n "$person" && -n "$email" ]] || die "usage: cloudflare-provision.sh <person> <email>"

[[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] || die "CLOUDFLARE_API_TOKEN is required (scoped admin token)."
[[ -n "${CF_ACCOUNT_ID:-}" ]] || die "CF_ACCOUNT_ID is required."
[[ -n "${CF_ZONE_ID:-}" ]] || die "CF_ZONE_ID is required."
CF_DOMAIN="${CF_DOMAIN:-zgenergy.app}"

# ── Validate BEFORE any network call (no request should fire on bad input) ────
validate_zge_email "$email" || die "Email must be an @zerogcapital.com address: $email"
label="omp-${person}"
validate_hostname_label "$label" || die "Invalid person/hostname label '$label' (lowercase alnum + hyphen, no dots)."

# One HTTP helper. The admin token is supplied to curl as a header on stdin,
# so it never enters curl's argv; the request body and error response are never
# printed.
cf_api() { # $1=METHOD $2=URL_PATH $3=JSON_BODY(optional)
  local method="$1" path="$2" body="${3:-}" response
  local url="https://api.cloudflare.com/client/v4${path}"
  local -a args=(-sS --fail -X "$method" "$url"
    -H @-
    -H "Content-Type: application/json")
  [[ -n "$body" ]] && args+=(--data "$body")

  if ! response="$(curl "${args[@]}" <<<"Authorization: Bearer ${CLOUDFLARE_API_TOKEN}")"; then
    die "Cloudflare API request failed: ${method} ${path}"
  fi
  if ! printf '%s' "$response" | json_is_success; then
    die "Cloudflare API returned an error: ${method} ${path}"
  fi
  printf '%s' "$response"
}

# Dynamic values are JSON-encoded and path-encoded before interpolation.
json_quote() { node -p 'JSON.stringify(process.argv[1])' "$1"; }
url_segment() { node -p 'encodeURIComponent(process.argv[1])' "$1"; }
json_is_success() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.exit(JSON.parse(d).success===true?0:1)}catch{process.exit(1)}})'; }

# Extract a dotted path from a JSON response fed on stdin (node guaranteed present).
json_get() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);const p=process.argv[1].split(".");let v=j;for(const k of p)v=v?.[k];process.stdout.write(v==null?"":String(v));}catch{process.exit(0)}})' "$1"; }

hostname="${label}.${CF_DOMAIN}"
account_id="$(url_segment "$CF_ACCOUNT_ID")"
zone_id="$(url_segment "$CF_ZONE_ID")"

# 1. Create the named tunnel.
log "Creating tunnel '$label'…"
resp="$(cf_api POST "/accounts/${account_id}/cfd_tunnel" \
  "{\"name\":$(json_quote "$label"),\"config_src\":\"cloudflare\"}")"
tunnel_id="$(printf '%s' "$resp" | json_get result.id)"
tunnel_token="$(printf '%s' "$resp" | json_get result.token)"
[[ -n "$tunnel_id" && -n "$tunnel_token" ]] || die "tunnel create failed"
log "Tunnel id ${tunnel_id} created."

# 2. Set the ingress config (route the hostname to the local dashboard).
log "Configuring tunnel ingress → http://localhost:8088"
tunnel_path_id="$(url_segment "$tunnel_id")"
cf_api PUT "/accounts/${account_id}/cfd_tunnel/${tunnel_path_id}/configurations" \
  "{\"config\":{\"ingress\":[{\"hostname\":$(json_quote "$hostname"),\"service\":\"http://localhost:8088\"},{\"service\":\"http_status:404\"}]}}" >/dev/null

# 3. Access app + single-email policy FIRST (gate before the hostname resolves).
log "Creating Access application for ${hostname}"
resp="$(cf_api POST "/accounts/${account_id}/access/apps" \
  "{\"name\":$(json_quote "$label"),\"type\":\"self_hosted\",\"domain\":$(json_quote "$hostname"),\"session_duration\":\"24h\"}")"
app_id="$(printf '%s' "$resp" | json_get result.id)"
[[ -n "$app_id" ]] || die "Access app create failed"
log "Adding single-email allow policy for ${email}"
app_path_id="$(url_segment "$app_id")"
cf_api POST "/accounts/${account_id}/access/apps/${app_path_id}/policies" \
  "{\"name\":$(json_quote "${label} single email"),\"decision\":\"allow\",\"include\":[{\"email\":{\"email\":$(json_quote "$email")}}]}" >/dev/null

# 4. THEN the DNS route (CNAME → the tunnel). Ordering is a security invariant.
log "Creating DNS route ${hostname} → ${tunnel_id}.cfargotunnel.com"
cf_api POST "/zones/${zone_id}/dns_records" \
  "{\"type\":\"CNAME\",\"name\":$(json_quote "$label"),\"content\":$(json_quote "${tunnel_id}.cfargotunnel.com"),\"proxied\":true}" >/dev/null

# 5. Hand-off (safe values only — never the admin token).
banner "Provisioning complete for ${person}."
echo "Public URL   : https://${hostname}"
echo "Access policy: single email ${email} (Cloudflare Access)"
echo "Tunnel token (give this to ${person} to paste into the installer):"
echo "${tunnel_token}"
