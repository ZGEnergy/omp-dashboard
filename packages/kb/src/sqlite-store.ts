// Default KbStore backend over node:sqlite (Node built-in; FTS5 verified).
// Zero runtime deps. Requires --experimental-sqlite on current Node.
// better-sqlite3 is a drop-in fallback behind the same KbStore interface.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk, FileState, GraphEdge, GraphNode, KbHit, KbStore, SearchOpts } from "./types.js";

const DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
  root UNINDEXED, path UNINDEXED, chunk_id UNINDEXED, doc_type UNINDEXED,
  parent_chunk_id UNINDEXED, level UNINDEXED, body_hash UNINDEXED,
  heading_path, heading, body,
  tokenize='porter unicode61'
);
CREATE TABLE IF NOT EXISTS files (
  root TEXT, path TEXT, mtime_ms REAL, sha256 TEXT,
  PRIMARY KEY (root, path)
);
CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY, type TEXT, name TEXT, path TEXT,
  UNIQUE(type, name)
);
CREATE TABLE IF NOT EXISTS edges (
  src INTEGER, dst INTEGER, rel TEXT, weight REAL DEFAULT 1,
  PRIMARY KEY (src, dst, rel)
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);
`;

// FTS5 query builder: OR the alphanumeric terms (recall + BM25 ranks).
function toMatch(q: string): string {
  const stop = new Set("the for and how what with you your does can from that this are into use using get set all a an of to in on is be as it or by at do".split(" "));
  const terms = (q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((t) => !stop.has(t));
  const kept = terms.length ? terms : (q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []);
  return kept.map((t) => `"${t}"`).join(" OR ");
}

export class SqliteFtsStore implements KbStore {
  private db: DatabaseSync;
  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode=WAL");
  }
  init() {
    this.db.exec(DDL);
  }
  begin() {
    this.db.exec("BEGIN");
  }
  commit() {
    this.db.exec("COMMIT");
  }
  rollback() {
    try {
      this.db.exec("ROLLBACK");
    } catch {}
  }
  close() {
    this.db.close();
  }

  getFileState(root: string, path: string): FileState | null {
    const r = this.db.prepare("SELECT mtime_ms, sha256 FROM files WHERE root=? AND path=?").get(root, path) as any;
    return r ? { mtimeMs: r.mtime_ms, sha256: r.sha256 } : null;
  }
  setFileState(root: string, path: string, s: FileState) {
    this.db.prepare("INSERT INTO files(root,path,mtime_ms,sha256) VALUES(?,?,?,?) ON CONFLICT(root,path) DO UPDATE SET mtime_ms=excluded.mtime_ms, sha256=excluded.sha256").run(root, path, s.mtimeMs, s.sha256);
  }
  listPaths(root: string): string[] {
    return (this.db.prepare("SELECT path FROM files WHERE root=?").all(root) as any[]).map((r) => r.path);
  }
  deleteByPath(root: string, path: string) {
    this.db.prepare("DELETE FROM chunks WHERE root=? AND path=?").run(root, path);
    // outbound edges originate from this file's nodes; prune nodes owned by path then dangling edges
    const owned = this.db.prepare("SELECT id FROM nodes WHERE path=?").all(path) as any[];
    for (const n of owned) this.db.prepare("DELETE FROM edges WHERE src=? OR dst=?").run(n.id, n.id);
    this.db.prepare("DELETE FROM nodes WHERE path=?").run(path);
    this.db.prepare("DELETE FROM files WHERE root=? AND path=?").run(root, path);
  }

  insertChunk(c: Chunk) {
    this.db
      .prepare("INSERT INTO chunks(root,path,chunk_id,doc_type,parent_chunk_id,level,body_hash,heading_path,heading,body) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(c.root, c.path, c.chunkId, c.docType, c.parentChunkId, c.level, c.bodyHash, c.headingPath, c.heading, c.body);
  }
  addNode(n: GraphNode) {
    this.db.prepare("INSERT INTO nodes(type,name,path) VALUES(?,?,?) ON CONFLICT(type,name) DO UPDATE SET path=COALESCE(excluded.path, nodes.path)").run(n.type, n.name, n.path);
  }
  addEdge(e: GraphEdge) {
    const src = this.db.prepare("SELECT id FROM nodes WHERE name=? LIMIT 1").get(e.src) as any;
    const dst = this.db.prepare("SELECT id FROM nodes WHERE name=? LIMIT 1").get(e.dst) as any;
    if (!src || !dst) return;
    this.db.prepare("INSERT OR IGNORE INTO edges(src,dst,rel,weight) VALUES(?,?,?,?)").run(src.id, dst.id, e.rel, e.weight ?? 1);
  }

  search(query: string, opts: SearchOpts = {}): KbHit[] {
    const m = toMatch(query);
    if (!m) return [];
    const w = opts.fieldWeights ?? { headingPath: 8, heading: 4, body: 1 };
    const limit = opts.limit ?? 10;
    const fetch = opts.dedup === false ? limit : limit * 3; // overfetch for dedup
    const where: string[] = ["chunks MATCH ?"];
    const args: any[] = [m];
    if (opts.root) {
      where.push("root = ?");
      args.push(opts.root);
    }
    if (opts.docType) {
      where.push("doc_type = ?");
      args.push(opts.docType);
    }
    // bm25 weights: one per column in declared order (UNINDEXED cols = 0)
    const sql = `SELECT root, path, chunk_id chunkId, doc_type docType, body_hash bodyHash, heading_path headingPath,
      bm25(chunks, 0,0,0,0,0,0,0, ${w.headingPath}, ${w.heading}, ${w.body}) score,
      snippet(chunks, 9, '[', ']', ' … ', 12) snippet
      FROM chunks WHERE ${where.join(" AND ")} ORDER BY score LIMIT ${fetch}`;
    const rows = this.db.prepare(sql).all(...args) as any[];

    if (opts.dedup === false) return rows.map(stripHash).slice(0, limit);
    // exact-content dedup: collapse rows sharing body_hash, keep best-ranked, record aka_paths
    const seen = new Map<string, KbHit>();
    const out: KbHit[] = [];
    for (const r of rows) {
      const prev = seen.get(r.bodyHash);
      if (prev) {
        (prev.akaPaths ??= []).push(r.path);
        continue;
      }
      const hit = stripHash(r);
      seen.set(r.bodyHash, hit);
      out.push(hit);
      if (out.length >= limit) break;
    }
    return out;
  }

  neighbors(node: string, depth: number, rel?: GraphEdge["rel"]): GraphNode[] {
    const relClause = rel ? "AND e.rel = :rel" : "";
    const sql = `
      WITH RECURSIVE reach(id, d) AS (
        SELECT id, 0 FROM nodes WHERE name = :name
        UNION
        SELECT e.dst, r.d+1 FROM edges e JOIN reach r ON e.src = r.id
        WHERE r.d < :depth ${relClause}
      )
      SELECT DISTINCT n.type, n.name, n.path FROM reach JOIN nodes n USING(id) WHERE n.name != :name`;
    const params: any = { name: node, depth };
    if (rel) params.rel = rel;
    return (this.db.prepare(sql).all(params) as any[]).map((r) => ({ type: r.type, name: r.name, path: r.path }));
  }
  backlinks(node: string): GraphNode[] {
    const sql = `SELECT DISTINCT n.type, n.name, n.path FROM edges e
      JOIN nodes t ON e.dst = t.id JOIN nodes n ON e.src = n.id WHERE t.name = ?`;
    return (this.db.prepare(sql).all(node) as any[]).map((r) => ({ type: r.type, name: r.name, path: r.path }));
  }
  getChunk(root: string, path: string, headingPath?: string): Chunk | null {
    const sql = headingPath
      ? "SELECT * FROM chunks WHERE root=? AND path=? AND heading_path=? LIMIT 1"
      : "SELECT * FROM chunks WHERE root=? AND path=? ORDER BY rowid LIMIT 1";
    const r = (headingPath ? this.db.prepare(sql).get(root, path, headingPath) : this.db.prepare(sql).get(root, path)) as any;
    if (!r) return null;
    return { root: r.root, path: r.path, chunkId: r.chunk_id, headingPath: r.heading_path, heading: r.heading, level: r.level, parentChunkId: r.parent_chunk_id, docType: r.doc_type, body: r.body, bodyHash: r.body_hash };
  }
  counts() {
    const c = (q: string) => (this.db.prepare(q).get() as any).n as number;
    return {
      files: c("SELECT COUNT(*) n FROM files"),
      chunks: c("SELECT COUNT(*) n FROM chunks"),
      nodes: c("SELECT COUNT(*) n FROM nodes"),
      edges: c("SELECT COUNT(*) n FROM edges"),
    };
  }
}

function stripHash(r: any): KbHit {
  return { root: r.root, path: r.path, headingPath: r.headingPath, chunkId: r.chunkId, docType: r.docType, score: r.score, snippet: r.snippet };
}
