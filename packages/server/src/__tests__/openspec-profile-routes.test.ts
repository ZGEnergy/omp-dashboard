/**
 * HTTP-level tests for the OpenSpec profile-config endpoints added in
 * change: add-openspec-profile-settings:
 *   POST /api/openspec/config
 *   POST /api/openspec/update
 *   GET  /api/openspec/update-status
 *
 * The shared platform/openspec module is mocked so no real `openspec` CLI
 * runs and no global config file is touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { registerOpenSpecRoutes } from "../routes/openspec-routes.js";

const PASSTHRU_GUARD = async () => {};

// Mutable mock state, reset per test.
const mock = {
  configProfile: vi.fn(),
  update: vi.fn(),
  writeOpenSpecConfigFile: vi.fn(),
  globalWorkflows: ["propose", "explore", "apply", "archive"] as string[],
};

vi.mock("@blackbelt-technology/pi-dashboard-shared/platform/openspec.js", () => ({
  configListOr: () => ({ workflows: mock.globalWorkflows }),
  configProfile: (...a: any[]) => mock.configProfile(...a),
  update: (...a: any[]) => mock.update(...a),
  writeOpenSpecConfigFile: (...a: any[]) => mock.writeOpenSpecConfigFile(...a),
  // Real signature semantics so staleness assertions are meaningful.
  workflowSetSignature: (wf: string[]) =>
    Array.from(new Set(wf.map((w) => w.trim()).filter(Boolean))).sort().join("|"),
  EXPANDED_WORKFLOWS: [
    "propose", "explore", "new", "continue", "ff",
    "apply", "verify", "sync", "archive", "bulk-archive", "onboard",
  ],
  CORE_WORKFLOWS: ["propose", "explore", "apply", "archive"],
}));

describe("openspec profile-config REST routes", () => {
  let fastify: FastifyInstance;
  let signatures: Record<string, string>;
  let sessionCwds: string[];
  let pinnedDirs: string[];

  beforeEach(() => {
    mock.configProfile.mockReset().mockReturnValue({ ok: true, value: "" });
    mock.update.mockReset().mockReturnValue({ ok: true, value: "" });
    mock.writeOpenSpecConfigFile.mockReset().mockReturnValue({ success: true });
    mock.globalWorkflows = ["propose", "explore", "apply", "archive"];
    signatures = {};
    sessionCwds = ["/proj/a"];
    pinnedDirs = ["/proj/b"];
  });

  afterEach(async () => {
    if (fastify) await fastify.close();
  });

  async function setup() {
    fastify = Fastify();
    registerOpenSpecRoutes(fastify, {
      sessionManager: { listAll: () => sessionCwds.map((cwd) => ({ cwd })) } as any,
      preferencesStore: {
        getPinnedDirectories: () => pinnedDirs,
        getOpenSpecUpdateSignature: (cwd: string) => signatures[cwd],
        setOpenSpecUpdateSignature: (cwd: string, sig: string) => { signatures[cwd] = sig; },
      } as any,
      directoryService: { refreshOpenSpec: vi.fn(), getOpenSpecData: vi.fn() } as any,
      networkGuard: PASSTHRU_GUARD,
    });
    await fastify.ready();
  }

  // ── POST /api/openspec/config ──────────────────────────────────────

  it("core profile uses the CLI preset, not a JSON write", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/config",
      payload: { profile: "core", workflows: ["propose", "explore", "apply", "archive"], cwd: "/proj/a" },
    });
    expect(res.statusCode).toBe(200);
    expect(mock.configProfile).toHaveBeenCalledWith(expect.objectContaining({ preset: "core" }));
    expect(mock.writeOpenSpecConfigFile).not.toHaveBeenCalled();
  });

  it("expanded profile writes JSON with profile 'expanded' and the 11-workflow set", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/config",
      payload: { profile: "expanded", workflows: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(mock.writeOpenSpecConfigFile).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "expanded" }),
    );
    const arg = mock.writeOpenSpecConfigFile.mock.calls[0][0];
    expect(arg.workflows).toHaveLength(11);
    expect(arg.workflows).toContain("verify");
    expect(mock.configProfile).not.toHaveBeenCalled();
  });

  it("custom profile writes the supplied subset", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/config",
      payload: { profile: "custom", workflows: ["propose", "apply", "archive"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mock.writeOpenSpecConfigFile).toHaveBeenCalledWith({
      profile: "custom", workflows: ["propose", "apply", "archive"],
    });
  });

  it("rejects an invalid profile", async () => {
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/config",
      payload: { profile: "bogus" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 500 when the JSON write fails", async () => {
    mock.writeOpenSpecConfigFile.mockReturnValue({ success: false, error: "disk full" });
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/config",
      payload: { profile: "custom", workflows: ["propose"] },
    });
    expect(res.statusCode).toBe(500);
  });

  // ── POST /api/openspec/update ──────────────────────────────────────

  it("updates a single cwd and records its signature", async () => {
    mock.globalWorkflows = ["propose", "apply"];
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/update",
      payload: { cwd: "/proj/a" },
    });
    expect(res.statusCode).toBe(200);
    expect(mock.update).toHaveBeenCalledWith({ cwd: "/proj/a" });
    expect(signatures["/proj/a"]).toBe("apply|propose");
  });

  it("updates all known cwds (session + pinned); one failure does not abort others", async () => {
    mock.update.mockImplementation(({ cwd }: any) =>
      cwd === "/proj/a" ? { ok: false, error: { kind: "exit" } } : { ok: true, value: "" });
    await setup();
    const res = await fastify.inject({
      method: "POST", url: "/api/openspec/update",
      payload: { all: true },
    });
    expect(res.statusCode).toBe(200);
    const { results } = JSON.parse(res.payload).data;
    const byCwd = Object.fromEntries(results.map((r: any) => [r.cwd, r.success]));
    expect(byCwd["/proj/a"]).toBe(false);
    expect(byCwd["/proj/b"]).toBe(true);
    // Only the successful cwd got a recorded signature.
    expect(signatures["/proj/b"]).toBeDefined();
    expect(signatures["/proj/a"]).toBeUndefined();
  });

  it("returns 400 when neither cwd nor all is provided", async () => {
    await setup();
    const res = await fastify.inject({ method: "POST", url: "/api/openspec/update", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  // ── GET /api/openspec/update-status ────────────────────────────────

  it("classifies cwds as up-to-date / needs-update / unknown", async () => {
    mock.globalWorkflows = ["propose", "apply"];
    sessionCwds = ["/proj/fresh", "/proj/stale"];
    pinnedDirs = ["/proj/never"];
    await setup();
    // fresh matches current signature; stale has an old one; never has none.
    signatures["/proj/fresh"] = "apply|propose";
    signatures["/proj/stale"] = "old-signature";

    const res = await fastify.inject({ method: "GET", url: "/api/openspec/update-status" });
    expect(res.statusCode).toBe(200);
    const { statuses } = JSON.parse(res.payload).data;
    const byCwd = Object.fromEntries(statuses.map((s: any) => [s.cwd, s.status]));
    expect(byCwd["/proj/fresh"]).toBe("up-to-date");
    expect(byCwd["/proj/stale"]).toBe("needs-update");
    expect(byCwd["/proj/never"]).toBe("unknown");
  });
});
