/**
 * Package manager resolution diagnostics for Oh My Pi.
 *
 * Upstream exercised DefaultPackageManager module resolution. OMP no longer
 * ships that API; diagnosePiPackageManager still exposes ToolRegistry
 * resolution of pi-coding-agent for doctor/ui surfaces.
 */
import { describe, it, expect } from "vitest";
import { diagnosePiPackageManager } from "../package-manager-wrapper.js";
import {
  ToolRegistry,
  OverridesStore,
} from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { registerDefaultTools } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/definitions.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";

function makeRegistryWithStub(): ToolRegistry {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "pmw-resolve-"));
  const overrides = new OverridesStore({
    filePath: path.join(tmpDir, "tool-overrides.json"),
  });
  const stubDir = path.join(tmpDir, "pi-coding-agent", "dist");
  mkdirSync(stubDir, { recursive: true });
  const stubPath = path.join(stubDir, "index.js");
  writeFileSync(stubPath, "// test stub\n");
  overrides.set("pi-coding-agent", stubPath);
  const registry = new ToolRegistry({ overrides });
  registerDefaultTools(registry);
  return registry;
}

describe("diagnosePiPackageManager", () => {
  it("returns ok resolution when coding-agent tool is overridden", () => {
    const registry = makeRegistryWithStub();
    const res = diagnosePiPackageManager(registry);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.path).toContain("index.js");
    }
  });
});
