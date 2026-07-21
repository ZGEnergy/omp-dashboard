#!/usr/bin/env bash
# Deterministic upstream sync executor. All upstream values are data, never commands.
set -euo pipefail

REPO_ROOT="${SYNC_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_ROOT"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
ORIGIN_REMOTE="${ORIGIN_REMOTE:-origin}"
UPSTREAM_REF="${UPSTREAM_REF:-develop}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
SYNC_BRANCH="${SYNC_BRANCH:-}"
GH_REPO="${GH_REPO:-ZGEnergy/omp-dashboard}"
RESULT_PATH="${SYNC_RESULT_PATH:-upstream-sync/candidate.json}"
AS_OF="${SYNC_AS_OF:-$(date -u +%F)}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'USAGE'
Usage: upstream-sync.sh <detect|validate|execute|verify> [options]

Commands:
  detect                         Write an immutable request from exact refs.
  validate --request --ledger --plan
                                 Validate bindings, pins, and affected records.
  execute --request --ledger --plan
                                 Build, verify, publish, and open one ready PR.
  verify --request --ledger --plan --worktree <path>
                                 Run pinned validator, invariants, and plan checks.

Options:
  --request <path>               Immutable request artifact.
  --ledger <path>                Immutable ledger artifact.
  --plan <path>                  Immutable plan artifact.
  --worktree <path>              Merge-result worktree for verify.
  --branch <name>                Audited sync branch (default sync/upstream-<request>).
  --base <sha> --upstream <sha>  Exact pins for detect.
  --range <range>                Exact upstream range for detect.
  --output <path>                Request output path for detect.
USAGE
}

resolve_path() {
  local value="$1"
  if [[ "$value" == /* ]]; then printf '%s\n' "$value"; else printf '%s/%s\n' "$REPO_ROOT" "$value"; fi
}
sha256_file() { sha256sum "$1" | cut -d' ' -f1; }
json_field() {
  local file="$1" field="$2"
  JSON_FILE="$file" JSON_FIELD="$field" node --input-type=module <<'NODE'
import fs from "node:fs";
const value = JSON.parse(fs.readFileSync(process.env.JSON_FILE, "utf8"));
const parts = process.env.JSON_FIELD.split(".");
let current = value;
for (const part of parts) current = current?.[part];
if (typeof current === "undefined") process.exit(2);
process.stdout.write(typeof current === "string" ? current : JSON.stringify(current));
NODE
}

parse_artifacts() {
  REQUEST_PATH="$(resolve_path "$1")"
  LEDGER_PATH="$(resolve_path "$2")"
  PLAN_PATH="$(resolve_path "$3")"
  [[ -f "$REQUEST_PATH" ]] || die "request artifact missing: $1"
  [[ -f "$LEDGER_PATH" ]] || die "ledger artifact missing: $2"
  [[ -f "$PLAN_PATH" ]] || die "plan artifact missing: $3"
  REQUEST_BYTES="$(sha256_file "$REQUEST_PATH")"
  LEDGER_BYTES="$(sha256_file "$LEDGER_PATH")"
  PLAN_BYTES="$(sha256_file "$PLAN_PATH")"
  BASE_SHA="$(json_field "$REQUEST_PATH" base_sha)" || die "request base pin missing"
  UPSTREAM_SHA="$(json_field "$REQUEST_PATH" upstream_sha)" || die "request upstream pin missing"
  UPSTREAM_RANGE="$(json_field "$REQUEST_PATH" upstream_range)" || die "request upstream range missing"
  REQUEST_ID="$(json_field "$REQUEST_PATH" request_id)" || die "request ID missing"
  LEDGER_REVISION="$(json_field "$REQUEST_PATH" ledger_revision)" || die "request ledger revision missing"
  PLAN_HASH="$(json_field "$PLAN_PATH" plan_hash)" || die "plan hash missing"
  [[ "$(json_field "$PLAN_PATH" base_sha)" == "$BASE_SHA" ]] || die "plan base pin differs from request"
  [[ "$(json_field "$PLAN_PATH" upstream_sha)" == "$UPSTREAM_SHA" ]] || die "plan upstream pin differs from request"
  [[ "$(json_field "$PLAN_PATH" ledger_revision)" == "$LEDGER_REVISION" ]] || die "plan ledger revision differs from request"
  [[ "$(json_field "$LEDGER_PATH" ledger_revision)" == "$LEDGER_REVISION" ]] || die "ledger revision differs from request"
  git -C "$REPO_ROOT" cat-file -e "${BASE_SHA}^{commit}" || die "base pin is not a commit"
  git -C "$REPO_ROOT" cat-file -e "${UPSTREAM_SHA}^{commit}" || die "upstream pin is not a commit"
  [[ "$BASE_SHA" != "$UPSTREAM_SHA" ]] || die "request pins must differ"
}

assert_artifacts_unchanged() {
  [[ "$(sha256_file "$REQUEST_PATH")" == "$REQUEST_BYTES" ]] || die "request artifact changed during execution"
  [[ "$(sha256_file "$LEDGER_PATH")" == "$LEDGER_BYTES" ]] || die "ledger artifact changed during execution"
  [[ "$(sha256_file "$PLAN_PATH")" == "$PLAN_BYTES" ]] || die "plan artifact changed during execution"
}

validator_check() {
  local mode="$1" worktree="${2:-}"
  local bundle
  bundle="$(mktemp -d -t upstream-sync-validator-XXXXXX)"
  git -C "$REPO_ROOT" archive "$BASE_SHA" scripts/upstream-sync | tar -x -C "$bundle"
  local module="$bundle/scripts/upstream-sync/validator.mjs"
  [[ -f "$module" ]] || die "pinned-base validator is missing"
  VALIDATOR_MODULE="$module" REQUEST_FILE="$REQUEST_PATH" LEDGER_FILE="$LEDGER_PATH" PLAN_FILE="$PLAN_PATH" WORKTREE="$worktree" VALIDATOR_MODE="$mode" VALIDATOR_AS_OF="$AS_OF" node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
const moduleUrl = new URL("file://" + process.env.VALIDATOR_MODULE);
const { validatePlanBinding, evaluateAffectedObligations, validatePostMergeInvariants } = await import(moduleUrl);
const { resolveProofPath } = await import(new URL("./contracts.mjs", moduleUrl));
const request = JSON.parse(fs.readFileSync(process.env.REQUEST_FILE, "utf8"));
const ledger = JSON.parse(fs.readFileSync(process.env.LEDGER_FILE, "utf8"));
const plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));
const binding = validatePlanBinding({ request, ledger, plan });
if (!binding.ok) throw new Error(`plan binding failed: ${binding.errors.join("; ")}`);
const assessment = evaluateAffectedObligations({ upstreamRange: request.upstream_range, ledger, asOf: process.env.VALIDATOR_AS_OF });
if (assessment.blocked.length > 0) throw new Error(`affected obligations blocked: ${assessment.blocked.map((item) => item.obligation_id).join(", ")}`);
const blockedPlan = plan.decisions.filter((item) => item.disposition === "blocked" || item.decision_status === "blocked");
if (blockedPlan.length > 0) throw new Error(`plan contains blocked decisions: ${blockedPlan.map((item) => item.obligation_id).join(", ")}`);
if (process.env.VALIDATOR_MODE === "post") {
  const root = path.resolve(process.env.WORKTREE);
  for (const decision of plan.decisions) {
    if (["blocked", "retire"].includes(decision.disposition)) continue;
    for (const proof of [...decision.behavior_proof, ...decision.test_proof, ...decision.wiring_proof]) resolveProofPath(root, proof);
  }
  const checks = plan.decisions.flatMap((item) => item.verification.required_checks);
  const invariants = validatePostMergeInvariants({ worktree: { checks }, plan });
  if (!invariants.ok) throw new Error(`post-merge invariants failed: ${invariants.failures.map((item) => item.invariant).join(", ")}`);
}
process.stdout.write(JSON.stringify({ assessment, plan_hash: plan.plan_hash }));
NODE
  rm -rf "$bundle"
}

run_plan_commands() {
  local worktree="$1"
  PLAN_FILE="$PLAN_PATH" node --input-type=module <<'NODE' >"${worktree}/.upstream-sync-commands"
import fs from "node:fs";
const plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));
for (const decision of plan.decisions) for (const command of decision.verification.commands) process.stdout.write(`${command}\n`);
NODE
  while IFS= read -r command; do
    [[ -n "$command" ]] || continue
    log "verify: $command"
    (cd "$worktree" && bash -c "$command") || die "verification command failed"
  done <"${worktree}/.upstream-sync-commands"
  rm -f "${worktree}/.upstream-sync-commands"
}

validate_artifacts() {
  validator_check pre
  assert_artifacts_unchanged
  log "validated exact pins ${BASE_SHA}..${UPSTREAM_SHA} and plan ${PLAN_HASH}"
}

cmd_detect() {
  local output="upstream-sync/request.json" base="" upstream="" range=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --base|--upstream|--range|--output)
        [[ $# -ge 2 ]] || die "$1 requires a value"
        case "$1" in
          --base) base="$2" ;;
          --upstream) upstream="$2" ;;
          --range) range="$2" ;;
          --output) output="$2" ;;
        esac
        shift 2
        ;;
      *) die "unknown detect option: $1" ;;
    esac
  done
  base="${base:-$(git -C "$REPO_ROOT" rev-parse "${ORIGIN_REMOTE}/${TARGET_BRANCH}")}"
  upstream="${upstream:-$(git -C "$REPO_ROOT" rev-parse "${UPSTREAM_REMOTE}/${UPSTREAM_REF}")}"
  range="${range:-${base}..${upstream}}"
  local ledger="$(resolve_path "upstream-sync/ledger/obligations.json")"
  [[ -f "$ledger" ]] || die "canonical ledger missing"
  local revision
  revision="$(json_field "$ledger" ledger_revision)"
  local changed_file
  changed_file="$(mktemp -t upstream-sync-changed-XXXXXX)"
  git -C "$REPO_ROOT" diff --name-only "$range" >"$changed_file"
  local destination
  destination="$(resolve_path "$output")"
  mkdir -p "$(dirname "$destination")"
  REQUEST_ID="${REQUEST_ID:-sync-$(date -u +%Y%m%d%H%M%S)}" BASE_SHA="$base" UPSTREAM_SHA="$upstream" UPSTREAM_RANGE="$range" LEDGER_REVISION="$revision" CHANGED_PATHS_FILE="$changed_file" REQUEST_CREATED_AT="$(date -u +%FT%TZ)" node --input-type=module <<'NODE' >"$destination"
import fs from "node:fs";
const changedPaths = fs.readFileSync(process.env.CHANGED_PATHS_FILE, "utf8").split(/\r?\n/).filter(Boolean);
const request = { schema_version: "1.0", request_id: process.env.REQUEST_ID, base_sha: process.env.BASE_SHA, upstream_sha: process.env.UPSTREAM_SHA, upstream_range: process.env.UPSTREAM_RANGE, changed_paths: changedPaths, risk_flags: [], ledger_revision: process.env.LEDGER_REVISION, created_at: process.env.REQUEST_CREATED_AT };
process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
NODE
  rm -f "$changed_file"
  log "detected immutable request $output (${base}..${upstream})"
}

apply_plan() {
  local worktree="$1"
  PLAN_FILE="$PLAN_PATH" REQUEST_FILE="$REQUEST_PATH" node --input-type=module <<'NODE' >"${worktree}/.upstream-sync-mutations"
import fs from "node:fs";
const plan = JSON.parse(fs.readFileSync(process.env.PLAN_FILE, "utf8"));
const request = JSON.parse(fs.readFileSync(process.env.REQUEST_FILE, "utf8"));
const paths = request.changed_paths;
const matches = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const obligations = new Map(plan.decisions.map((decision) => [decision.obligation_id, decision]));
const ledger = JSON.parse(fs.readFileSync(process.env.LEDGER_FILE, "utf8"));
for (const obligation of ledger.obligations) {
  const decision = obligations.get(obligation.id);
  if (!decision || !["adopt-upstream", "preserve-zge", "retire"].includes(decision.disposition)) continue;
  for (const candidate of obligation.scope.paths) if (paths.some((changed) => matches(candidate, changed))) process.stdout.write(`${decision.disposition}\t${candidate}\n`);
}
NODE
  while IFS=$'\t' read -r disposition path_value; do
    [[ -n "$path_value" ]] || continue
    case "$disposition" in
      adopt-upstream)
        git -C "$worktree" cat-file -e "$UPSTREAM_SHA:$path_value" || die "adopt-upstream path absent at exact upstream pin: $path_value"
        git -C "$worktree" restore --source="$UPSTREAM_SHA" --staged --worktree -- "$path_value"
        ;;
      preserve-zge)
        git -C "$worktree" cat-file -e "$BASE_SHA:$path_value" || die "preserve-zge path absent at exact base pin: $path_value"
        git -C "$worktree" restore --source="$BASE_SHA" --staged --worktree -- "$path_value"
        ;;
      retire) git -C "$worktree" rm -f -- "$path_value";;
      *) die "unsupported plan mutation: $disposition";;
    esac
  done <"${worktree}/.upstream-sync-mutations"
  rm -f "${worktree}/.upstream-sync-mutations"
}

render_body() {
  local body_file="$1" branch="$2" commit="$3" pr_url="${4:-}"
  BODY_BRANCH="$branch" BODY_COMMIT="$commit" BODY_PR="$pr_url" BODY_REQUEST="$REQUEST_PATH" BODY_PLAN="$PLAN_PATH" BODY_LEDGER="$LEDGER_PATH" BODY_BASE="$BASE_SHA" BODY_UPSTREAM="$UPSTREAM_SHA" BODY_RANGE="$UPSTREAM_RANGE" BODY_AS_OF="$AS_OF" node --input-type=module >"$body_file" <<'NODE'
import fs from "node:fs";
const request = JSON.parse(fs.readFileSync(process.env.BODY_REQUEST, "utf8"));
const plan = JSON.parse(fs.readFileSync(process.env.BODY_PLAN, "utf8"));
const ledger = JSON.parse(fs.readFileSync(process.env.BODY_LEDGER, "utf8"));
const safe = (value) => String(value).replace(/[\\`\r\n]/g, " ").replace(/[@<>*_#|]/g, "_");
const summaries = plan.decisions.map((decision) => "- " + safe(decision.obligation_id) + ": **" + safe(decision.disposition) + "** (" + decision.behavior_proof.map(safe).join(", ") + ")").join("\n");
const paths = request.changed_paths.map((item) => "- " + safe(item)).join("\n");
const risks = request.risk_flags.length ? request.risk_flags.map((item) => "- " + safe(item)).join("\n") : "- none recorded";
const nearMisses = ledger.obligations.filter((item) => item.status === "blocked").map((item) => "- " + safe(item.id) + " remains carry-forward").join("\n") || "- none";
const body = "## Audited upstream sync\n\n" +
  "- **Base pin:** " + safe(process.env.BODY_BASE) + "\n" +
  "- **Upstream pin:** " + safe(process.env.BODY_UPSTREAM) + "\n" +
  "- **Upstream range:** " + safe(process.env.BODY_RANGE) + "\n" +
  "- **Branch:** " + safe(process.env.BODY_BRANCH) + "\n" +
  "- **Audited commit:** " + safe(process.env.BODY_COMMIT) + "\n\n" +
  "### Disposition and content summary\n" + summaries + "\n\nChanged paths:\n" + paths + "\n\n" +
  "### Verification\n- Pinned-base validator binding and affected-record assessment passed.\n- Post-merge invariants and every plan verification command passed.\n- Exact base/upstream pins were checked again immediately before publication.\n\n" +
  "### Residual risks\n" + risks + "\n\n### Near-miss decisions\n" + nearMisses + "\n\nThis is a normal ready-for-review PR. It does not merge main or deploy.\n";
process.stdout.write(body);
NODE
}
cmd_verify() {
  local worktree="${1:-$REPO_ROOT}"
  [[ -d "$worktree" ]] || die "verify worktree missing: $worktree"
  validate_artifacts
  validator_check post "$worktree"
  run_plan_commands "$worktree"
  assert_artifacts_unchanged
  log "verification passed for exact pins and post-merge invariants"
}

preflight_publish() {
  local branch="$1"
  command -v gh >/dev/null 2>&1 || die "gh CLI is required for publication"
  gh auth status >/dev/null 2>&1 || die "gh authentication is required for publication"
  git -C "$REPO_ROOT" push --dry-run --force-with-lease "$ORIGIN_REMOTE" "HEAD:refs/heads/$branch" >/dev/null 2>&1 || die "origin push access is required for publication"
}

cmd_execute() {
  validate_artifacts
  local branch="${SYNC_BRANCH:-sync/upstream-${REQUEST_ID}}-${PLAN_HASH:0:12}"
  [[ "$branch" =~ ^[A-Za-z0-9._/-]+$ && "$branch" != *..* ]] || die "unsafe audited branch name"
  case "$branch" in main|master|develop|"$TARGET_BRANCH") die "refusing protected audited branch: $branch";; esac
  preflight_publish "$branch"
  local holder="" tree=""
  holder="$(mktemp -d -t upstream-sync-worktree-XXXXXX)"
  tree="$holder/result"
  cleanup() { [[ -n "${tree:-}" ]] && git -C "$REPO_ROOT" worktree remove --force "$tree" >/dev/null 2>&1 || true; [[ -n "${holder:-}" ]] && rm -rf "$holder" || true; }
  trap cleanup EXIT
  git -C "$REPO_ROOT" worktree add --detach "$tree" "$BASE_SHA"
  [[ "$(git -C "$tree" rev-parse HEAD)" == "$BASE_SHA" ]] || die "fresh worktree is not at exact base pin"
  git -C "$tree" switch -c "$branch" "$BASE_SHA"
  set +e
  git -C "$tree" merge --no-ff "$UPSTREAM_SHA" -m "chore(sync): merge upstream exact pin"
  local merge_rc=$?
  set -e
  [[ "$merge_rc" -eq 0 ]] || die "exact upstream merge failed; resolve conflicts manually"
  [[ -z "$(git -C "$tree" diff --name-only --diff-filter=U)" ]] || die "unresolved conflict remains"
  local parents
  parents="$(git -C "$tree" rev-list --parents -n 1 HEAD)"
  [[ "$parents" == *" $BASE_SHA"* && "$parents" == *" $UPSTREAM_SHA"* ]] || die "merge parents do not contain exact pins"
  LEDGER_FILE="$LEDGER_PATH" apply_plan "$tree"
  cmd_verify "$tree"
  git -C "$tree" add -A
  if ! git -C "$tree" diff --cached --quiet; then
    git -C "$tree" commit -m "chore(sync): apply audited plan dispositions"
  fi
  local commit_sha
  commit_sha="$(git -C "$tree" rev-parse HEAD)"
  [[ "$commit_sha" != "$BASE_SHA" && "$commit_sha" != "$UPSTREAM_SHA" ]] || die "audited branch has no merge commit"
  git -C "$tree" push --force-with-lease "$ORIGIN_REMOTE" "HEAD:refs/heads/$branch"
  local body_file pr_output existing
  body_file="$holder/pr-body.md"
  render_body "$body_file" "$branch" "$commit_sha"
  existing="$(gh pr list -R "$GH_REPO" --state open --head "$branch" --json number --jq '.[0].number // empty' 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    gh pr edit "$existing" -R "$GH_REPO" --title "chore(sync): audited upstream ${UPSTREAM_REF}" --body-file "$body_file"
    gh pr ready "$existing" -R "$GH_REPO" >/dev/null 2>&1 || true
    pr_output="$(gh pr view "$existing" -R "$GH_REPO" --json url --jq '.url' 2>/dev/null || true)"
  else
    pr_output="$(gh pr create -R "$GH_REPO" --base "$TARGET_BRANCH" --head "$branch" --title "chore(sync): audited upstream ${UPSTREAM_REF}" --body-file "$body_file")"
  fi
  local result_file
  result_file="$(resolve_path "$RESULT_PATH")"
  mkdir -p "$(dirname "$result_file")"
  RESULT_FILE="$result_file" RESULT_PR="$pr_output" RESULT_BRANCH="$branch" RESULT_COMMIT="$commit_sha" RESULT_REQUEST="$REQUEST_PATH" RESULT_PLAN="$PLAN_PATH" node --input-type=module <<'NODE'
import fs from "node:fs";
const request = JSON.parse(fs.readFileSync(process.env.RESULT_REQUEST, "utf8"));
const plan = JSON.parse(fs.readFileSync(process.env.RESULT_PLAN, "utf8"));
const result = { schema_version: "1.0", request_id: request.request_id, base_sha: request.base_sha, upstream_sha: request.upstream_sha, upstream_range: request.upstream_range, plan_hash: plan.plan_hash, branch: process.env.RESULT_BRANCH, commit_sha: process.env.RESULT_COMMIT, pull_request: process.env.RESULT_PR.trim(), ready_for_review: true, verified_at: new Date().toISOString() };
fs.writeFileSync(process.env.RESULT_FILE, `${JSON.stringify(result, null, 2)}\n`);
NODE
  log "ready-for-review PR published for $branch at $commit_sha"
}

main() {
  local command="${1:-}"; shift || true
  if [[ "$command" == "detect" ]]; then
    cmd_detect "$@"
    return 0
  fi
  local request="" ledger="" plan="" worktree="" branch=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --request) request="$2"; shift 2;;
      --ledger) ledger="$2"; shift 2;;
      --plan) plan="$2"; shift 2;;
      --worktree) worktree="$2"; shift 2;;
      --branch) branch="$2"; SYNC_BRANCH="$2"; shift 2;;
      --help|-h) usage; return 0;;
      *) die "unknown option: $1";;
    esac
  done
  case "$command" in
    detect) cmd_detect "$@";;
    validate|verify|execute)
      [[ -n "$request" && -n "$ledger" && -n "$plan" ]] || die "$command requires --request, --ledger, and --plan"
      parse_artifacts "$request" "$ledger" "$plan"
      case "$command" in
        validate) validate_artifacts;;
        verify) cmd_verify "${worktree:-$REPO_ROOT}";;
        execute) cmd_execute;;
      esac
      ;;
    ""|-h|--help) usage;;
    *) usage; die "unknown command: $command";;
  esac
}
main "$@"
