/**
 * Unit tests for VAPID key persistence + reuse (mocked `web-push`).
 *
 * Asserts: first call generates + persists a keypair; a second call reads the
 * persisted file and does NOT regenerate.
 * See change: add-server-push-notifications.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateVAPIDKeys = vi.fn();

vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => generateVAPIDKeys(),
  },
}));

import { loadOrGenerateVapidKeys } from "../push/push-vapid.js";

describe("VAPID key lifecycle", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "push-vapid-"));
    file = path.join(dir, "push-vapid.json");
    generateVAPIDKeys.mockReset();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("generates and persists a keypair on first call", () => {
    generateVAPIDKeys.mockReturnValue({ publicKey: "PUB1", privateKey: "PRIV1" });
    const keys = loadOrGenerateVapidKeys(file);
    expect(keys).toEqual({ publicKey: "PUB1", privateKey: "PRIV1" });
    expect(generateVAPIDKeys).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({
      publicKey: "PUB1",
      privateKey: "PRIV1",
    });
  });

  it("reuses the persisted keypair on a second call (no regen)", () => {
    generateVAPIDKeys.mockReturnValue({ publicKey: "PUB1", privateKey: "PRIV1" });
    loadOrGenerateVapidKeys(file);
    generateVAPIDKeys.mockReturnValue({ publicKey: "PUB2", privateKey: "PRIV2" });
    const keys = loadOrGenerateVapidKeys(file);
    expect(keys).toEqual({ publicKey: "PUB1", privateKey: "PRIV1" });
    expect(generateVAPIDKeys).toHaveBeenCalledTimes(1);
  });
});
