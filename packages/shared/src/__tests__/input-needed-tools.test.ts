import { describe, expect, it } from "vitest";
import { isInputNeededTool, isProposeWrite } from "../input-needed-tools.js";

describe("isProposeWrite", () => {
  it("returns true for toolName write:xd://propose", () => {
    expect(isProposeWrite("write:xd://propose")).toBe(true);
    expect(isProposeWrite("propose")).toBe(true);
  });

  it("returns true for write with path xd://propose or xdev.tool propose", () => {
    expect(isProposeWrite("write", { path: "xd://propose" })).toBe(true);
    expect(isProposeWrite("write", { xdev: { tool: "propose" } })).toBe(true);
  });

  it("returns false for plain write with normal path, non-exact xd://propose, or no args", () => {
    expect(isProposeWrite("write")).toBe(false);
    expect(isProposeWrite("write", { path: "foo/xd://propose" })).toBe(false);
    expect(isProposeWrite("write", { path: "src/index.ts" })).toBe(false);
    expect(isProposeWrite("write", { path: "README.md" })).toBe(false);
  });
});

describe("isInputNeededTool", () => {
  it("returns true for ask_user and ask without args", () => {
    expect(isInputNeededTool("ask_user")).toBe(true);
    expect(isInputNeededTool("ask")).toBe(true);
  });

  it("returns true for propose write tool calls", () => {
    expect(isInputNeededTool("write", { path: "xd://propose" })).toBe(true);
    expect(isInputNeededTool("write", { xdev: { tool: "propose" } })).toBe(true);
    expect(isInputNeededTool("propose")).toBe(true);
  });

  it("returns false for normal write or other tools", () => {
    expect(isInputNeededTool("write")).toBe(false);
    expect(isInputNeededTool("write", { path: "src/foo.ts" })).toBe(false);
    expect(isInputNeededTool("Read")).toBe(false);
    expect(isInputNeededTool(null)).toBe(false);
    expect(isInputNeededTool(undefined)).toBe(false);
  });
});
