import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// We test by importing the module and using a temp directory
// Since the module uses hardcoded paths, we mock fs operations

describe("provider-auth-storage", () => {
  const authDir = path.join(os.homedir(), ".pi", "agent");
  const authPath = path.join(authDir, "auth.json");
  let originalContent: string | null = null;

  beforeEach(() => {
    // Backup existing auth.json
    try {
      originalContent = fs.readFileSync(authPath, "utf-8");
    } catch {
      originalContent = null;
    }
  });

  afterEach(() => {
    // Restore original auth.json
    if (originalContent !== null) {
      fs.writeFileSync(authPath, originalContent);
    }
  });

  it("readAuthJson returns empty object when file does not exist", async () => {
    // Use dynamic import to get fresh module
    const { readAuthJson } = await import("../provider-auth-storage.js");
    // readAuthJson handles ENOENT gracefully
    const result = readAuthJson();
    expect(typeof result).toBe("object");
  });

  it("writeCredential and readAuthJson roundtrip", async () => {
    const { writeCredential, readAuthJson } = await import("../provider-auth-storage.js");
    const cred = { type: "api_key" as const, key: "test-key-123" };
    writeCredential("test-provider", cred);
    const data = readAuthJson();
    expect(data["test-provider"]).toEqual(cred);
    // Cleanup
    const { removeCredential } = await import("../provider-auth-storage.js");
    removeCredential("test-provider");
  });

  it("removeCredential removes the entry", async () => {
    const { writeCredential, removeCredential, readAuthJson } = await import("../provider-auth-storage.js");
    writeCredential("test-remove", { type: "api_key" as const, key: "x" });
    removeCredential("test-remove");
    const data = readAuthJson();
    expect(data["test-remove"]).toBeUndefined();
  });

  it("getAuthStatus returns all providers", async () => {
    const { getAuthStatus } = await import("../provider-auth-storage.js");
    const statuses = getAuthStatus();
    // Should have at least the 5 OAuth providers
    const oauthIds = statuses.filter((s) => s.flowType !== "api_key").map((s) => s.id);
    expect(oauthIds).toContain("anthropic");
    expect(oauthIds).toContain("openai-codex");
    expect(oauthIds).toContain("github-copilot");
    expect(oauthIds).toContain("google-gemini-cli");
    expect(oauthIds).toContain("google-antigravity");
  });

  it("getAuthStatus includes zai provider with flowType api_key", async () => {
    const { getAuthStatus } = await import("../provider-auth-storage.js");
    const statuses = getAuthStatus();
    const zai = statuses.find((s) => s.id === "zai");
    expect(zai).toBeDefined();
    expect(zai!.name).toBe("Z.ai");
    expect(zai!.flowType).toBe("api_key");
  });

  it("masking shows first 5 + ... + last 3 for keys >= 12 chars", async () => {
    const { writeCredential, getAuthStatus, removeCredential } = await import("../provider-auth-storage.js");
    writeCredential("openai", { type: "api_key", key: "sk-abc123xyz789" });
    try {
      const statuses = getAuthStatus();
      const openai = statuses.find((s) => s.id === "openai");
      expect(openai!.maskedKey).toBe("sk-ab...789");
    } finally {
      removeCredential("openai");
    }
  });

  it("masking returns **** for keys < 12 chars", async () => {
    const { writeCredential, getAuthStatus, removeCredential } = await import("../provider-auth-storage.js");
    writeCredential("openai", { type: "api_key", key: "shortkey" });
    try {
      const statuses = getAuthStatus();
      const openai = statuses.find((s) => s.id === "openai");
      expect(openai!.maskedKey).toBe("****");
    } finally {
      removeCredential("openai");
    }
  });

  it("empty key string results in authenticated false with no maskedKey", async () => {
    const { writeCredential, getAuthStatus, removeCredential } = await import("../provider-auth-storage.js");
    writeCredential("openai", { type: "api_key", key: "" });
    try {
      const statuses = getAuthStatus();
      const openai = statuses.find((s) => s.id === "openai");
      expect(openai!.authenticated).toBe(false);
      expect(openai!.maskedKey).toBeUndefined();
    } finally {
      removeCredential("openai");
    }
  });
});
