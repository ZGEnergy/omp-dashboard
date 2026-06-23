#!/usr/bin/env node
// kb CLI (Phase 1): index | search | neighbors | backlinks | get | config
// Run (dev): NODE_OPTIONS=--experimental-sqlite tsx src/cli.ts <cmd> ...
// Shipped bin builds to dist/cli.js (build step deferred).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig, type ResolvedConfig, type ResolvedSource } from "./config.js";
import { SqliteFtsStore } from "./sqlite-store.js";
import { indexSource } from "./indexer.js";
import { evaluate, type GoldenItem } from "./eval.js";
import type { DocType } from "./types.js";

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[];
}
function parse(argv: string[]): Flags {
  const f: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) f[key] = true;
      else {
        // collect repeatable --source
        if (key === "source") (f.source = ([] as string[]).concat((f.source as string[]) ?? [], next));
        else f[key] = next;
        i++;
      }
    } else f._.push(a);
  }
  return f;
}

function cfgFrom(flags: Flags): ResolvedConfig {
  const cwd = (flags.cwd as string) ?? process.cwd();
  const cfg = loadConfig(cwd, { configPath: flags.config as string | undefined });
  // --source <dir> (repeatable) overrides sources for ad-hoc use
  const srcs = flags.source as string[] | undefined;
  if (srcs?.length) {
    cfg.resolvedSources = srcs.map((s, i): ResolvedSource => ({ id: s, dir: resolve(cwd, s), priority: srcs.length - i }));
  }
  if (flags.db) cfg.dbAbsPath = resolve(cwd, flags.db as string);
  return cfg;
}

function openStore(cfg: ResolvedConfig): SqliteFtsStore {
  const store = new SqliteFtsStore(cfg.dbAbsPath);
  store.init();
  return store;
}
function runIndex(cfg: ResolvedConfig, store: SqliteFtsStore, force = false) {
  let scanned = 0, changed = 0, deleted = 0, chunks = 0;
  for (const s of cfg.resolvedSources) {
    const st = indexSource(store, { root: s.id, dir: s.dir }, { force, indexAgentsFiles: cfg.indexAgentsFiles });
    scanned += st.scanned; changed += st.changed; deleted += st.deleted; chunks += st.chunks;
  }
  return { scanned, changed, deleted, chunks };
}

const HELP = `kb — markdown knowledge base
Usage:
  kb index   [--source <dir>...] [--db <path>] [--force]
  kb search  "<query>" [--limit N] [--root id] [--doc-type doc|agents|source-md] [--json] [--no-reindex] [--source <dir>...] [--db <path>]
  kb neighbors "<node>" [--depth N] [--rel child_of|links_to|references|has_tag]
  kb backlinks "<node>"
  kb get <path> [--section "<heading_path>"]
  kb eval    --golden <file.json> [--limit N] [--doc-type ...] [--no-reindex]
  kb config   show resolved config
Global: --cwd <dir>  --config <file>`;

function main() {
  const flags = parse(process.argv.slice(2));
  const cmd = flags._[0];
  if (!cmd || cmd === "help" || flags.help) {
    console.log(HELP);
    return;
  }
  if (cmd === "config") {
    const cfg = cfgFrom(flags);
    console.log(JSON.stringify({ origin: cfg.origin, dbAbsPath: cfg.dbAbsPath, sources: cfg.resolvedSources, maxFileCount: cfg.maxFileCount, indexAgentsFiles: cfg.indexAgentsFiles }, null, 2));
    return;
  }

  const cfg = cfgFrom(flags);
  if (!cfg.resolvedSources.length && cmd === "index") {
    console.error("no sources configured. add sources[] to .pi/dashboard/knowledge_base.json or pass --source <dir>");
    process.exit(2);
  }
  const store = openStore(cfg);
  try {
    if (cmd === "index") {
      const t = performance.now();
      const s = runIndex(cfg, store, !!flags.force);
      console.log(`indexed ${s.scanned} files (${s.changed} changed, ${s.deleted} deleted, ${s.chunks} chunks) in ${(performance.now() - t).toFixed(0)}ms`);
      console.log(JSON.stringify(store.counts()));
    } else if (cmd === "search") {
      const q = flags._[1];
      if (!q) { console.error("search needs a query"); process.exit(2); }
      if (!flags["no-reindex"]) runIndex(cfg, store); // auto incremental freshness
      const hits = store.search(q, {
        limit: flags.limit ? Number(flags.limit) : 10,
        root: flags.root as string | undefined,
        docType: flags["doc-type"] as DocType | undefined,
      });
      if (flags.json) console.log(JSON.stringify(hits, null, 2));
      else for (const h of hits) console.log(`${h.score.toFixed(2)}  ${h.path}  ::  ${h.headingPath}${h.akaPaths ? `  (+${h.akaPaths.length} dup)` : ""}\n      ${h.snippet.replace(/\s+/g, " ").slice(0, 160)}`);
    } else if (cmd === "neighbors") {
      const n = store.neighbors(flags._[1], flags.depth ? Number(flags.depth) : 2, flags.rel as any);
      console.log(flags.json ? JSON.stringify(n, null, 2) : n.map((x) => `${x.type}\t${x.name}`).join("\n"));
    } else if (cmd === "backlinks") {
      const n = store.backlinks(flags._[1]);
      console.log(flags.json ? JSON.stringify(n, null, 2) : n.map((x) => `${x.type}\t${x.name}`).join("\n"));
    } else if (cmd === "get") {
      const c = store.getChunk(cfg.resolvedSources[0]?.id ?? "", flags._[1], flags.section as string | undefined);
      console.log(c ? c.body : `(not found: ${flags._[1]})`);
    } else if (cmd === "eval") {
      const gf = flags.golden as string | undefined;
      if (!gf) { console.error("eval needs --golden <file.json>"); process.exit(2); }
      if (!flags["no-reindex"]) runIndex(cfg, store);
      const golden = JSON.parse(readFileSync(resolve(cfg.cwd, gf), "utf8")) as GoldenItem[];
      const m = evaluate(store, golden, { k: flags.limit ? Number(flags.limit) : 10, docType: flags["doc-type"] as DocType | undefined });
      console.log(JSON.stringify(m, null, flags.json ? 2 : 0));
    } else {
      console.error(`unknown command: ${cmd}\n\n${HELP}`);
      process.exit(2);
    }
  } finally {
    store.close();
  }
}

main();
