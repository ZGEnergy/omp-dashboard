const SHA = /^[a-f0-9]{40}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

function assertSha(value, label) {
  assertString(value, label);
  if (!SHA.test(value)) throw new TypeError(`${label} must be a 40-character hexadecimal commit SHA`);
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new TypeError(`${label} must be an array of non-empty strings`);
  }
}

function freezeRequest(request) {
  Object.freeze(request.changed_paths);
  Object.freeze(request.risk_flags);
  return Object.freeze(request);
}

/**
 * Derive stable, transparent flags from changed paths and explicit caller flags.
 * Explicit flags are retained; generated flags are intentionally small and
 * explainable so the inbox record never hides a policy decision.
 */
export function deriveRiskFlags(changedPaths, explicitFlags = []) {
  assertStringArray(changedPaths, "changedPaths");
  assertStringArray(explicitFlags, "riskFlags");
  const flags = new Set(explicitFlags);
  for (const changedPath of changedPaths) {
    const path = changedPath.replaceAll("\\", "/");
    if (path.startsWith(".github/workflows/")) flags.add("high-risk:workflow");
    if (/(^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/.test(path)) {
      flags.add("high-risk:dependency");
    }
    if (path.startsWith("docker/") || path.startsWith("scripts/") || path.startsWith(".pi/")) {
      flags.add("high-risk:deployment");
    }
  }
  return Object.freeze([...flags].sort());
}

export function buildSyncRequest({ baseSha, upstreamSha, range, changedPaths, riskFlags }) {
  assertSha(baseSha, "baseSha");
  assertSha(upstreamSha, "upstreamSha");
  if (baseSha === upstreamSha) throw new TypeError("baseSha and upstreamSha must differ");
  assertString(range, "range");
  if (range !== `${baseSha}..${upstreamSha}`) throw new TypeError("range must exactly equal baseSha..upstreamSha");
  assertStringArray(changedPaths, "changedPaths");
  assertStringArray(riskFlags, "riskFlags");
  return freezeRequest({
    schema_version: "1.0",
    request_id: `sync-${baseSha.slice(0, 12)}-${upstreamSha.slice(0, 12)}`,
    base_sha: baseSha,
    upstream_sha: upstreamSha,
    upstream_range: range,
    changed_paths: [...changedPaths],
    risk_flags: [...riskFlags],
    created_at: new Date().toISOString(),
  });
}

function sanitize(value) {
  if (typeof value === "string") {
    return value.replaceAll("`", "\\u0060").replaceAll("@", "@\u200b").replaceAll("<!", "<\u200b!");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  }
  return value;
}

export function renderSafeIssueBody(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("request must be an object");
  const payload = JSON.stringify(sanitize(request), null, 2);
  return [
    "# Upstream sync inbox",
    "",
    "Detector output is immutable data for maintainer review; this workflow does not perform integration actions.",
    "",
    "```json",
    payload,
    "```",
    "",
    "The JSON payload above is the complete sync request.",
  ].join("\n");
}

export { ISO_TIMESTAMP };
