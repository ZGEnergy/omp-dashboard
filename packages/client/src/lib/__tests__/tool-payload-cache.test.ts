import { describe, expect, it } from "vitest";
import { TOOL_PAYLOAD_CACHE_BYTES, ToolPayloadCache } from "../tool-payload-cache.js";

describe("ToolPayloadCache", () => {
  it("stores and returns a payload", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "hello", false);
    expect(cache.get("t1")).toEqual({ payload: "hello", truncated: false });
    expect(cache.has("t1")).toBe(true);
  });

  it("returns undefined for an unknown id", () => {
    expect(new ToolPayloadCache().get("nope")).toBeUndefined();
  });

  it("evicts least-recently-used entries above the byte ceiling", () => {
    const cache = new ToolPayloadCache();
    const big = "x".repeat(Math.floor(TOOL_PAYLOAD_CACHE_BYTES * 0.6));
    cache.set("a", big, false);
    cache.set("b", big, false);
    expect(cache.has("a")).toBe(false); // evicted to make room for b
    expect(cache.has("b")).toBe(true);
    expect(cache.bytes).toBeLessThanOrEqual(TOOL_PAYLOAD_CACHE_BYTES);
  });

  it("counts a read as a use, so the read entry survives the next eviction", () => {
    const cache = new ToolPayloadCache();
    const third = "x".repeat(Math.floor(TOOL_PAYLOAD_CACHE_BYTES * 0.4));
    cache.set("a", third, false);
    cache.set("b", third, false);
    cache.get("a"); // 'a' becomes most-recently-used
    cache.set("c", third, false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("drops a single payload larger than the whole ceiling instead of thrashing", () => {
    const cache = new ToolPayloadCache();
    cache.set("huge", "x".repeat(TOOL_PAYLOAD_CACHE_BYTES + 1), true);
    expect(cache.has("huge")).toBe(false);
    expect(cache.bytes).toBe(0);
  });

  it("does not double-count a re-set key", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "aaaa", false);
    cache.set("t1", "bb", false);
    expect(cache.bytes).toBe(2);
    expect(cache.get("t1")!.payload).toBe("bb");
  });

  it("preserves the truncated flag", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "partial", true);
    expect(cache.get("t1")!.truncated).toBe(true);
  });

  it("clear() empties the cache and resets the byte count", () => {
    const cache = new ToolPayloadCache();
    cache.set("t1", "hello", false);
    cache.clear();
    expect(cache.has("t1")).toBe(false);
    expect(cache.bytes).toBe(0);
  });
});
