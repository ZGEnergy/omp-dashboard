/**
 * Tests for package management REST routes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerPackageRoutes } from "../routes/package-routes.js";
import { PackageOperationBusyError } from "../package-manager-wrapper.js";

// Mock pi dependency (pulled transitively by package-manager-wrapper)
vi.mock("@mariozechner/pi-coding-agent", () => ({
  DefaultPackageManager: function() { return {}; },
  SettingsManager: { create: () => ({}) },
}));

// Mock npm-search-proxy
vi.mock("../npm-search-proxy.js", () => ({
  searchPackages: vi.fn().mockResolvedValue({ packages: [{ name: "pi-doom", types: ["extension"] }], total: 1 }),
  fetchReadme: vi.fn().mockResolvedValue({ readme: "# Test", name: "pi-doom", version: "1.0.0" }),
  PackageNotFoundError: class PackageNotFoundError extends Error {
    constructor(name: string) { super(`Package not found: ${name}`); this.name = "PackageNotFoundError"; }
  },
}));

import { searchPackages, fetchReadme, PackageNotFoundError } from "../npm-search-proxy.js";

function createMockWrapper() {
  return {
    run: vi.fn().mockResolvedValue("op-123"),
    listInstalled: vi.fn().mockReturnValue([{ source: "npm:pi-doom", scope: "user", filtered: false }]),
    checkUpdates: vi.fn().mockResolvedValue([]),
    isBusy: vi.fn().mockReturnValue(false),
    setProgressListener: vi.fn(),
    setCompleteListener: vi.fn(),
    setReloadSessions: vi.fn(),
  } as any;
}

describe("package-routes", () => {
  let app: FastifyInstance;
  let wrapper: ReturnType<typeof createMockWrapper>;

  beforeEach(async () => {
    vi.clearAllMocks();
    wrapper = createMockWrapper();
    app = Fastify();
    registerPackageRoutes(app, { packageManagerWrapper: wrapper });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/packages/search", () => {
    it("returns search results", async () => {
      const res = await app.inject({ method: "GET", url: "/api/packages/search?q=doom" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.packages[0].name).toBe("pi-doom");
    });

    it("passes type filter", async () => {
      await app.inject({ method: "GET", url: "/api/packages/search?type=extension" });
      expect(searchPackages).toHaveBeenCalledWith({ query: undefined, type: "extension" });
    });
  });

  describe("GET /api/packages/readme", () => {
    it("returns readme", async () => {
      const res = await app.inject({ method: "GET", url: "/api/packages/readme?pkg=pi-doom" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data.readme).toBe("# Test");
    });

    it("returns 400 without pkg param", async () => {
      const res = await app.inject({ method: "GET", url: "/api/packages/readme" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for missing package", async () => {
      vi.mocked(fetchReadme).mockRejectedValueOnce(new PackageNotFoundError("x"));
      const res = await app.inject({ method: "GET", url: "/api/packages/readme?pkg=x" });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/packages/installed", () => {
    it("returns installed packages", async () => {
      const res = await app.inject({ method: "GET", url: "/api/packages/installed?scope=global" });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[0].source).toBe("npm:pi-doom");
    });
  });

  describe("POST /api/packages/install", () => {
    it("returns 202 with operationId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/install",
        payload: { source: "npm:test", scope: "global" },
      });
      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body);
      expect(body.data.operationId).toBe("op-123");
    });

    it("returns 400 without source", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/install",
        payload: { scope: "global" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 409 when busy", async () => {
      wrapper.run.mockRejectedValueOnce(new PackageOperationBusyError());
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/install",
        payload: { source: "npm:test", scope: "global" },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe("POST /api/packages/remove", () => {
    it("returns 202", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/remove",
        payload: { source: "npm:test", scope: "local", cwd: "/tmp" },
      });
      expect(res.statusCode).toBe(202);
      expect(wrapper.run).toHaveBeenCalledWith({
        action: "remove",
        source: "npm:test",
        scope: "local",
        cwd: "/tmp",
      });
    });
  });

  describe("POST /api/packages/update", () => {
    it("returns 202", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/update",
        payload: { scope: "global" },
      });
      expect(res.statusCode).toBe(202);
    });
  });

  describe("POST /api/packages/check-updates", () => {
    it("returns updates list", async () => {
      wrapper.checkUpdates.mockResolvedValueOnce([{ source: "npm:pi-doom", displayName: "pi-doom", type: "npm" }]);
      const res = await app.inject({
        method: "POST",
        url: "/api/packages/check-updates",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.data[0].source).toBe("npm:pi-doom");
    });
  });
});
