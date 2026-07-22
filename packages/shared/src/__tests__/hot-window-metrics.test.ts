import { describe, expect, it } from "vitest";
import { sanitizeHotWindowReport } from "../hot-window-metrics.js";

describe("sanitizeHotWindowReport", () => {
  it("carries only numeric/label fields, never content", () => {
    const r = sanitizeHotWindowReport({
      sessionId: "s",
      ledgerBytes: 1,
      ledgerEvents: 2,
      persisterBytes: 3,
      messages: 4,
      toolCalls: 5,
      subagents: 6,
      interactiveRequests: 7,
      detailBytes: 8,
      evictions: 9,
      highWaterBytes: 10,
      derivationMs: 11,
      hydrationSource: "cache",
    } as any);
    expect(Object.values(r).some((v) => typeof v === "string" && v.length > 256)).toBe(false);
    expect(r.hydrationSource).toBe("cache");
  });

  it("drops unknown keys and never lets content ride along", () => {
    const r = sanitizeHotWindowReport({
      sessionId: "s",
      ledgerBytes: 1,
      ledgerEvents: 2,
      persisterBytes: 3,
      messages: 4,
      toolCalls: 5,
      subagents: 6,
      interactiveRequests: 7,
      detailBytes: 8,
      evictions: 9,
      highWaterBytes: 10,
      derivationMs: 11,
      hydrationSource: "stream",
      messageText: "this is transcript content that must never ride along",
      toolArgs: { secret: "value" },
      rawEvent: { type: "message_start", data: { text: "hello world" } },
    } as any);
    expect((r as unknown as Record<string, unknown>).messageText).toBeUndefined();
    expect((r as unknown as Record<string, unknown>).toolArgs).toBeUndefined();
    expect((r as unknown as Record<string, unknown>).rawEvent).toBeUndefined();
    expect(Object.keys(r).sort()).toEqual(
      [
        "derivationMs",
        "detailBytes",
        "evictions",
        "highWaterBytes",
        "hydrationSource",
        "interactiveRequests",
        "ledgerBytes",
        "ledgerEvents",
        "messages",
        "persisterBytes",
        "sessionId",
        "subagents",
        "toolCalls",
      ],
    );
  });

  it("clamps negative/NaN numbers to 0 and caps label length", () => {
    const r = sanitizeHotWindowReport({
      sessionId: "s".repeat(400),
      ledgerBytes: -5,
      ledgerEvents: Number.NaN,
      persisterBytes: -1,
      messages: -1,
      toolCalls: -1,
      subagents: -1,
      interactiveRequests: -1,
      detailBytes: -1,
      evictions: -1,
      highWaterBytes: -1,
      derivationMs: -1,
      hydrationSource: "bogus",
      coldStartTrigger: "x".repeat(500),
    } as any);
    expect(r.ledgerBytes).toBe(0);
    expect(r.ledgerEvents).toBe(0);
    expect(r.persisterBytes).toBe(0);
    expect(r.messages).toBe(0);
    expect(r.hydrationSource).toBe("memory");
    expect(r.sessionId.length).toBeLessThanOrEqual(256);
    expect(r.coldStartTrigger?.length).toBeLessThanOrEqual(256);
  });

  it("defaults a missing sessionId to an empty bounded string and never throws", () => {
    const r = sanitizeHotWindowReport({} as any);
    expect(typeof r.sessionId).toBe("string");
    expect(r.ledgerBytes).toBe(0);
    expect(r.hydrationSource).toBe("memory");
  });
});
