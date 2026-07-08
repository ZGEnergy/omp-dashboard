/**
 * Per-fire `${{trigger}}` interpolation tests.
 * See change: wire-flow-inputs-in-automation.
 */
import { describe, expect, it } from "vitest";
import { interpolate } from "../server/interpolate.js";

describe("interpolate ${{trigger}}", () => {
  it("resolves a whole-value token to the typed value unchanged", () => {
    expect(interpolate("${{trigger}}", "/spool/inv.pdf")).toBe("/spool/inv.pdf");
    expect(interpolate("${{trigger}}", 5)).toBe(5);
    expect(interpolate("${{trigger}}", true)).toBe(true);
    const obj = { a: 1 };
    expect(interpolate("${{trigger}}", obj)).toBe(obj);
  });

  it("stringifies an embedded token in surrounding text", () => {
    expect(interpolate("Process ${{trigger}} now", "/spool/inv.pdf")).toBe("Process /spool/inv.pdf now");
    expect(interpolate("n=${{trigger}}", 5)).toBe("n=5");
  });

  it("resolves an absent value to empty string", () => {
    expect(interpolate("${{trigger}}", undefined)).toBe("");
    expect(interpolate("x=${{trigger}}", undefined)).toBe("x=");
  });

  it("recurses objects and arrays, leaving non-template values intact", () => {
    const out = interpolate(
      { file: "${{trigger}}", label: "static", nested: { p: "at ${{trigger}}" }, arr: ["${{trigger}}"] },
      "/spool/a.pdf",
    );
    expect(out).toEqual({
      file: "/spool/a.pdf",
      label: "static",
      nested: { p: "at /spool/a.pdf" },
      arr: ["/spool/a.pdf"],
    });
  });

  it("passes through non-string primitives untouched", () => {
    expect(interpolate(42, "/x")).toBe(42);
    expect(interpolate(false, "/x")).toBe(false);
    expect(interpolate(null, "/x")).toBe(null);
  });
});
