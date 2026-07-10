/**
 * Unit tests for the push token registry.
 *
 * Covers: add/remove/list, persistence round-trip (a fresh registry instance
 * reads the same file), idempotent add (same deviceToken → same id, refreshed
 * lastUsedAt), findByDeviceToken, and touch.
 * See change: add-server-push-notifications.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPushTokenRegistry } from "../push/push-token-registry.js";

describe("push token registry", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-tokens-"));
    file = path.join(dir, "push-tokens.json");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("adds a token and lists it with a generated id + timestamps", () => {
    const reg = createPushTokenRegistry({ path: file });
    const token = reg.add({ deviceToken: "dev-A", transport: "web-push" });
    expect(token.id).toMatch(/[0-9a-f-]{36}/);
    expect(token.deviceToken).toBe("dev-A");
    expect(token.transport).toBe("web-push");
    expect(typeof token.registeredAt).toBe("number");
    expect(typeof token.lastUsedAt).toBe("number");
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].id).toBe(token.id);
  });

  it("removes a token by id", () => {
    const reg = createPushTokenRegistry({ path: file });
    const token = reg.add({ deviceToken: "dev-A", transport: "web-push" });
    reg.remove(token.id);
    expect(reg.list()).toHaveLength(0);
    expect(reg.findByDeviceToken("dev-A")).toBeUndefined();
  });

  it("persists across instances (round-trip)", () => {
    const reg1 = createPushTokenRegistry({ path: file });
    const token = reg1.add({ deviceToken: "dev-A", transport: "web-push", sessionFilter: ["s1"] });

    // fresh instance reads the same file
    const reg2 = createPushTokenRegistry({ path: file });
    const list = reg2.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(token.id);
    expect(list[0].deviceToken).toBe("dev-A");
    expect(list[0].sessionFilter).toEqual(["s1"]);
  });

  it("is idempotent: re-adding the same deviceToken keeps one entry + same id and refreshes lastUsedAt", async () => {
    const reg = createPushTokenRegistry({ path: file });
    const first = reg.add({ deviceToken: "dev-A", transport: "web-push" });
    await new Promise((r) => setTimeout(r, 5));
    const second = reg.add({ deviceToken: "dev-A", transport: "web-push" });

    expect(second.id).toBe(first.id);
    expect(reg.list()).toHaveLength(1);
    expect(second.lastUsedAt).toBeGreaterThanOrEqual(first.lastUsedAt);
  });

  it("finds a token by device token", () => {
    const reg = createPushTokenRegistry({ path: file });
    reg.add({ deviceToken: "dev-A", transport: "web-push" });
    reg.add({ deviceToken: "dev-B", transport: "fcm" });
    expect(reg.findByDeviceToken("dev-B")?.transport).toBe("fcm");
    expect(reg.findByDeviceToken("nope")).toBeUndefined();
  });

  it("touch refreshes lastUsedAt and persists", async () => {
    const reg = createPushTokenRegistry({ path: file });
    const token = reg.add({ deviceToken: "dev-A", transport: "web-push" });
    await new Promise((r) => setTimeout(r, 5));
    reg.touch(token.id);
    const reloaded = createPushTokenRegistry({ path: file }).list()[0];
    expect(reloaded.lastUsedAt).toBeGreaterThanOrEqual(token.lastUsedAt);
  });
});
