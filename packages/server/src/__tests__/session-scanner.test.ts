import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { scanAllSessions } from "../session-scanner.js";
import { metaPath, writeSessionMeta } from "@blackbelt-technology/pi-dashboard-shared/session-meta.js";

// Mock extractSessionStats to avoid needing real JSONL content with usage data
vi.mock("../session-stats-reader.js", () => ({
  extractSessionStats: vi.fn(() => ({
    tokensIn: 10,
    tokensOut: 20,
    cacheRead: 30,
    cacheWrite: 40,
    cost: 0.5,
    lastTotalTokens: 1000,
    contextWindow: 200000,
    model: "anthropic/claude-sonnet-4-20250514",
    thinkingLevel: "medium",
  })),
}));

describe("session-scanner", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createSessionDir(cwdEncoded: string): string {
    const dir = path.join(tmpDir, cwdEncoded);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function createJsonl(dir: string, filename: string, header?: { id: string; cwd: string }): string {
    const filePath = path.join(dir, filename);
    const h = header ?? { id: "test-id", cwd: "/test/cwd" };
    const lines = [
      JSON.stringify({ type: "session", id: h.id, cwd: h.cwd, timestamp: "2026-03-30T21:39:43.034Z" }),
      JSON.stringify({ type: "message", message: { role: "user", content: "Hello world" } }),
    ];
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
    return filePath;
  }

  it("should return empty for non-existent directory", () => {
    const result = scanAllSessions("/non/existent/path");
    expect(result.sessions).toEqual([]);
    expect(result.cacheUpdates).toBe(0);
  });

  it("should return empty for empty sessions directory", () => {
    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toEqual([]);
  });

  it("should discover session from .meta.json with cached data", () => {
    const dir = createSessionDir("--test-cwd--");
    const sf = createJsonl(dir, "2026-03-30T21-39-43-034Z_abc-123.jsonl", { id: "abc-123", cwd: "/test/cwd" });
    writeSessionMeta(sf, {
      cwd: "/test/cwd",
      name: "My Session",
      source: "dashboard",
      status: "ended",
      startedAt: 1000,
      cost: 5.0,
      tokensIn: 100,
      tokensOut: 200,
      cachedAt: Date.now() + 10000, // far future = fresh cache
    });

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("abc-123");
    expect(result.sessions[0].cwd).toBe("/test/cwd");
    expect(result.sessions[0].name).toBe("My Session");
    expect(result.sessions[0].cost).toBe(5.0);
    expect(result.cacheUpdates).toBe(0); // no re-extraction needed
  });

  it("should fall back to .jsonl parsing when no .meta.json exists", () => {
    const dir = createSessionDir("--test-cwd--");
    createJsonl(dir, "2026-03-30T21-39-43-034Z_def-456.jsonl", { id: "def-456", cwd: "/fallback/cwd" });

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe("def-456");
    expect(result.sessions[0].cwd).toBe("/fallback/cwd");
    expect(result.sessions[0].firstMessage).toBe("Hello world");
    expect(result.cacheUpdates).toBe(1); // wrote new .meta.json
  });

  it("should write .meta.json for uncached sessions", () => {
    const dir = createSessionDir("--test-cwd--");
    const sf = createJsonl(dir, "2026-03-30T21-39-43-034Z_ghi-789.jsonl", { id: "ghi-789", cwd: "/new/cwd" });

    scanAllSessions(tmpDir);

    // .meta.json should now exist
    expect(fs.existsSync(metaPath(sf))).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath(sf), "utf-8"));
    expect(meta.cwd).toBe("/new/cwd");
    expect(meta.cachedAt).toBeGreaterThan(0);
  });

  it("should ignore orphaned .meta.json without .jsonl", () => {
    const dir = createSessionDir("--test-cwd--");
    // Write .meta.json without a corresponding .jsonl
    const orphanedMeta = path.join(dir, "2026-03-30T21-39-43-034Z_orphan-id.meta.json");
    fs.writeFileSync(orphanedMeta, JSON.stringify({ cwd: "/ghost", source: "dashboard" }));

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(0);
  });

  it("should extract session ID from filename", () => {
    const dir = createSessionDir("--test-cwd--");
    createJsonl(dir, "2026-03-30T21-39-43-034Z_c7ab4be9-78d1-4764-8197-dbf74fea8bf4.jsonl", {
      id: "c7ab4be9-78d1-4764-8197-dbf74fea8bf4",
      cwd: "/test",
    });
    writeSessionMeta(
      path.join(dir, "2026-03-30T21-39-43-034Z_c7ab4be9-78d1-4764-8197-dbf74fea8bf4.jsonl"),
      { cwd: "/test", cachedAt: Date.now() + 10000 },
    );

    const result = scanAllSessions(tmpDir);
    expect(result.sessions[0].id).toBe("c7ab4be9-78d1-4764-8197-dbf74fea8bf4");
  });

  it("should re-extract stats when .jsonl is newer than cachedAt", () => {
    const dir = createSessionDir("--test-cwd--");
    const sf = createJsonl(dir, "2026-03-30T21-39-43-034Z_stale-id.jsonl", { id: "stale-id", cwd: "/stale" });

    // Write meta with old cachedAt
    writeSessionMeta(sf, {
      cwd: "/stale",
      cost: 1.0,
      cachedAt: 1000, // very old
    });

    // Touch the .jsonl to make it newer
    const now = new Date();
    fs.utimesSync(sf, now, now);

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(1);
    // Stats should come from mock extractSessionStats (cost=0.5), not cached (cost=1.0)
    expect(result.sessions[0].cost).toBe(0.5);
    expect(result.cacheUpdates).toBe(1);
  });

  it("should scan multiple cwd directories", () => {
    const dir1 = createSessionDir("--project-a--");
    const dir2 = createSessionDir("--project-b--");
    createJsonl(dir1, "2026-03-30T21-39-43-034Z_id-a.jsonl", { id: "id-a", cwd: "/project/a" });
    createJsonl(dir2, "2026-03-30T21-39-43-034Z_id-b.jsonl", { id: "id-b", cwd: "/project/b" });

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(2);
    const ids = result.sessions.map((s) => s.id).sort();
    expect(ids).toEqual(["id-a", "id-b"]);
  });

  it("should preserve existing meta fields when falling back to .jsonl", () => {
    const dir = createSessionDir("--test-cwd--");
    const sf = createJsonl(dir, "2026-03-30T21-39-43-034Z_preserve-id.jsonl", { id: "preserve-id", cwd: "/test" });

    // Write partial meta (source only, no cwd — triggers fallback)
    writeSessionMeta(sf, { source: "dashboard" });

    const result = scanAllSessions(tmpDir);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].source).toBe("dashboard");

    // Check the written meta preserved source
    const meta = JSON.parse(fs.readFileSync(metaPath(sf), "utf-8"));
    expect(meta.source).toBe("dashboard");
    expect(meta.cwd).toBe("/test");
  });

  it("should set hidden from meta", () => {
    const dir = createSessionDir("--test-cwd--");
    const sf = createJsonl(dir, "2026-03-30T21-39-43-034Z_hidden-id.jsonl", { id: "hidden-id", cwd: "/test" });
    writeSessionMeta(sf, {
      cwd: "/test",
      hidden: true,
      cachedAt: Date.now() + 10000,
    });

    const result = scanAllSessions(tmpDir);
    expect(result.sessions[0].hidden).toBe(true);
  });
});
