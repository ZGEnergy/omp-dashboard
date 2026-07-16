#!/usr/bin/env bash
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$DIR/lib.sh"

fail=0
ok()   { if "$@"; then echo "PASS: $*"; else echo "FAIL(expected 0): $*"; fail=1; fi; }
notok(){ if "$@"; then echo "FAIL(expected 1): $*"; fail=1; else echo "PASS(reject): $*"; fi; }

ok    validate_share_name cmditch2
ok    validate_share_name abc
notok validate_share_name ab            # too short (<3)
notok validate_share_name "-bad"        # leading dash
notok validate_share_name "Bad_Name"    # uppercase/underscore
notok validate_share_name "has space"

ok    validate_zge_email coury@zerogcapital.com
notok validate_zge_email coury@gmail.com
notok validate_zge_email "coury@zerogcapital.com.evil.com"
notok validate_zge_email "not-an-email"

have bash || { echo "FAIL: have bash"; fail=1; }
have definitely-not-a-real-binary-xyz && { echo "FAIL: have bogus"; fail=1; }

exit "$fail"
