import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkMarkdown } from "../chunker.js";
import { SqliteFtsStore } from "../sqlite-store.js";
import { indexSource } from "../indexer.js";
import { loadConfig } from "../config.js";
import { evaluate } from "../eval.js";

describe("chunker", () => {
  it("splits on headings and builds breadcrumb", () => {
    const text =
      "# Top\nintro paragraph comfortably longer than the hundred character minimum threshold so it stays its own chunk for sure here.\n" +
      "## Sub\nsub-section body also comfortably longer than the hundred character minimum threshold so it remains a distinct separate chunk.";
    const { chunks } = chunkMarkdown({ root: "r", path: "a.md", text });
    const sub = chunks.find((c) => c.heading === "Sub");
    expect(sub).toBeTruthy();
    expect(sub!.headingPath).toBe("Top > Sub");
    expect(sub!.level).toBe(2);
  });

  it("never treats a # inside a fenced code block as a heading", () => {
    const text = "# Real\nprose long enough to keep this chunk alive after merge thresholds apply here.\n\n```sh\n# not a heading\necho hi\n```\nmore prose that is also sufficiently long to remain its own content body.";
    const { chunks } = chunkMarkdown({ root: "r", path: "b.md", text });
    expect(chunks.every((c) => c.heading !== "not a heading")).toBe(true);
    // the fence content stays inside the Real section
    expect(chunks.some((c) => c.body.includes("# not a heading"))).toBe(true);
  });

  it("extracts wikilinks and md links", () => {
    const { wikilinks, mdLinks } = chunkMarkdown({ root: "r", path: "c.md", text: "see [[Other Note]] and [x](./sub/y.md)" });
    expect(wikilinks).toContain("Other Note");
    expect(mdLinks).toContain("./sub/y.md");
  });
});

describe("indexer + store (integration)", () => {
  let dir: string;
  let dbPath: string;
  let store: SqliteFtsStore;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "kb-it-"));
    const AUTH =
      "# Auth Guide\nThis guide explains how authentication works including the interceptor and principal resolution flow in enough detail to exceed the merge threshold.\n" +
      "## Token Extraction\nExtract claims from the bearer token to identify the principal user account; this body is long enough to remain its own dedicated chunk for testing.";
    writeFileSync(join(dir, "auth.md"), AUTH);
    writeFileSync(
      join(dir, "theme.md"),
      "# Theming\nThe theming system controls palette and typography across light and dark variants with enough descriptive text to exceed the tiny-chunk merge threshold here.\n" +
        "## Dark Mode\nChange the dark palette colors in the generated theme file for a night appearance; this section is intentionally verbose to remain a separate chunk.",
    );
    // exact duplicate of auth.md in a sub-tree → dedup target
    mkdirSync(join(dir, "copy"), { recursive: true });
    writeFileSync(join(dir, "copy/auth.md"), AUTH);
    dbPath = join(dir, ".kb.db");
    store = new SqliteFtsStore(dbPath);
    store.init();
  });
  afterAll(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("indexes and searches", () => {
    const s = indexSource(store, { root: "t", dir });
    expect(s.changed).toBe(3);
    const hits = store.search("extract claims from token", { limit: 5 });
    expect(hits[0].path).toMatch(/auth\.md$/);
    expect(hits[0].headingPath).toContain("Token Extraction");
  });

  it("collapses exact-content duplicates with akaPaths", () => {
    const hits = store.search("extract claims principal account", { limit: 5 });
    const top = hits.find((h) => h.path.endsWith("auth.md"));
    expect(top?.akaPaths?.length).toBeGreaterThanOrEqual(1);
  });

  it("incremental: re-index is a no-op when nothing changed", () => {
    const s = indexSource(store, { root: "t", dir });
    expect(s.changed).toBe(0);
    expect(s.deleted).toBe(0);
  });

  it("incremental: editing one file reindexes only that file", () => {
    writeFileSync(
      join(dir, "theme.md"),
      "# Theming\nThe theming system controls palette and typography across light and dark variants with enough descriptive text to exceed the tiny-chunk merge threshold here.\n" +
        "## Dark Mode\nUpdated: tweak the dark palette and add a high-contrast variant for accessibility; verbose enough to remain a distinct chunk after the edit reindex.",
    );
    const s = indexSource(store, { root: "t", dir });
    expect(s.changed).toBe(1);
    expect(store.search("high-contrast variant accessibility", { limit: 3 })[0].path).toMatch(/theme\.md$/);
  });

  it("incremental: deleting a file purges its rows", () => {
    rmSync(join(dir, "theme.md"));
    const s = indexSource(store, { root: "t", dir });
    expect(s.deleted).toBe(1);
    const hits = store.search("dark palette night appearance", { limit: 5 });
    expect(hits.every((h) => !h.path.endsWith("theme.md"))).toBe(true);
  });

  it("graph: child_of neighbors reach the parent section", () => {
    const nbrs = store.neighbors("Auth Guide > Token Extraction", 2);
    expect(nbrs.some((n) => n.name.includes("Auth Guide"))).toBe(true);
  });

  it("eval: golden harness reports metrics", () => {
    const m = evaluate(store, [{ q: "extract claims principal account token", expect: "auth.md" }], { k: 10 });
    expect(m.n).toBe(1);
    expect(m["P@1"]).toBe(1);
    expect(m["Recall@K"]).toBe(1);
    expect(m.MRR).toBe(1);
  });
});

describe("config layering", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "kb-cfg-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("defaults when no project/global config (no file cap)", () => {
    const cfg = loadConfig(dir, { configPath: join(dir, "missing.json") });
    expect(cfg.maxFileCount).toBeNull();
    expect(cfg.include).toContain("**/*.md");
    expect(cfg.dbPath).toContain(".pi/dashboard/kb/index.db");
  });

  it("project config fills absent fields from defaults; legacy roots[] → sources", () => {
    const p = join(dir, "kb.json");
    writeFileSync(p, JSON.stringify({ roots: [{ path: "docs", priority: 5 }], trigram: true }));
    const cfg = loadConfig(dir, { configPath: p });
    expect(cfg.origin).toBe("project");
    expect(cfg.trigram).toBe(true); // from project
    expect(cfg.maxFileCount).toBeNull(); // filled from defaults
    expect(cfg.resolvedSources[0].id).toBe("docs");
    expect(cfg.resolvedSources[0].priority).toBe(5);
    expect(cfg.resolvedSources[0].dir).toContain("/docs");
  });

  it("absolute dbPath honored; relative resolved against cwd", () => {
    const p = join(dir, "kb2.json");
    writeFileSync(p, JSON.stringify({ sources: [{ kind: "filesystem", ref: "/abs/docs" }], dbPath: "custom/index.db" }));
    const cfg = loadConfig(dir, { configPath: p });
    expect(cfg.resolvedSources[0].dir).toBe("/abs/docs");
    expect(cfg.dbAbsPath).toBe(join(dir, "custom/index.db"));
  });
});
