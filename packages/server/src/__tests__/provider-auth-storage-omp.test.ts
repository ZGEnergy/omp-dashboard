/**
 * Oh My Pi credential store — sqlite primary under test HOME.
 *
 * Module captures AUTH_DIR at load time via getAgentHome(), so we set HOME
 * before importing and use vitest isolate + this dedicated file.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import {
  writeCredential,
  removeCredential,
  readAuthJson,
} from "../provider-auth-storage.js";
import { getAgentDbPath } from "@blackbelt-technology/pi-dashboard-shared/host-profile.js";

const home = process.env.HOME ?? "";

describe("provider-auth-storage sqlite", () => {
  it("test HOME is isolated (not real user home)", () => {
    expect(home).not.toBe(os.userInfo().homedir);
    expect(home.length).toBeGreaterThan(0);
  });

  it("round-trips api_key credentials via agent.db", () => {
    writeCredential("openrouter", { type: "api_key", key: "sk-test-1234567890" });
    expect(existsSync(getAgentDbPath())).toBe(true);
    const data = readAuthJson();
    expect(data.openrouter).toEqual({ type: "api_key", key: "sk-test-1234567890" });
    removeCredential("openrouter");
    expect(readAuthJson().openrouter).toBeUndefined();
  });

  it("round-trips oauth credentials", () => {
    writeCredential("anthropic", {
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: 1234567890,
    });
    const cred = readAuthJson().anthropic;
    expect(cred?.type).toBe("oauth");
    if (cred && cred.type === "oauth") {
      expect(cred.access).toBe("access-token");
      expect(cred.refresh).toBe("refresh-token");
      expect(cred.expires).toBe(1234567890);
    }
    removeCredential("anthropic");
  });
});
