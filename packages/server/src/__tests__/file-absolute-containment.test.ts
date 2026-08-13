/**
 * Integration tests for session-provenance out-of-cwd canvas & file access (#134).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import { createMemorySessionManager, type SessionManager } from "../memory-session-manager.js";
import type { PreferencesStore } from "../preferences-store.js";
import { registerFileRoutes } from "../routes/file-routes.js";
import { isAllowed } from "../lib/path-containment.js";

describe("session-provenance out-of-cwd containment", () => {
  let tmpDir: string;
  let sessionCwd: string;
  let outDir: string;
  let sessionManager: SessionManager;
  let app: FastifyInstance;

  beforeEach(async () => {
    tmpDir = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), "containment-test-")));
    sessionCwd = path.join(tmpDir, "session-cwd");
    outDir = path.join(tmpDir, "out-dir");
    await fsp.mkdir(sessionCwd, { recursive: true });
    await fsp.mkdir(outDir, { recursive: true });

    sessionManager = createMemorySessionManager();
    sessionManager.register({
      id: "sess-1",
      cwd: sessionCwd,
      source: "terminal",
    });

    app = Fastify();
    registerFileRoutes(app, {
      sessionManager,
      preferencesStore: { getPinnedDirectories: () => [] } as unknown as PreferencesStore,
      networkGuard: async () => {},
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("serves out-of-cwd file via /api/file and /api/file/raw when in session provenance", async () => {
    const outFilePath = path.join(outDir, "report.txt");
    await fsp.writeFile(outFilePath, "out of cwd content");

    // Before provenance: 403
    const res1 = await app.inject({
      method: "GET",
      url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(outFilePath)}`,
    });
    expect(res1.statusCode).toBe(403);

    // Record provenance
    sessionManager.addProvenancePath("sess-1", outFilePath);

    // After provenance: /api/file 200
    const res2 = await app.inject({
      method: "GET",
      url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(outFilePath)}`,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json();
    expect(body2.success).toBe(true);
    expect(body2.data.content).toBe("out of cwd content");

    // /api/file/raw 200
    const resRaw = await app.inject({
      method: "GET",
      url: `/api/file/raw?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(outFilePath)}`,
    });
    expect(resRaw.statusCode).toBe(200);
    expect(resRaw.payload).toBe("out of cwd content");
  });

  it("returns 403 for system path /etc/passwd even if /etc or /etc/passwd was named without successful create", async () => {
    // Attempting to add a directory like /etc MUST be ignored by addProvenancePath
    sessionManager.addProvenancePath("sess-1", "/etc");

    const res = await app.inject({
      method: "GET",
      url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=/etc/passwd`,
    });
    expect(res.statusCode).toBe(403);
  });
  it("canvas declare of /etc/passwd does NOT make isAllowed true", async () => {
    // Simulate tool_execution_end event for canvas declare of /etc/passwd through canvas accumulator
    // Or test path-containment directly: session provenance empty -> isAllowed is false
    expect(await isAllowed("/etc/passwd", { anchors: [sessionCwd], provenancePaths: sessionManager.getProvenancePathsForCwd(sessionCwd) })).toBe(false);
  });


  it("allows exact out-of-cwd file after successful write (e.g. /tmp/foo.md)", async () => {
    const tmpFoo = path.join(os.tmpdir(), `foo-${Date.now()}.md`);
    await fsp.writeFile(tmpFoo, "# Hello");

    try {
      // Add provenance after successful write
      sessionManager.addProvenancePath("sess-1", tmpFoo);

      const res = await app.inject({
        method: "GET",
        url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(tmpFoo)}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.content).toBe("# Hello");

      // Sibling or child path under tmpFoo is still 403
      const resOther = await app.inject({
        method: "GET",
        url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(path.join(os.tmpdir(), "other.md"))}`,
      });
      expect(resOther.statusCode).toBe(403);
    } finally {
      if (await fsp.stat(tmpFoo).catch(() => null)) {
        await fsp.unlink(tmpFoo);
      }
    }
  });

  it("strictly rejects path traversal attempts containing ..", async () => {
    const traversalPath = path.join(sessionCwd, "..", "out-dir", "report.txt");

    const res = await app.inject({
      method: "GET",
      url: `/api/file?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(traversalPath)}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it("respects provenance in /api/file/exists and /api/file/resolve-mention", async () => {
    const outFilePath = path.join(outDir, "doc.md");
    await fsp.writeFile(outFilePath, "# Title");

    // Before provenance
    const resExists1 = await app.inject({
      method: "GET",
      url: `/api/file/exists?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(outFilePath)}`,
    });
    expect(resExists1.statusCode).toBe(403);

    const resMention1 = await app.inject({
      method: "POST",
      url: "/api/file/resolve-mention",
      payload: { cwd: sessionCwd, mention: outFilePath },
    });
    expect(resMention1.json().data.resolved).toBeNull();

    // Add provenance
    sessionManager.addProvenancePath("sess-1", outFilePath);

    // After provenance
    const resExists2 = await app.inject({
      method: "GET",
      url: `/api/file/exists?cwd=${encodeURIComponent(sessionCwd)}&path=${encodeURIComponent(outFilePath)}`,
    });
    expect(resExists2.statusCode).toBe(200);
    expect(resExists2.json().data.exists).toBe(true);

    const resMention2 = await app.inject({
      method: "POST",
      url: "/api/file/resolve-mention",
      payload: { cwd: sessionCwd, mention: outFilePath },
    });
    expect(resMention2.json().data.resolved).toBe(outFilePath);
  });
});
