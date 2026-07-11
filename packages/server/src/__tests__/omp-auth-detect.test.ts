import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ompAuthedProviderIds } from "../omp-auth-detect.js";
import { overlayOmpAuth } from "../provider-auth-storage.js";
import type { ProviderAuthStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

/** Build a throwaway ~/.omp/agent dir with an agent.db mirroring omp's schema. */
function makeAgentDir(rows: Array<{ provider: string; disabled?: string | null }>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "omp-auth-"));
  const db = new DatabaseSync(path.join(dir, "agent.db"));
  db.exec(
    "CREATE TABLE auth_credentials (id INTEGER, provider TEXT, credential_type TEXT, data TEXT, disabled_cause TEXT, identity_key TEXT, created_at INTEGER, updated_at INTEGER)",
  );
  const stmt = db.prepare("INSERT INTO auth_credentials (provider, disabled_cause) VALUES (?, ?)");
  for (const r of rows) stmt.run(r.provider, r.disabled ?? null);
  db.close();
  return dir;
}

describe("ompAuthedProviderIds", () => {
  it("returns providers with a non-disabled credential, skips disabled ones", () => {
    const dir = makeAgentDir([
      { provider: "anthropic" },
      { provider: "openrouter", disabled: "expired" },
    ]);
    const ids = ompAuthedProviderIds(dir);
    expect(ids.has("anthropic")).toBe(true);
    expect(ids.has("openrouter")).toBe(false);
  });

  it("returns an empty set when agentDir is unset or has no db", () => {
    expect(ompAuthedProviderIds(undefined).size).toBe(0);
    expect(ompAuthedProviderIds("/no/such/dir").size).toBe(0);
  });
});

describe("overlayOmpAuth", () => {
  const base = (): ProviderAuthStatus[] => [
    { id: "anthropic", name: "Anthropic", flowType: "auth_code", authenticated: false },
    { id: "openai", name: "OpenAI", flowType: "auth_code", authenticated: false },
  ];

  it("marks a matching provider authenticated", () => {
    const out = overlayOmpAuth(base(), new Set(["anthropic"]));
    expect(out.find((s) => s.id === "anthropic")?.authenticated).toBe(true);
    expect(out.find((s) => s.id === "openai")?.authenticated).toBe(false);
  });

  it("appends a row for an omp provider with no existing status row", () => {
    const out = overlayOmpAuth(base(), new Set(["zai"]));
    expect(out.find((s) => s.id === "zai")?.authenticated).toBe(true);
  });

  it("is a no-op when omp has no credentials", () => {
    const out = overlayOmpAuth(base(), new Set());
    expect(out.every((s) => !s.authenticated)).toBe(true);
  });
});
