#!/usr/bin/env bash
set -euo pipefail

readonly ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
readonly SOURCE="${ROOT_DIR}/.pi/skills/omp-dashboard-upstream-sync/SKILL.md"
readonly DESTINATION="/home/joe/.omp/agent/managed-skills/omp-dashboard-upstream-sync"
readonly HELPER="${ROOT_DIR}/scripts/upstream-sync/install-managed-skill.mjs"

if [[ "$#" -ne 1 || ( "$1" != "--check" && "$1" != "--install" ) ]]; then
  printf 'usage: %s --check|--install\n' "$0" >&2
  exit 2
fi

exec node "$HELPER" \
  --source "$SOURCE" \
  --destination "$DESTINATION" \
  --mode "${1#--}"
