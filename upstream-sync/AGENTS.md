# DOX — upstream-sync

The mutable, repository-owned upstream sync ledger lives at `ledger/obligations.json`. It is the canonical review record and is intentionally outside the installable `.pi/skills/omp-dashboard-upstream-sync/` tree. Keep stable obligation IDs, provenance, proof paths, scope, dependency roots, owners, expiry, and recheck triggers intact when revising records. Requests, assessments, plans, approvals, and fixture results remain repository artifacts and are never copied to the managed runtime skill directory.

| File | Purpose |
|------|---------|
| `ledger/obligations.json` | Versioned accepted behavior obligations consumed by sync contract validators. |
