#!/usr/bin/env bash
# Pure path-classification policy for ZGEnergy/omp-dashboard upstream sync.
# Sourced by scripts/upstream-sync.sh and unit tests. No side effects on source.
#
# Conflict priority (first match wins):
#   1. protected  → --ours  (ZGE-owned product / deploy / push / OMP / tooling)
#   2. hub        → manual  (shared registration surfaces + package manifests)
#   3. default    → --theirs (prefer upstream for same-intent product code)
#
# Rationale: when ZGE and BlackBelt implement the same feature (e.g. ChatViewMenu
# horizontal flip), take upstream so they maintain it. Keep ZGE-only surfaces and
# wire-up hubs out of the auto path.

# Paths where ZGE wins on conflict unless SYNC_ADOPT_UPSTREAM=1
PROTECTED_PATHS=(
  "deploy"
  "packages/server/src/push"
  "packages/server/src/routes/push-routes.ts"
  "packages/server/src/routes/omp-config-routes.ts"
  "packages/shared/src/omp-agent-paths.ts"
  "packages/shared/src/input-needed-tools.ts"
  "packages/shared/src/__tests__/omp-agent-paths.test.ts"
  "packages/shared/src/__tests__/config-push.test.ts"
  "docs/upstream-sync.md"
  "scripts/upstream-sync.sh"
  "scripts/lib/upstream-sync-policy.sh"
  ".github/workflows/ci-zge.yml"
  ".github/workflows/upstream-sync.yml"
)

# Shared hubs: never auto-resolve. Combine both sides (imports + registrations).
SEMANTIC_HUB_PATHS=(
  "packages/server/src/server.ts"
  "packages/extension/src/bridge.ts"
  "packages/shared/src/config.ts"
  "package.json"
  "package-lock.json"
)

is_protected_path() {
  local f="$1" p
  for p in "${PROTECTED_PATHS[@]}"; do
    if [[ "$f" == "$p" || "$f" == "$p"/* ]]; then
      return 0
    fi
  done
  return 1
}

is_semantic_hub_path() {
  local f="$1" p
  for p in "${SEMANTIC_HUB_PATHS[@]}"; do
    if [[ "$f" == "$p" || "$f" == "$p"/* ]]; then
      return 0
    fi
  done
  # Workspace package manifests often need both ZGE and upstream deps.
  if [[ "$f" =~ ^packages/[^/]+/package\.json$ ]]; then
    return 0
  fi
  return 1
}

# Print one of: ours | theirs | manual
# Args: relative path from repo root
classify_conflict_path() {
  local f="$1"
  if is_protected_path "$f"; then
    printf 'ours\n'
    return 0
  fi
  if is_semantic_hub_path "$f"; then
    printf 'manual\n'
    return 0
  fi
  # Same-intent product code, docs, tests, AGENTS notes: prefer upstream.
  printf 'theirs\n'
}
