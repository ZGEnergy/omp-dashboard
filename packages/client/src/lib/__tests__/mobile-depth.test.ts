import { describe, it, expect } from "vitest";
import { getMobileDepth, type MobileDepthInput } from "../mobile-depth.js";

function input(over: Partial<MobileDepthInput> = {}): MobileDepthInput {
  return {
    hasSessionRoute: false,
    hasFolderRoute: false,
    hasSettingsRoute: false,
    hasTunnelRoute: false,
    hasOverlayRoute: false,
    hasPiResourceRoute: false,
    ...over,
  };
}

describe("getMobileDepth", () => {
  it("returns 0 when no route flag is set", () => {
    expect(getMobileDepth(input())).toBe(0);
  });

  it("returns 1 when a session route is active", () => {
    expect(getMobileDepth(input({ hasSessionRoute: true }))).toBe(1);
  });

  it("returns 1 when a folder route is active", () => {
    expect(getMobileDepth(input({ hasFolderRoute: true }))).toBe(1);
  });

  it("returns 1 when settings route is active", () => {
    expect(getMobileDepth(input({ hasSettingsRoute: true }))).toBe(1);
  });

  it("returns 1 when tunnel-setup route is active", () => {
    expect(getMobileDepth(input({ hasTunnelRoute: true }))).toBe(1);
  });

  it("returns 2 when any overlay route is active (even atop a session)", () => {
    expect(getMobileDepth(input({ hasSessionRoute: true, hasOverlayRoute: true }))).toBe(2);
  });

  it("returns 2 when pi-resource cross-folder route is active", () => {
    expect(getMobileDepth(input({ hasPiResourceRoute: true }))).toBe(2);
  });

  it("overlay route wins over session route", () => {
    expect(getMobileDepth(input({ hasSessionRoute: true, hasOverlayRoute: true }))).toBe(2);
  });
});
