#!/usr/bin/env bash
# Upstream sync helper for ZGEnergy/omp-dashboard (fork of BlackBeltTechnology/pi-agent-dashboard).
# Used by humans, the omp skill, and optionally CI. Never force-pushes main.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/BlackBeltTechnology/pi-agent-dashboard.git}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
UPSTREAM_REF="${UPSTREAM_REF:-develop}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
DATE_TAG="${DATE_TAG:-$(date -u +%Y%m%d)}"
# Stable branch so each automated run supersedes the previous open PR.
# Capture whether the caller exported SYNC_BRANCH before applying the default
# (value may equal the default name; presence still counts as explicit).
SYNC_BRANCH_FROM_ENV=0
if [[ -n "${SYNC_BRANCH+x}" ]]; then
  SYNC_BRANCH_FROM_ENV=1
fi
SYNC_BRANCH="${SYNC_BRANCH:-sync/upstream-${UPSTREAM_REF}}"
GH_REPO="${GH_REPO:-ZGEnergy/omp-dashboard}"

# Conflict path policy (protected / hub / prefer-upstream). See scripts/lib/upstream-sync-policy.sh.
# shellcheck source=lib/upstream-sync-policy.sh
source "${REPO_ROOT}/scripts/lib/upstream-sync-policy.sh"

log() { printf '==> %s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: $(basename "$0") <status|merge|verify|pr> [options]

Commands:
  status       Show ahead/behind vs upstream ref
  merge        Create/update sync branch and merge upstream
               (auto-ours on protected, auto-theirs on same-intent product, manual hubs)
  verify       Run structural + focused unit + build gates
  pr           Open/update PR from current sync branch into ${TARGET_BRANCH}

Env:
  UPSTREAM_REF   upstream branch (default: develop)
  TARGET_BRANCH  integration branch (default: main)
  SYNC_BRANCH    override sync branch (default: sync/upstream-<ref>, stable/single PR)
  DRY_RUN=1      print actions only for merge/pr
  SKIP_BUILD=1   verify skips npm run build
  SYNC_ADOPT_UPSTREAM=1  do not auto-checkout --ours for protected paths
  SYNC_KEEP_OURS=1       do not auto-checkout --theirs for non-protected product paths
USAGE
}

ensure_remotes() {
  if ! git remote get-url "$ORIGIN_REMOTE" >/dev/null 2>&1; then
    die "missing remote $ORIGIN_REMOTE"
  fi
  if ! git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    log "adding remote $UPSTREAM_REMOTE -> $UPSTREAM_URL"
    git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
  fi
}

fetch_all() {
  ensure_remotes
  log "fetch $ORIGIN_REMOTE $TARGET_BRANCH + $UPSTREAM_REMOTE $UPSTREAM_REF"
  git fetch "$ORIGIN_REMOTE" "$TARGET_BRANCH" --prune
  git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_REF" --prune
}

short_sha() { git rev-parse --short "$1"; }

cmd_status() {
  fetch_all
  local base tip behind ahead
  base="${ORIGIN_REMOTE}/${TARGET_BRANCH}"
  tip="${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
  behind=$(git rev-list --count "${base}..${tip}")
  ahead=$(git rev-list --count "${tip}..${base}")
  printf 'origin/%s:   %s\n' "$TARGET_BRANCH" "$(short_sha "$base")"
  printf 'upstream/%s: %s\n' "$UPSTREAM_REF" "$(short_sha "$tip")"
  printf 'ZGE ahead:   %s commits (not in upstream)\n' "$ahead"
  printf 'ZGE behind:  %s commits (missing from upstream)\n' "$behind"
  if [[ "$behind" -eq 0 ]]; then
    log "already up to date with upstream/$UPSTREAM_REF"
  else
    log "sync needed: merge upstream/$UPSTREAM_REF into a sync branch"
  fi
  log "protected paths (ZGE wins on conflict):"
  printf '  - %s\n' "${PROTECTED_PATHS[@]}"
  log "semantic hubs (manual combine):"
  printf '  - %s\n' "${SEMANTIC_HUB_PATHS[@]}"
  log "default for other conflicts: take upstream (--theirs)"
}


# Auto-resolve unmerged paths by policy:
#   protected → --ours (unless SYNC_ADOPT_UPSTREAM=1)
#   hub       → leave for manual semantic merge
#   default   → --theirs (prefer upstream same-intent product; unless SYNC_KEEP_OURS=1)
resolve_conflicts_by_policy() {
  local f decision ours_n=0 theirs_n=0 manual_n=0
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    decision="$(classify_conflict_path "$f")"
    case "$decision" in
      ours)
        if [[ "${SYNC_ADOPT_UPSTREAM:-0}" == "1" ]]; then
          log "conflict leave manual (SYNC_ADOPT_UPSTREAM=1, would be protected-ours): $f"
          manual_n=$((manual_n + 1))
          continue
        fi
        log "conflict auto-ours (protected): $f"
        git checkout --ours -- "$f"
        git add -- "$f"
        ours_n=$((ours_n + 1))
        ;;
      theirs)
        if [[ "${SYNC_KEEP_OURS:-0}" == "1" ]]; then
          log "conflict leave manual (SYNC_KEEP_OURS=1, would be prefer-upstream): $f"
          manual_n=$((manual_n + 1))
          continue
        fi
        log "conflict auto-theirs (prefer upstream): $f"
        git checkout --theirs -- "$f"
        git add -- "$f"
        theirs_n=$((theirs_n + 1))
        ;;
      manual)
        log "conflict leave manual (semantic hub): $f"
        manual_n=$((manual_n + 1))
        ;;
      *)
        warn "unknown classify_conflict_path result '$decision' for $f — leaving manual"
        manual_n=$((manual_n + 1))
        ;;
    esac
  done < <(git diff --name-only --diff-filter=U)
  log "conflict auto-resolve summary: ours=$ours_n theirs=$theirs_n manual=$manual_n"
}


cmd_merge() {
  fetch_all
  local base tip behind
  base="${ORIGIN_REMOTE}/${TARGET_BRANCH}"
  tip="${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
  behind=$(git rev-list --count "${base}..${tip}")
  if [[ "$behind" -eq 0 ]]; then
    log "nothing to merge (behind=0)"
    return 0
  fi
  local usha
  usha=$(git rev-parse --short "$tip")
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "DRY_RUN: would checkout -B $SYNC_BRANCH $base && merge $tip ($usha)"
    return 0
  fi
  log "creating branch $SYNC_BRANCH from $base"
  git checkout -B "$SYNC_BRANCH" "$base"
  log "merging $tip ($usha)"
  set +e
  git merge --no-ff "$tip" -m "chore(sync): merge upstream/${UPSTREAM_REF}@${usha}"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    warn "merge reported conflicts; applying path policy (protected=ours, product=theirs, hub=manual)"
    resolve_conflicts_by_policy
    local left
    left=$(git diff --name-only --diff-filter=U | wc -l | tr -d ' ')
    if [[ "$left" -gt 0 ]]; then
      local report="docs/upstream-sync-conflicts-${DATE_TAG}.md"
      {
        echo "# Upstream sync conflicts (${DATE_TAG})"
        echo
        echo "- upstream: ${UPSTREAM_REF}@${usha}"
        echo "- base: ${TARGET_BRANCH}@$(short_sha "$base")"
        echo "- branch: ${SYNC_BRANCH}"
        echo
        echo "## Remaining unmerged paths (manual)"
        echo
        while IFS= read -r f; do
          [[ -z "$f" ]] && continue
          printf -- '- `%s` → %s\n' "$f" "$(classify_conflict_path "$f")"
        done < <(git diff --name-only --diff-filter=U)
        echo
        echo "## Policy"
        echo "- **protected** paths → \`--ours\` (ZGE deploy/push/OMP/tooling)"
        echo "- **semantic hubs** (\`server.ts\`, \`bridge.ts\`, \`config.ts\`, package manifests) → combine both sides"
        echo "- **everything else** already took \`--theirs\` (prefer upstream same-intent product code)"
        echo "- re-run: scripts/upstream-sync.sh verify"
      } >"$report"
      git add "$report" 2>/dev/null || true
      warn "still $left conflicted path(s); see $report"
      warn "fix remaining conflicts, then: git commit (merge) && scripts/upstream-sync.sh verify"
      return 2
    fi
    # all conflicts auto-resolved
    git commit --no-edit -m "chore(sync): merge upstream/${UPSTREAM_REF}@${usha} (policy: protected-ours product-theirs)"
  fi
  log "merge complete on $SYNC_BRANCH"
  git status -sb | head -20
}

cmd_verify() {
  export PATH="${PATH}"
  if ! command -v node >/dev/null; then die "node not on PATH"; fi
  local nv
  nv=$(node -v)
  log "node $nv"

  log "Gate 0: structural"
  [[ -d deploy ]] || die "deploy/ missing"
  [[ -f deploy/install.sh ]] || die "deploy/install.sh missing"
  grep -q 'ZGEnergy/omp-dashboard' deploy/install.sh || die "deploy/install.sh lost ZGEnergy repo URL"
  [[ -d packages/server/src/push ]] || die "packages/server/src/push missing"
  [[ -f packages/server/src/routes/push-routes.ts ]] || die "push-routes.ts missing"
  [[ -f packages/shared/src/omp-agent-paths.ts ]] || die "omp-agent-paths.ts missing"
  grep -q 'upstream-sync' docs/upstream-sync.md 2>/dev/null || warn "docs/upstream-sync.md missing (ok only mid-bootstrap)"
  log "Gate 0 OK"

  log "Gate 1: unit suites (shared + server + client + roles-plugin + extension)"
  # Upstream vitest globalSetup refuses real $HOME (must match root `npm test`).
  local failed=0
  local strict=0
  if [[ "${VERIFY_STRICT:-0}" == "1" || -n "${CI:-}" ]]; then
    strict=1
  fi
  local test_home
  test_home="$(mktemp -d -t pi-test-XXXXXX)"
  local test_ls
  test_ls="$(mktemp -t pi-test-ls-XXXXXX)"
  resolve_vitest() {
    local dir="$1"
    if [[ -x "${REPO_ROOT}/node_modules/.bin/vitest" ]]; then
      printf '%s\n' "${REPO_ROOT}/node_modules/.bin/vitest"
    elif [[ -x "${dir}/node_modules/.bin/vitest" ]]; then
      printf '%s\n' "${dir}/node_modules/.bin/vitest"
    else
      return 1
    fi
  }
  run_vitest_all() {
    local dir="$1"
    local bin
    if ! bin="$(resolve_vitest "$dir")"; then
      if [[ "$strict" -eq 1 ]]; then
        die "vitest not installed — run npm ci at repo root (required for $dir)"
      fi
      warn "vitest not installed — run npm ci at repo root; skipping tests in $dir"
      return 0
    fi
    log "vitest all in $dir"
    if ! (
      cd "$dir" &&
        HOME="$test_home" \
        NODE_OPTIONS="--localstorage-file=${test_ls}" \
        "$bin" run --reporter=dot --config vitest.config.ts
    ); then
      failed=1
      warn "vitest failed in $dir"
    fi
  }

  if [[ -d packages/shared ]]; then
    run_vitest_all packages/shared || true
  elif [[ "$strict" -eq 1 ]]; then
    die "packages/shared missing"
  fi
  if [[ -d packages/server ]]; then
    run_vitest_all packages/server || true
  elif [[ "$strict" -eq 1 ]]; then
    die "packages/server missing"
  fi
  if [[ -d packages/client ]]; then
    run_vitest_all packages/client || true
  elif [[ "$strict" -eq 1 ]]; then
    die "packages/client missing"
  fi
  if [[ -d packages/roles-plugin ]]; then
    run_vitest_all packages/roles-plugin || true
  fi
  if [[ -d packages/extension ]]; then
    run_vitest_all packages/extension || true
  fi

  if [[ "$failed" -ne 0 ]]; then
    die "Gate 1 failed"
  fi
  log "Gate 1 OK"

  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    warn "SKIP_BUILD=1 — skipping Gate 2"
    return 0
  fi
  log "Gate 2: build"
  export ELECTRON_SKIP_BINARY_DOWNLOAD=1
  export npm_config_audit=false npm_config_fund=false
  if [[ ! -d node_modules ]]; then
    log "npm ci (or install --force)"
    npm ci || npm install --force
  fi
  npm run build
  log "Gate 2 OK"
}


close_stale_sync_prs() {
  local keep_head="$1"
  command -v gh >/dev/null 2>&1 || { warn "gh not available; skip closing stale sync PRs"; return 0; }
  log "closing other open upstream-sync PRs (keep head=$keep_head)"
  local json
  json=$(gh pr list -R "$GH_REPO" --state open --limit 100 \
    --json number,headRefName,title,labels,url 2>/dev/null || echo '[]')
  KEEP_HEAD="$keep_head" GH_REPO_VAL="$GH_REPO" python3 -c '
import json, os, subprocess, sys
prs = json.loads(sys.stdin.read() or "[]")
keep = os.environ["KEEP_HEAD"]
repo = os.environ["GH_REPO_VAL"]
for pr in prs:
    head = pr.get("headRefName") or ""
    labels = set()
    for l in (pr.get("labels") or []):
        labels.add(l.get("name") if isinstance(l, dict) else str(l))
    # Only supersede stable/ephemeral *sync heads*. Do not close tooling PRs
    # that merely carry the upstream-sync label.
    is_sync_head = head.startswith("sync/upstream")
    if not is_sync_head or head == keep:
        continue
    n = pr["number"]
    body = (
        "Superseded by the latest automated upstream sync on `" + keep + "`. "
        "Only the newest sync PR is kept open for review."
    )
    subprocess.run(["gh", "pr", "comment", str(n), "-R", repo, "--body", body], check=False)
    subprocess.run(["gh", "pr", "close", str(n), "-R", repo, "--comment", body], check=False)
    print(f"closed #{n} head={head}", flush=True)
' <<<"$json"
}

push_sync_branch() {
  local branch="$1"
  log "pushing $branch (force-with-lease; supersedes previous sync tip)"
  git push --force-with-lease -u "$ORIGIN_REMOTE" "$branch"
}

cmd_pr() {
  fetch_all
  local branch
  branch=$(git branch --show-current)
  if [[ "$branch" == "main" || "$branch" == "master" || "$branch" == "$TARGET_BRANCH" || "$branch" == "develop" ]]; then
    die "refusing to force-with-lease push protected branch '$branch' (check out $SYNC_BRANCH first)"
  fi
  # Single-PR policy: only heads under sync/upstream* may be force-published as sync PRs
  # (custom SYNC_BRANCH/--branch must still use that prefix so close_stale_sync_prs works).
  if [[ "$branch" != sync/upstream* ]]; then
    die "current branch $branch is not a sync branch (expected prefix sync/upstream*)"
  fi
  if [[ "${SKIP_VERIFY:-0}" != "1" ]]; then
    log "pr: running verify before push (SKIP_VERIFY=1 to bypass)"
    cmd_verify
  else
    warn "SKIP_VERIFY=1 — publishing without local Gate 0–2"
  fi
  local tip usha behind ahead
  tip="${UPSTREAM_REMOTE}/${UPSTREAM_REF}"
  usha=$(git rev-parse --short "$tip")
  behind=$(git rev-list --count "${ORIGIN_REMOTE}/${TARGET_BRANCH}..${tip}" || echo "?")
  ahead=$(git rev-list --count "${tip}..${ORIGIN_REMOTE}/${TARGET_BRANCH}" || echo "?")
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    log "DRY_RUN: would force-with-lease push $branch, close stale sync PRs, upsert single PR into $TARGET_BRANCH"
    return 0
  fi

  push_sync_branch "$branch"
  close_stale_sync_prs "$branch"
  local body title existing
  title="chore(sync): upstream ${UPSTREAM_REF} @ ${usha}"
  # Quoted delimiter: no command substitution from Markdown ticks in the body.
  body=$(cat <<'BODY'
## Upstream sync (latest only)

Automation **replaces** any previous open sync PR. Review this one when ready; older sync PRs are closed as superseded.

- **Upstream:** BlackBeltTechnology/pi-agent-dashboard __UPSTREAM_REF__ @ __USHA__
- **Into:** __TARGET_BRANCH__
- **Branch:** __BRANCH__ (stable; force-updated each run)
- **Approx behind/ahead at open:** behind=__BEHIND__ ahead=__AHEAD__

## Protected ZGE surfaces (must remain green)
- deploy/** self-host installer + systemd/zrok
- Web Push (packages/server/src/push/**, push routes, SW)
- OMP runtime paths (omp-agent-paths, tool registry, spawn env)
- OMP config mirror routes

## Policy
- **Protected** ZGE paths: `--ours` on conflict
- **Same-intent product** (non-protected, non-hub): `--theirs` (prefer upstream maintenance)
- **Semantic hubs** (`server.ts`, `bridge.ts`, `config.ts`, package manifests): combine manually
- Never force-push main (sync branch may force-with-lease)

## Gates
- [ ] scripts/upstream-sync.sh verify (Gate 0–2)
- [ ] CI ci-zge green
- [ ] Manual/prod promote **not** done by this PR

Docs: docs/upstream-sync.md
BODY
)
  body=${body//__UPSTREAM_REF__/${UPSTREAM_REF}}
  body=${body//__USHA__/${usha}}
  body=${body//__TARGET_BRANCH__/${TARGET_BRANCH}}
  body=${body//__BRANCH__/${branch}}
  body=${body//__BEHIND__/${behind}}
  body=${body//__AHEAD__/${ahead}}
  existing=$(gh pr list -R "$GH_REPO" --state open --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    log "updating existing PR #$existing on $branch"
    gh pr edit "$existing" -R "$GH_REPO" --title "$title" --body "$body" || true
    gh pr ready "$existing" -R "$GH_REPO" 2>/dev/null || true
    gh pr view "$existing" -R "$GH_REPO" --json url,number,title --jq '{url,number,title}'
  else
    log "creating single open sync PR for $branch"
    gh pr create -R "$GH_REPO" --base "$TARGET_BRANCH" --head "$branch" \
      --title "$title" --label "upstream-sync" --body "$body"
  fi
}


main() {
  local cmd="${1:-}"
  shift || true
  local branch_flag=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ref) UPSTREAM_REF="$2"; shift 2 ;;
      --branch) SYNC_BRANCH="$2"; branch_flag=1; shift 2 ;;
      --target) TARGET_BRANCH="$2"; shift 2 ;;
      --dry-run) DRY_RUN=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown arg: $1" ;;
    esac
  done
  # Precedence: --branch > env SYNC_BRANCH (presence) > default from UPSTREAM_REF.
  if [[ "$branch_flag" -eq 1 ]]; then
    :
  elif [[ "${SYNC_BRANCH_FROM_ENV}" -eq 1 ]]; then
    :
  else
    SYNC_BRANCH="sync/upstream-${UPSTREAM_REF}"
  fi
  case "$cmd" in
    status) cmd_status ;;
    merge) cmd_merge ;;
    verify) cmd_verify ;;
    pr) cmd_pr ;;
    ""|-h|--help) usage; exit 0 ;;
    *) usage; die "unknown command: $cmd" ;;
  esac
}

main "$@"
