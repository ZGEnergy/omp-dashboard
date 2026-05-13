/**
 * Pure tests for classifyBridgeSource — see change fix-pi-flows-end-to-end
 * (Group 2, task 2.5).
 */
import { describe, it, expect } from "vitest";
import { classifyBridgeSource } from "../plugin-bridge-register.js";

describe("classifyBridgeSource", () => {
  it("returns 'packages[]' when bridge path is in packages array (string form)", () => {
    expect(
      classifyBridgeSource({ packages: ["/abs/bridge.js"] }, "/abs/bridge.js"),
    ).toBe("packages[]");
  });

  it("returns 'packages[]' for object-form package source", () => {
    expect(
      classifyBridgeSource(
        { packages: [{ source: "/abs/bridge.js", extensions: ["foo"] }] },
        "/abs/bridge.js",
      ),
    ).toBe("packages[]");
  });

  it("returns 'dashboardPluginBridges' when only the legacy key references it", () => {
    expect(
      classifyBridgeSource(
        { dashboardPluginBridges: { "dashboard-demo": "/abs/bridge.js" } },
        "/abs/bridge.js",
      ),
    ).toBe("dashboardPluginBridges");
  });

  it("packages[] wins over dashboardPluginBridges when both reference the same path", () => {
    expect(
      classifyBridgeSource(
        {
          packages: ["/abs/bridge.js"],
          dashboardPluginBridges: { "dashboard-demo": "/abs/bridge.js" },
        },
        "/abs/bridge.js",
      ),
    ).toBe("packages[]");
  });

  it("returns 'none' when neither registry references the path", () => {
    expect(
      classifyBridgeSource(
        { packages: ["/other"], dashboardPluginBridges: { "dashboard-other": "/y" } },
        "/abs/bridge.js",
      ),
    ).toBe("none");
  });

  it("returns 'none' for empty settings", () => {
    expect(classifyBridgeSource({}, "/abs/bridge.js")).toBe("none");
  });

  it("tolerates malformed settings (null / array / primitive)", () => {
    expect(classifyBridgeSource(null, "/abs/bridge.js")).toBe("none");
    expect(classifyBridgeSource([], "/abs/bridge.js")).toBe("none");
    expect(classifyBridgeSource(42, "/abs/bridge.js")).toBe("none");
    expect(classifyBridgeSource("string", "/abs/bridge.js")).toBe("none");
  });

  it("ignores non-matching packages entries", () => {
    expect(
      classifyBridgeSource(
        { packages: ["/a", { source: "/b" }, { not_source: "/abs/bridge.js" }] },
        "/abs/bridge.js",
      ),
    ).toBe("none");
  });
});
