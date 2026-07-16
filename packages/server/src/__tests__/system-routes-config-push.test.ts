import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerSystemRoutes } from "../routes/system-routes.js";
import type { PushConfig } from "@blackbelt-technology/pi-dashboard-shared/config.js";

describe("PUT /api/config push preference reload", () => {
  let testDir: string;
  let originalHome: string | undefined;
  let app: ReturnType<typeof Fastify>;
  let runtimeConfig: { push: PushConfig };
  let applyPushConfig: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "push-config-route-"));
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    fs.mkdirSync(path.join(testDir, ".pi", "dashboard"), { recursive: true });
    fs.writeFileSync(
      path.join(testDir, ".pi", "dashboard", "config.json"),
      JSON.stringify({
        push: {
          enabled: true,
          coalesceWindowMs: 30_000,
          actionsRequired: true,
          claudeDecides: true,
          webPush: { contactEmail: "ops@example.com" },
          fcm: { serviceAccountPath: "/etc/pi/fcm.json" },
        },
      }),
    );

    app = Fastify({ logger: false });
    runtimeConfig = {
      push: {
        enabled: true,
        coalesceWindowMs: 30_000,
        actionsRequired: true,
        claudeDecides: true,
        webPush: { contactEmail: "ops@example.com" },
        fcm: { serviceAccountPath: "/etc/pi/fcm.json" },
      },
    };
    applyPushConfig = vi.fn((next: PushConfig) => Object.assign(runtimeConfig.push, next));
    registerSystemRoutes(app, {
      sessionManager: { listActive: () => [], listAll: () => [] } as never,
      preferencesStore: { flush: () => {} } as never,
      metaPersistence: { flushAll: () => {} } as never,
      config: runtimeConfig as never,
      networkGuard: (async () => {}) as never,
      applyPushConfig: applyPushConfig as unknown as (push: PushConfig) => void,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("hot-applies enable, disable, and re-enable without restarting", async () => {
    const disable = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { push: { enabled: false, coalesceWindowMs: 5_000, webPush: { contactEmail: "new@example.com" } } },
    });

    expect(disable.statusCode).toBe(200);
    expect(JSON.parse(disable.body)).toMatchObject({ success: true, restartRequired: false });
    expect(runtimeConfig.push).toMatchObject({
      enabled: false,
      coalesceWindowMs: 5_000,
      webPush: { contactEmail: "new@example.com" },
    });
    expect(applyPushConfig).toHaveBeenCalledTimes(1);

    const enable = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { push: { enabled: true, coalesceWindowMs: 6_000 } },
    });

    expect(enable.statusCode).toBe(200);
    expect(JSON.parse(enable.body)).toMatchObject({ success: true, restartRequired: false });
    expect(runtimeConfig.push).toMatchObject({
      enabled: true,
      coalesceWindowMs: 6_000,
      webPush: { contactEmail: "new@example.com" },
    });
    expect(applyPushConfig).toHaveBeenCalledTimes(2);
  });

  it("does not call the lifecycle hook when a non-push config is saved", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { completedFirst: true },
    });

    expect(response.statusCode).toBe(200);
    expect(applyPushConfig).not.toHaveBeenCalled();
  });

  it("refreshes bucket preferences in the existing server config without rebuilding push state", async () => {
    const bootPushConfig = runtimeConfig.push;
    const response = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { push: { actionsRequired: false } },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({ success: true, restartRequired: false });
    expect(runtimeConfig.push.actionsRequired).toBe(false);
    expect(runtimeConfig.push.claudeDecides).toBe(true);
    expect(runtimeConfig.push).toBe(bootPushConfig);

    const persisted = JSON.parse(
      fs.readFileSync(path.join(testDir, ".pi", "dashboard", "config.json"), "utf-8"),
    );
    expect(persisted.push).toEqual({
      enabled: true,
      coalesceWindowMs: 30_000,
      actionsRequired: false,
      claudeDecides: true,
      webPush: { contactEmail: "ops@example.com" },
      fcm: { serviceAccountPath: "/etc/pi/fcm.json" },
    });
  });
  it("reloads omitted legacy buckets to true while applying an explicit false", async () => {
    const legacyPush = {
      enabled: true,
      coalesceWindowMs: 45_000,
      webPush: { contactEmail: "ops@example.com" },
      fcm: { serviceAccountPath: "/etc/pi/fcm.json" },
    };
    fs.writeFileSync(
      path.join(testDir, ".pi", "dashboard", "config.json"),
      JSON.stringify({ push: legacyPush }),
    );
    runtimeConfig.push.actionsRequired = true;
    runtimeConfig.push.claudeDecides = true;

    const response = await app.inject({
      method: "PUT",
      url: "/api/config",
      payload: { push: { claudeDecides: false } },
    });

    expect(response.statusCode).toBe(200);
    expect(runtimeConfig.push.actionsRequired).toBe(true);
    expect(runtimeConfig.push.claudeDecides).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(testDir, ".pi", "dashboard", "config.json"), "utf-8")).push).toEqual({
      ...legacyPush,
      claudeDecides: false,
    });
  });
});
