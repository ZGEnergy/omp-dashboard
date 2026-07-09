/**
 * Tests for credential-detect — Doctor's "API key" detector.
 * Covers settings.json, agent.db, and auth.json fallback matrix.
 *
 * See change: fix-doctor-oauth-credential-detection.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

import { hasAnyProviderCredential, inspectedCredentialFiles } from "../credential-detect.js";

describe("credential-detect", () => {
  let tmpDir: string;
  let settingsPath: string;
  let agentDbPath: string;
  let authPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cred-detect-test-"));
    const agentDir = path.join(tmpDir, ".omp", "agent");
    fs.mkdirSync(agentDir, { recursive: true });
    settingsPath = path.join(agentDir, "settings.json");
    authPath = path.join(agentDir, "auth.json");

    agentDbPath = path.join(agentDir, "agent.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSettings(data: unknown) {
    fs.writeFileSync(settingsPath, JSON.stringify(data));
  }
  function writeAuth(data: unknown) {
    fs.writeFileSync(authPath, JSON.stringify(data));
  }

  function writeAgentDb(rows: Array<{
    provider: string;
    credentialType: "api_key" | "oauth";
    data: Record<string, unknown>;
    disabledCause?: string | null;
  }>) {
    const db = new DatabaseSync(agentDbPath);
    try {
      db.exec(`
        CREATE TABLE auth_credentials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          credential_type TEXT NOT NULL,
          data TEXT NOT NULL,
          disabled_cause TEXT DEFAULT NULL
        )
      `);
      const insert = db.prepare(`
        INSERT INTO auth_credentials (provider, credential_type, data, disabled_cause)
        VALUES (?, ?, ?, ?)
      `);
      for (const row of rows) {
        insert.run(row.provider, row.credentialType, JSON.stringify(row.data), row.disabledCause ?? null);
      }
    } finally {
      db.close();
    }
  }

  describe("hasAnyProviderCredential", () => {
    it("returns false when neither file exists", () => {
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("returns true for settings.json anthropicApiKey", () => {
      writeSettings({ anthropicApiKey: "sk-ant-abc" });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for settings.json openaiApiKey", () => {
      writeSettings({ openaiApiKey: "sk-xyz" });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for settings.json generic apiKey", () => {
      writeSettings({ apiKey: "k" });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for settings.json providers[].apiKey", () => {
      writeSettings({ providers: { groq: { apiKey: "gsk_x" } } });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for auth.json api-key shape", () => {
      writeAuth({ openrouter: { type: "api", key: "or-x" } });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for auth.json oauth shape (access set)", () => {
      writeAuth({
        anthropic: { type: "oauth", access: "tok", refresh: "r", expires: 9e15 },
      });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true when only refresh is set (access empty)", () => {
      writeAuth({
        anthropic: { type: "oauth", access: "", refresh: "r" },
      });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for active agent.db api_key rows", () => {
      writeAgentDb([
        {
          provider: "zai",
          credentialType: "api_key",
          data: { key: "zai-live-key-123" },
        },
      ]);
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("returns true for active agent.db oauth rows", () => {
      writeAgentDb([
        {
          provider: "openai-codex",
          credentialType: "oauth",
          data: { access: "tok", refresh: "ref" },
        },
      ]);
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("ignores disabled agent.db rows", () => {
      writeAgentDb([
        {
          provider: "zai",
          credentialType: "api_key",
          data: { key: "zai-live-key-123" },
          disabledCause: "revoked",
        },
      ]);
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("returns false when auth.json credentials are all empty strings", () => {
      writeAuth({
        anthropic: { type: "oauth", access: "", refresh: "", expires: 0 },
        openrouter: { type: "api", key: "" },
      });
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("returns false when auth.json credentials are whitespace", () => {
      writeAuth({
        anthropic: { type: "oauth", access: "   ", refresh: "\t\n" },
      });
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("returns false when settings.json apiKey is empty string", () => {
      writeSettings({ anthropicApiKey: "", openaiApiKey: "  " });
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("malformed settings.json falls back to valid auth.json", () => {
      fs.writeFileSync(settingsPath, "{ not json");
      writeAuth({ anthropic: { type: "oauth", access: "tok" } });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("malformed auth.json falls back to valid settings.json", () => {
      writeSettings({ anthropicApiKey: "sk-x" });
      fs.writeFileSync(authPath, "{{{");
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("malformed agent.db falls back to valid auth.json", () => {
      fs.writeFileSync(agentDbPath, "not-a-sqlite-db");
      writeAuth({ anthropic: { type: "oauth", access: "tok" } });
      expect(hasAnyProviderCredential(tmpDir)).toBe(true);
    });

    it("both files malformed → false (no throw)", () => {
      fs.writeFileSync(settingsPath, "garbage");
      fs.writeFileSync(authPath, "more garbage");
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("ignores non-object provider entries in auth.json", () => {
      writeAuth({ anthropic: "string-value", openrouter: null, zai: 42 });
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("ignores non-object providers entries in settings.json", () => {
      writeSettings({ providers: { x: "str", y: null } });
      expect(hasAnyProviderCredential(tmpDir)).toBe(false);
    });

    it("defaults homeDir to os.homedir() when omitted", () => {
      // Just assert it does not throw and returns a boolean.
      const v = hasAnyProviderCredential();
      expect(typeof v).toBe("boolean");
    });
  });

  describe("inspectedCredentialFiles", () => {
    it("returns settings.json, agent.db, auth.json in stable order", () => {
      const files = inspectedCredentialFiles(tmpDir);
      expect(files).toHaveLength(3);
      expect(files[0]).toBe(path.join(tmpDir, ".omp", "agent", "settings.json"));
      expect(files[1]).toBe(path.join(tmpDir, ".omp", "agent", "agent.db"));
      expect(files[2]).toBe(path.join(tmpDir, ".omp", "agent", "auth.json"));
    });
  });
});
