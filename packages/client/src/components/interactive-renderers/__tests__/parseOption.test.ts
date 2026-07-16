import { describe, it, expect } from "vitest";
import { parseOption, isCancelOption, optionValue } from "../parseOption.js";

// omp's `ask` tool sends options as `{ label, description }` objects, not the
// plain strings pi's ask_user uses. The option helpers must accept both so the
// question card renders instead of crashing on `.trim()` of an object.
describe("parseOption — pi strings and omp option objects", () => {
  it("splits a pi string on the em-dash separator", () => {
    expect(parseOption("Title — description")).toEqual({ title: "Title", description: "description" });
  });
  it("returns a plain pi string as the title", () => {
    expect(parseOption("Just a title")).toEqual({ title: "Just a title" });
  });
  it("maps an omp {label, description} object", () => {
    expect(parseOption({ label: "Core dashboard first", description: "Smallest overlay." })).toEqual({
      title: "Core dashboard first",
      description: "Smallest overlay.",
    });
  });
  it("maps an omp {label} object without description", () => {
    expect(parseOption({ label: "Full parity" })).toEqual({ title: "Full parity" });
  });
  it("does not throw on non-string / non-option values", () => {
    expect(() => parseOption(42)).not.toThrow();
    expect(() => parseOption(null)).not.toThrow();
  });
});

describe("optionValue — the answer/key string", () => {
  it("returns a pi string as-is", () => {
    expect(optionValue("Answer A")).toBe("Answer A");
  });
  it("returns an omp option's label", () => {
    expect(optionValue({ label: "Core dashboard first", description: "x" })).toBe("Core dashboard first");
  });
});

describe("isCancelOption", () => {
  it("matches a pi 'Cancel' string (case/space-insensitive)", () => {
    expect(isCancelOption("Cancel")).toBe(true);
    expect(isCancelOption(" cancel ")).toBe(true);
  });
  it("matches an omp {label:'Cancel'} object", () => {
    expect(isCancelOption({ label: "Cancel" })).toBe(true);
  });
  it("does not match other options and does not throw on objects", () => {
    expect(isCancelOption({ label: "Core dashboard first" })).toBe(false);
    expect(() => isCancelOption(42)).not.toThrow();
  });
});
