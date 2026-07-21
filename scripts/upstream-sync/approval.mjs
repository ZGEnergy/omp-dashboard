const SHA1 = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const HIGH_RISK = new Set(["executor", "validator", "ci", "CI/workflow", "workflow", "dependency", "dependency-manifest", "dependency-paths"]);

const list = (value) => Array.isArray(value) ? value : [];
const uniqueSorted = (values) => [...new Set(values)].sort();

function repositoryName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return value.full_name ?? value.name;
  return undefined;
}

function codeownersFor(codeowners, riskFlags) {
  const owners = new Set();
  if (Array.isArray(codeowners)) {
    for (const entry of codeowners) {
      if (Array.isArray(entry?.owners)) entry.owners.forEach((owner) => owners.add(typeof owner === "string" ? owner.replace(/^@/, "") : owner?.login));
    }
  } else if (codeowners && typeof codeowners === "object") {
    const values = riskFlags.flatMap((risk) => codeowners[risk] ?? codeowners[risk.toLowerCase()] ?? []);
    for (const owner of values) owners.add(typeof owner === "string" ? owner.replace(/^@/, "") : owner?.login);
  }
  return new Set([...owners].filter(Boolean));
}

function reviewLogin(review) {
  return review?.user?.login ?? review?.author?.login ?? review?.login;
}

function reviewId(review, index) {
  return String(review?.id ?? review?.node_id ?? `review-${index}`);
}

function reviewCommit(review) {
  return review?.commit_id ?? review?.commitId ?? review?.commit?.sha;
}

function reviewHash(review) {
  return review?.plan_hash ?? review?.planHash;
}

function identityMatches(review, users) {
  const login = reviewLogin(review);
  if (!login || !review?.user?.id || !Array.isArray(users)) return false;
  const identity = users.find((user) => user?.login === login);
  return Boolean(identity && String(identity.id) === String(review.user.id));
}

function reviewTime(review) {
  return Date.parse(review?.submitted_at ?? review?.submittedAt ?? "") || 0;
}

export function verifyCodeownersApproval({ repository, planCommit, planHash, riskFlags = [], githubApi } = {}) {
  const errors = [];
  const rejected = [];
  if (!SHA1.test(String(planCommit ?? ""))) errors.push("planCommit must be a SHA-1");
  if (!SHA256.test(String(planHash ?? ""))) errors.push("planHash must be a SHA-256");
  const actualRepository = repositoryName(githubApi?.repository ?? githubApi?.repo);
  if (!repository || !actualRepository || repository !== actualRepository) errors.push("repository does not match exactly");

  const flags = list(riskFlags).map(String);
  const highRisk = flags.filter((flag) => HIGH_RISK.has(flag));
  const owners = codeownersFor(githubApi?.codeowners ?? githubApi?.codeownersByRisk, highRisk.length ? highRisk : flags);
  const users = list(githubApi?.users ?? githubApi?.identities);
  const reviews = list(githubApi?.reviews ?? githubApi?.pullRequestReviews);
  const latestByAuthor = new Map();
  for (const [index, review] of reviews.entries()) {
    const id = reviewId(review, index);
    const login = reviewLogin(review);
    const structurallyValid = identityMatches(review, users) && owners.has(login) && reviewCommit(review) === planCommit && (!reviewHash(review) || reviewHash(review) === planHash);
    if (!structurallyValid) {
      rejected.push(id);
      continue;
    }
    const previous = latestByAuthor.get(login);
    if (previous && reviewTime(review) >= reviewTime(previous.review)) rejected.push(previous.id);
    if (review?.state !== "APPROVED") {
      rejected.push(id);
      latestByAuthor.set(login, { id, review });
      continue;
    }
    if (!previous || reviewTime(review) >= reviewTime(previous.review)) latestByAuthor.set(login, { id, review });
  }
  const approved = [...latestByAuthor.values()].filter(({ review }) => review?.state === "APPROVED");
  const approvedIds = approved.map(({ id }) => id).sort();
  const required = highRisk.length ? 2 : 1;
  if (approvedIds.length < required) errors.push(`${required} distinct authorized approval(s) required`);
  if (rejected.length > 0 && approvedIds.length < required) errors.push("one or more reviews were rejected");
  return {
    ok: errors.length === 0,
    errors,
    approved_review_ids: approvedIds,
    rejected_review_ids: uniqueSorted(rejected),
    authorized_reviewers: approved.map(({ review }) => reviewLogin(review)).sort(),
    required_approvals: required,
    repository,
    plan_commit: planCommit,
    plan_hash: planHash,
  };
}
