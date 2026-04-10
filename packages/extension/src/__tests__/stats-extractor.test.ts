import { describe, it, expect } from "vitest";
import { extractTurnStats } from "@blackbelt-technology/pi-dashboard-shared/stats-extractor.js";

describe("extractTurnStats", () => {
  it("extracts stats from event.message.usage", () => {
    const event = {
      type: "turn_end",
      turnIndex: 0,
      message: {
        usage: {
          input: 1500,
          output: 300,
          cacheRead: 800,
          cacheWrite: 200,
          totalTokens: 2800,
          cost: { input: 0.001, output: 0.002, cacheRead: 0.0005, cacheWrite: 0.0005, total: 0.004 },
        },
      },
      toolResults: [],
    };

    const result = extractTurnStats(event);

    expect(result).toEqual({
      tokensIn: 1500,
      tokensOut: 300,
      cost: 0.004,
      turnUsage: {
        input: 1500,
        output: 300,
        cacheRead: 800,
        cacheWrite: 200,
      },
    });
  });

  it("returns null when message.usage is undefined", () => {
    const event = {
      type: "turn_end",
      turnIndex: 0,
      message: { role: "assistant", content: [] },
      toolResults: [],
    };

    expect(extractTurnStats(event)).toBeNull();
  });

  it("returns null when message is undefined", () => {
    const event = { type: "turn_end", turnIndex: 0 };
    expect(extractTurnStats(event)).toBeNull();
  });

  it("includes contextUsage when provided", () => {
    const event = {
      type: "turn_end",
      message: {
        usage: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 150,
          cost: { total: 0.001 },
        },
      },
    };

    const result = extractTurnStats(event, { tokens: 5000, contextWindow: 128000 });

    expect(result?.contextUsage).toEqual({ tokens: 5000, contextWindow: 128000 });
  });

  it("omits contextUsage when not provided", () => {
    const event = {
      type: "turn_end",
      message: {
        usage: {
          input: 100,
          output: 50,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 150,
          cost: { total: 0.001 },
        },
      },
    };

    const result = extractTurnStats(event);

    expect(result?.contextUsage).toBeUndefined();
  });
});
