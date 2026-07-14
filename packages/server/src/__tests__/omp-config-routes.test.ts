import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerOmpConfigRoutes } from "../routes/omp-config-routes.js";
import {
  OmpConfigCliError,
  type OmpConfigCli,
  type OmpConfigEntry,
} from "../omp-config-cli.js";

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "omp-config-list.json",
    ),
    "utf-8",
  ),
) as Record<string, { value?: unknown; type: string; description: string }>;

function fixtureAsEntries(): Record<string, OmpConfigEntry> {
  const out: Record<string, OmpConfigEntry> = {};
  for (const [key, entry] of Object.entries(FIXTURE)) {
    out[key] = {
      key,
      value: entry.value,
      type: entry.type as OmpConfigEntry["type"],
      description: entry.description,
    };
  }
  return out;
}

function makeCli(overrides: Partial<OmpConfigCli> = {}): OmpConfigCli {
  const entries = fixtureAsEntries();
  return {
    path: async () => "/home/joe/.omp/agent",
    list: async () => entries,
    get: async (key) => {
      const e = entries[key];
      if (!e) {
        throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
      }
      return e;
    },
    set: async (key, value) => {
      const e = entries[key];
      if (!e) {
        throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
      }
      const next = { ...e, value };
      entries[key] = next;
      return next;
    },
    reset: async (key) => {
      const e = entries[key];
      if (!e) {
        throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
      }
      const next = { ...e, value: undefined };
      entries[key] = next;
      return next;
    },
    ...overrides,
  };
}

describe("omp-config routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => undefined,
      cli: makeCli(),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/omp-config returns settings + agentDir", async () => {
    const res = await app.inject({ method: "GET", url: "/api/omp-config" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.agentDir).toBe("/home/joe/.omp/agent");
    expect(body.data.settings.modelRoles.type).toBe("record");
    expect(body.data.settings.autoResume.type).toBe("boolean");
  });

  it("GET /api/omp-config/entry?key= returns one entry", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/omp-config/entry?key=autoResume",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.key).toBe("autoResume");
  });

  it("GET entry without key → 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/omp-config/entry" });
    expect(res.statusCode).toBe(400);
  });

  it("PUT /api/omp-config sets a value", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/omp-config",
      payload: { key: "hideThinkingBlock", value: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      key: "hideThinkingBlock",
      value: true,
    });
  });

  it("POST /api/omp-config/reset resets a key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/omp-config/reset",
      payload: { key: "autoResume" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.key).toBe("autoResume");
  });

  it("maps OMP_NOT_FOUND to 503", async () => {
    await app.close();
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => undefined,
      cli: makeCli({
        list: async () => {
          throw new OmpConfigCliError(
            "OMP_NOT_FOUND",
            "omp binary not found on PATH (set OMP_BIN if needed)",
          );
        },
      }),
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/omp-config" });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("OMP_NOT_FOUND");
  });

  it("maps OMP_INVALID_KEY to 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/omp-config",
      payload: { key: "not.a.real.key", value: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("OMP_INVALID_KEY");
  });

  it("GET /api/omp-config/path returns agentDir", async () => {
    const res = await app.inject({ method: "GET", url: "/api/omp-config/path" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.agentDir).toBe("/home/joe/.omp/agent");
  });
});
