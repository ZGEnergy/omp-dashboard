/**
 * Focused tests for the pure multiselect response decoder.
 *
 * PromptBus end-to-end routing is covered by the faux-session integration
 * suite, which exercises the real bridge lifecycle.
 */
import { describe, it, expect } from "vitest";
import { decodeMultiselectAnswer } from "../multiselect-decode.js";

// ──────────────────────────────────────────────────────────────────────
// `decodeMultiselectAnswer` — pure helper used by both the runtime patch
// and the TUI adapter's response encoding round-trip.
// ──────────────────────────────────────────────────────────────────────

describe("decodeMultiselectAnswer", () => {
  it("resolves cancellation as undefined", () => {
    expect(decodeMultiselectAnswer({ cancelled: true })).toBeUndefined();
    expect(decodeMultiselectAnswer({ cancelled: true, answer: '["x"]' })).toBeUndefined();
  });

  it("resolves successful selection from JSON-encoded array", () => {
    expect(decodeMultiselectAnswer({ cancelled: false, answer: '["a","c"]' })).toEqual(["a", "c"]);
  });

  it("resolves empty selection as []", () => {
    expect(decodeMultiselectAnswer({ cancelled: false, answer: "[]" })).toEqual([]);
  });

  it("resolves null / undefined / empty answer as [] (not undefined)", () => {
    expect(decodeMultiselectAnswer({ cancelled: false, answer: undefined })).toEqual([]);
    expect(decodeMultiselectAnswer({ cancelled: false, answer: "" })).toEqual([]);
  });

  it("resolves unparseable JSON as [] without throwing", () => {
    expect(decodeMultiselectAnswer({ cancelled: false, answer: "not-json" })).toEqual([]);
    expect(decodeMultiselectAnswer({ cancelled: false, answer: "{not:array}" })).toEqual([]);
  });

  it("resolves valid JSON that is not an array as []", () => {
    expect(decodeMultiselectAnswer({ cancelled: false, answer: '"just-a-string"' })).toEqual([]);
    expect(decodeMultiselectAnswer({ cancelled: false, answer: '{"k":"v"}' })).toEqual([]);
  });
});

