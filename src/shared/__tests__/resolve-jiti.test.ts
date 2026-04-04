import { describe, it, expect } from "vitest";

describe("resolveJitiImport", () => {
  it("throws with clear error when pi-coding-agent is not resolvable", async () => {
    // In test context (vitest, not inside pi's jiti loader),
    // peer deps are not resolvable — should throw
    const { resolveJitiImport } = await import("../resolve-jiti.js");

    expect(() => resolveJitiImport()).toThrow("Cannot find pi's TypeScript loader");
  });

  it("error message mentions pi-coding-agent", async () => {
    const { resolveJitiImport } = await import("../resolve-jiti.js");

    expect(() => resolveJitiImport()).toThrow("pi-coding-agent");
  });
});
