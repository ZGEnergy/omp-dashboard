import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createInitialState, MAX_DERIVED_DETAIL_BYTES, reduceEvent } from "../event-reducer.js";

describe("derived subagent detail cap", () => {
  it("caps oversized subagent detail entries but retains a terminal summary", () => {
    const big = "x".repeat(400_000);
    const event: DashboardEvent = {
      eventType: "subagent_started",
      timestamp: 0,
      data: {
        id: "sa1",
        details: {
          entries: [{ kind: "text", text: big, ts: 0 }],
          activity: "done",
        },
      },
    };
    const state = reduceEvent(createInitialState(), event, { seq: 1 });

    const sub = state.subagents.get("sa1");
    const detailBytes = new TextEncoder().encode(JSON.stringify(sub?.entries ?? [])).length;
    expect(detailBytes).toBeLessThanOrEqual(MAX_DERIVED_DETAIL_BYTES);
    // Summary scalar retained despite entries being capped.
    expect(sub?.activity).toBe("done");
  });

  it("leaves entries untouched when under the cap", () => {
    const event: DashboardEvent = {
      eventType: "subagent_started",
      timestamp: 0,
      data: {
        id: "sa2",
        details: {
          entries: [{ kind: "text", text: "small", ts: 0 }],
          activity: "running",
        },
      },
    };
    const state = reduceEvent(createInitialState(), event, { seq: 1 });

    const sub = state.subagents.get("sa2");
    expect(sub?.entries).toEqual([{ kind: "text", text: "small", ts: 0 }]);
    expect(sub?.activity).toBe("running");
  });
});
