/**
 * Tests for the flows edit-mode REST routes (GET/PUT /api/plugins/flows/edit-mode).
 *
 * Real fs against temp dirs — the write path is a format-preserving JSON
 * merge into pi-flows' own settings files, so foreign-key preservation and
 * file-absent bootstrap are the contract under test.
 *
 * HOME is ephemeral under `npm test` (test-isolation guard); the "global"
 * scope tests write inside os.homedir() which resolves into that tmp HOME.
 *
 * See change: flows-edit-mode-folder-settings.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountEditModeRoutes } from "../server/edit-mode-routes.js";

const GLOBAL_SETTINGS = () => path.join(os.homedir(), ".pi", "agent", "settings.json");

function readJson(p: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("flows edit-mode routes", () => {
  let app: FastifyInstance;
  let cwd: string;

  beforeEach(async () => {
    app = Fastify();
    mountEditModeRoutes(app);
    await app.ready();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "flows-em-"));
    // start from a clean global file per test
    fs.rmSync(GLOBAL_SETTINGS(), { force: true });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  // ── GET ────────────────────────────────────────────────────────────────

  it("GET: both files absent → nulls, effective false", async () => {
    const res = await app.inject({ method: "GET", url: `/api/plugins/flows/edit-mode?cwd=${encodeURIComponent(cwd)}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ project: null, global: null, effective: false });
  });

  it("GET: global only → effective follows global", async () => {
    fs.mkdirSync(path.dirname(GLOBAL_SETTINGS()), { recursive: true });
    fs.writeFileSync(GLOBAL_SETTINGS(), JSON.stringify({ flows: { editFlow: true } }));
    const res = await app.inject({ method: "GET", url: `/api/plugins/flows/edit-mode?cwd=${encodeURIComponent(cwd)}` });
    expect(res.json().data).toEqual({ project: null, global: true, effective: true });
  });

  it("GET: project overrides global", async () => {
    fs.mkdirSync(path.dirname(GLOBAL_SETTINGS()), { recursive: true });
    fs.writeFileSync(GLOBAL_SETTINGS(), JSON.stringify({ flows: { editFlow: true } }));
    fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".pi", "settings.json"), JSON.stringify({ flows: { editFlow: false } }));
    const res = await app.inject({ method: "GET", url: `/api/plugins/flows/edit-mode?cwd=${encodeURIComponent(cwd)}` });
    expect(res.json().data).toEqual({ project: false, global: true, effective: false });
  });

  it("GET without cwd: global-only read (project stays null)", async () => {
    fs.mkdirSync(path.dirname(GLOBAL_SETTINGS()), { recursive: true });
    fs.writeFileSync(GLOBAL_SETTINGS(), JSON.stringify({ flows: { editFlow: true } }));
    const res = await app.inject({ method: "GET", url: "/api/plugins/flows/edit-mode" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ project: null, global: true, effective: true });
  });

  // ── PUT ────────────────────────────────────────────────────────────────

  it("PUT project scope: creates .pi/settings.json when absent", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/plugins/flows/edit-mode",
      payload: { cwd, scope: "project", enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(readJson(path.join(cwd, ".pi", "settings.json"))).toEqual({ flows: { editFlow: true } });
    expect(res.json().data).toEqual({ project: true, global: null, effective: true });
  });

  it("PUT project scope: preserves foreign keys in an existing file", async () => {
    fs.mkdirSync(path.join(cwd, ".pi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi", "settings.json"),
      JSON.stringify({ theme: "dark", flows: { editFlow: true, other: 1 } }),
    );
    await app.inject({
      method: "PUT",
      url: "/api/plugins/flows/edit-mode",
      payload: { cwd, scope: "project", enabled: false },
    });
    expect(readJson(path.join(cwd, ".pi", "settings.json"))).toEqual({
      theme: "dark",
      flows: { editFlow: false, other: 1 },
    });
  });

  it("PUT global scope: targets ~/.pi/agent/settings.json", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/plugins/flows/edit-mode",
      payload: { scope: "global", enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(readJson(GLOBAL_SETTINGS())).toEqual({ flows: { editFlow: true } });
  });

  it("PUT: malformed scope → 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/plugins/flows/edit-mode",
      payload: { cwd, scope: "session", enabled: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PUT project scope without cwd → 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/plugins/flows/edit-mode",
      payload: { scope: "project", enabled: true },
    });
    expect(res.statusCode).toBe(400);
  });
});
