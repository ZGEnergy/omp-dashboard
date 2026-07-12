#!/usr/bin/env bash
# Shared helpers for the omp-dashboard self-host installer. Pure + sourced.

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
# Attention-grabbing header for interactive sections (blank line + bell + bold
# cyan), so the prompts below aren't lost in surrounding output.
banner() { printf '\a\n\033[1;36m====> %s\033[0m\n' "$*"; }

# DNS-safe share name: 3-31 chars, lowercase alnum + dashes, no leading dash.
validate_share_name() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9-]{2,30}$ ]]
}

# Must be an @zerogcapital.com address (anchored — no suffix tricks).
validate_zge_email() {
  [[ "$1" =~ ^[A-Za-z0-9._%+-]+@zerogcapital\.com$ ]]
}
