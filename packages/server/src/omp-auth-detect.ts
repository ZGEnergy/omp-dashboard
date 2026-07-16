/**
 * Detect which LLM providers omp has authenticated, from omp's SQLite credential
 * store (`$PI_CODING_AGENT_DIR/agent.db`, table `auth_credentials`).
 *
 * omp keeps credentials in SQLite, NOT in `~/.pi/agent/auth.json`, so the
 * pi-shaped provider-auth check (`provider-auth-storage.ts`) can't see them.
 * This bridges the gap so the onboarding "providers ready" gate reflects omp's
 * real credentials instead of an empty pi store.
 *
 * Read-only. Never reads the secret `data` column. Never throws — any failure
 * (missing db, node:sqlite unavailable, unexpected schema) yields an empty set,
 * so the gate degrades to "no omp credentials" instead of crashing the endpoint.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);

// node:sqlite is a Node builtin (experimental on 22.x — usable without a flag).
// Typed locally so we don't depend on @types/node exposing it.
interface OmpProviderRow {
  provider: string;
}
interface OmpDatabase {
  prepare(sql: string): { all(): OmpProviderRow[] };
  close(): void;
}
interface NodeSqlite {
  DatabaseSync: new (filename: string, options?: { readOnly?: boolean }) => OmpDatabase;
}

/**
 * Provider ids with an active (non-disabled) credential in omp's SQLite vault.
 * Returns an empty set when omp isn't installed/authenticated, `PI_CODING_AGENT_DIR`
 * is unset, or the store is unreadable.
 */
export function ompAuthedProviderIds(
  agentDir: string | undefined = process.env.PI_CODING_AGENT_DIR,
): Set<string> {
  if (!agentDir) return new Set();
  const dbPath = path.join(agentDir, "agent.db");
  if (!existsSync(dbPath)) return new Set();
  try {
    const { DatabaseSync } = _require("node:sqlite") as NodeSqlite;
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          "SELECT DISTINCT provider FROM auth_credentials WHERE disabled_cause IS NULL AND provider IS NOT NULL",
        )
        .all();
      return new Set(rows.map((r) => r.provider).filter(Boolean));
    } finally {
      db.close();
    }
  } catch {
    return new Set();
  }
}
