import { coalesceProjection } from "@blackbelt-technology/pi-dashboard-shared/replay-projection.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState, reduceEvent } from "../event-reducer.js";

/**
 * The projection blanks superseded events IN PLACE, preserving `eventType` so
 * the seq range stays contiguous. A blanked `tool_execution_update` therefore
 * reaches the reducer with empty `data` and no `toolCallId` — expected, not
 * malformed. Warning on each would flood the console on every tool-heavy
 * hydration. See change: hydration-tool-stub-projection.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

function ev(seq: number, eventType: string, data: Record<string, unknown>) {
  return { seq, event: { eventType, timestamp: seq, data } as unknown as DashboardEvent };
}

describe("reducer vs blanked projection events", () => {
  it("REGRESSION: does not warn for blanked tool events", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const projected = coalesceProjection([
      ev(1, "tool_execution_start", { toolCallId: "t1", toolName: "Bash" }),
      ev(2, "tool_execution_update", { toolCallId: "t1", partialResult: "a" }),
      ev(3, "tool_execution_update", { toolCallId: "t1", partialResult: "ab" }),
      ev(4, "tool_execution_end", { toolCallId: "t1", toolName: "Bash", result: "done" }),
    ]);
    let state = createInitialState();
    for (const { seq, event } of projected) state = reduceEvent(state, event, { seq });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still warns for a GENUINELY malformed tool event", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let state = createInitialState();
    // Non-empty data but no toolCallId — the real malformed case.
    state = reduceEvent(state, ev(1, "tool_execution_update", { partialResult: "orphan" }).event, { seq: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
