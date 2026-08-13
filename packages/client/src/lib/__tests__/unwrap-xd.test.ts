import { describe, expect, it } from "vitest";
import { unwrapXdToolCall } from "../unwrap-xd.js";

describe("unwrapXdToolCall", () => {
  it("prioritizes toolDetails.xdev when present", () => {
    const result = unwrapXdToolCall(
      "write",
      { path: "xd://ignored", content: '{"foo": "bar"}' },
      { xdev: { tool: "eval", inner: { code: "console.log(1)" } } },
    );
    expect(result).toEqual({
      effectiveToolName: "eval",
      effectiveArgs: { code: "console.log(1)" },
    });
  });

  it("supports xdev.args fallback when xdev.inner is missing", () => {
    const result = unwrapXdToolCall(
      "write",
      { path: "xd://ignored" },
      { xdev: { tool: "browser", args: { url: "https://example.com" } } },
    );
    expect(result).toEqual({
      effectiveToolName: "browser",
      effectiveArgs: { url: "https://example.com" },
    });
  });

  it("unwraps write tool calls to xd:// with valid JSON content", () => {
    const result = unwrapXdToolCall("write", {
      path: "xd://eval",
      content: '{"language": "py", "code": "print(42)"}',
    });
    expect(result).toEqual({
      effectiveToolName: "eval",
      effectiveArgs: { language: "py", code: "print(42)" },
    });
  });

  it("unwraps xd:// path for MCP tools", () => {
    const result = unwrapXdToolCall("write", {
      path: "xd://mcp__context_mode_context_mode_ctx_execute",
      content: '{"command": "ls"}',
    });
    expect(result).toEqual({
      effectiveToolName: "ctx_execute",
      effectiveArgs: { command: "ls" },
    });
  });

  it("handles double-underscore MCP paths", () => {
    const result = unwrapXdToolCall("write", {
      path: "xd://mcp__server__custom_tool",
      content: '{"a": 1}',
    });
    expect(result).toEqual({
      effectiveToolName: "custom_tool",
      effectiveArgs: { a: 1 },
    });
  });

  it("falls back to raw string content on invalid or truncated JSON", () => {
    const result = unwrapXdToolCall("write", {
      path: "xd://eval",
      content: '{"code": "print(',
    });
    expect(result).toEqual({
      effectiveToolName: "eval",
      effectiveArgs: { raw: '{"code": "print(' },
    });
  });

  it("maps alias names (puppeteer -> browser, irc -> hub)", () => {
    const res1 = unwrapXdToolCall("puppeteer", { url: "https://a.b" });
    expect(res1.effectiveToolName).toBe("browser");

    const res2 = unwrapXdToolCall("write", {
      path: "xd://irc",
      content: '{"op": "send"}',
    });
    expect(res2.effectiveToolName).toBe("hub");
  });

  it("passes through standard non-xd tool calls unchanged", () => {
    const result = unwrapXdToolCall("bash", { command: "npm test" });
    expect(result).toEqual({
      effectiveToolName: "bash",
      effectiveArgs: { command: "npm test" },
    });
  });
});
