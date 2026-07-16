import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type OmpConfigCli,
  OmpConfigCliError,
  type OmpConfigEntry,
} from "../omp-config-cli.js";
import { registerOmpConfigRoutes } from "../routes/omp-config-routes.js";

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
    resolveBin: () => "/usr/bin/omp",
    version: async () => "omp 16.5.0",
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
    expect(body.data.ompBin).toBe("/usr/bin/omp");
    expect(body.data.ompVersion).toBe("omp 16.5.0");
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
  it("PATCH /api/omp-config/model-roles serializes concurrent merges", async () => {
    await app.close();
    const entries = fixtureAsEntries();
    let releaseFirstRead: (() => void) | undefined;
    const firstReadBlocked = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let signalFirstRead: (() => void) | undefined;
    const firstReadStarted = new Promise<void>((resolve) => {
      signalFirstRead = resolve;
    });
    let signalSecondRequest: (() => void) | undefined;
    const secondRequestStarted = new Promise<void>((resolve) => {
      signalSecondRequest = resolve;
    });
    let networkChecks = 0;
    let reads = 0;
    const cli: OmpConfigCli = {
      resolveBin: () => "/usr/bin/omp",
      version: async () => "omp 16.5.0",
      path: async () => "/home/joe/.omp/agent",
      list: async () => entries,
      get: async (key) => {
        const entry = entries[key];
        if (!entry) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
        reads += 1;
        if (key === "modelRoles" && reads === 1) {
          signalFirstRead?.();
          await firstReadBlocked;
        }
        return entry;
      },
      set: async (key, value) => {
        const entry = entries[key];
        if (!entry) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
        const next = { ...entry, value };
        entries[key] = next;
        return next;
      },
      reset: async (key) => {
        const entry = entries[key];
        if (!entry) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
        const next = { ...entry, value: undefined };
        entries[key] = next;
        return next;
      },
    };
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => {
        networkChecks += 1;
        if (networkChecks === 2) signalSecondRequest?.();
      },
      cli,
    });
    await app.ready();

    const first = app.inject({
      method: "PATCH",
      url: "/api/omp-config/model-roles",
      payload: { patch: { default: "first/default" } },
    });
    await firstReadStarted;
    const second = app.inject({
      method: "PATCH",
      url: "/api/omp-config/model-roles",
      payload: { patch: { smol: "second/smol" } },
    });
    try {
      await secondRequestStarted;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(reads).toBe(1);
    } finally {
      releaseFirstRead?.();
    }

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(entries.modelRoles.value).toMatchObject({
      default: "first/default",
      smol: "second/smol",
    });
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


  it("GET /api/omp-config redacts secret values", async () => {
    await app.close();
    const secretKey = "auth.broker.token";
    const entries = fixtureAsEntries();
    entries[secretKey] = {
      key: secretKey,
      value: "super-secret-token",
      type: "string",
      description: "broker token",
    };
    entries["compaction.reserveTokens"] = {
      key: "compaction.reserveTokens",
      value: 1200,
      type: "number",
      description: "not a secret",
    };
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => undefined,
      cli: makeCli({
        list: async () => entries,
        get: async (key) => {
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          return e;
        },
        set: async (key, value) => {
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          const next = { ...e, value };
          entries[key] = next;
          return next;
        },
      }),
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/api/omp-config" });
    expect(res.statusCode).toBe(200);
    const settings = res.json().data.settings;
    expect(settings[secretKey].value).toBeNull();
    expect(settings[secretKey].redacted).toBe(true);
    expect(JSON.stringify(settings)).not.toContain("super-secret-token");
    expect(settings["compaction.reserveTokens"].value).toBe(1200);
  });

  it("PUT secret unchanged sentinel does not wipe storage", async () => {
    await app.close();
    const secretKey = "mnemopi.embeddingApiKey";
    const entries = fixtureAsEntries();
    entries[secretKey] = {
      key: secretKey,
      value: "stored-key",
      type: "string",
      description: "embedding key",
    };
    let setCalls = 0;
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => undefined,
      cli: makeCli({
        list: async () => entries,
        get: async (key) => {
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          return e;
        },
        set: async (key, value) => {
          setCalls += 1;
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          const next = { ...e, value };
          entries[key] = next;
          return next;
        },
      }),
    });
    await app.ready();

    const res = await app.inject({
      method: "PUT",
      url: "/api/omp-config",
      payload: { key: secretKey, value: "__omp_secret_unchanged__" },
    });
    expect(res.statusCode).toBe(200);
    expect(setCalls).toBe(0);
    expect(entries[secretKey].value).toBe("stored-key");
    expect(res.json().data.value).toBeNull();
    expect(res.json().data.redacted).toBe(true);
  });

  it("PUT secret with a new value writes and redacts the response", async () => {
    await app.close();
    const secretKey = "searxng.basicPassword";
    const entries = fixtureAsEntries();
    entries[secretKey] = {
      key: secretKey,
      value: "old-pass",
      type: "string",
      description: "password",
    };
    app = Fastify({ logger: false });
    registerOmpConfigRoutes(app, {
      networkGuard: async () => undefined,
      cli: makeCli({
        list: async () => entries,
        get: async (key) => {
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          return e;
        },
        set: async (key, value) => {
          const e = entries[key];
          if (!e) throw new OmpConfigCliError("OMP_INVALID_KEY", `Unknown setting: ${key}`);
          const next = { ...e, value };
          entries[key] = next;
          return next;
        },
      }),
    });
    await app.ready();

    const res = await app.inject({
      method: "PUT",
      url: "/api/omp-config",
      payload: { key: secretKey, value: "new-pass" },
    });
    expect(res.statusCode).toBe(200);
    expect(entries[secretKey].value).toBe("new-pass");
    expect(res.json().data.value).toBeNull();
    expect(JSON.stringify(res.json())).not.toContain("new-pass");
  });
  it("GET /api/omp-config/path returns agentDir", async () => {
    const res = await app.inject({ method: "GET", url: "/api/omp-config/path" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.agentDir).toBe("/home/joe/.omp/agent");
  });
});
