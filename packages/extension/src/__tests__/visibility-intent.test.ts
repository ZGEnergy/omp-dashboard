import { describe, it, expect } from "vitest";
import { resolveVisibilityIntent, buildVisibilityRegisterFields } from "../visibility-intent.js";

describe("resolveVisibilityIntent", () => {
  it("returns undefined when no env override is set", () => {
    expect(resolveVisibilityIntent({})).toBeUndefined();
  });

  it("maps PI_DASHBOARD_HIDDEN to 'hidden'", () => {
    expect(resolveVisibilityIntent({ PI_DASHBOARD_HIDDEN: "1" })).toBe("hidden");
  });

  it("maps PI_DASHBOARD_VISIBLE to 'visible'", () => {
    expect(resolveVisibilityIntent({ PI_DASHBOARD_VISIBLE: "1" })).toBe("visible");
  });

  it("lets PI_DASHBOARD_VISIBLE win when both are set (explicit show beats hide)", () => {
    expect(
      resolveVisibilityIntent({ PI_DASHBOARD_HIDDEN: "1", PI_DASHBOARD_VISIBLE: "1" }),
    ).toBe("visible");
  });
});

describe("buildVisibilityRegisterFields", () => {
  it("a print-mode register carries hasUI: false", () => {
    expect(buildVisibilityRegisterFields(false, {})).toEqual({ hasUI: false });
  });

  it("a TUI register carries hasUI: true", () => {
    expect(buildVisibilityRegisterFields(true, {})).toEqual({ hasUI: true });
  });

  it("omits hasUI entirely when unknown (legacy/back-compat)", () => {
    expect(buildVisibilityRegisterFields(undefined, {})).toEqual({});
  });

  it("forwards env intent as visibilityIntent alongside hasUI", () => {
    expect(buildVisibilityRegisterFields(false, { PI_DASHBOARD_VISIBLE: "1" })).toEqual({
      hasUI: false,
      visibilityIntent: "visible",
    });
  });
});
