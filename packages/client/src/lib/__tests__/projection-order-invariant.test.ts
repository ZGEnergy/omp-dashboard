import type { SeqEvent } from "@blackbelt-technology/pi-dashboard-shared/event-window.js";
import { ALL_SCENARIOS, generateSession } from "@blackbelt-technology/pi-dashboard-shared/test-support/generate-session.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import { createInitialState, reduceEvent } from "../event-reducer.js";

/**
 * THE property test that would have caught PR #102.
 *
 * The invariant: projection may REDUCE events but may never MOVE them. Every
 * surviving event keeps its original `seq`, and no surviving event's content
 * may depend on an event with a higher `seq`.
 *
 * #102 dropped every `message_update` in any turn that had a `message_end`, so
 * assistant prose stopped existing as positioned events; the reducer rebuilt it
 * at `message_end`, which sorts AFTER the turn's tool events. Every turn with a
 * tool call rendered as a wall of tool results followed by a lump of text.
 *
 * This test reduces raw events and projected events through the REAL reducer and
 * compares rendered row order + roles. Tool payload CONTENT is deliberately
 * excluded — that is the one thing a projection is allowed to change.
 * See change: hydration-tool-stub-projection.
 */

/** Row role + stable key per rendered row. Tool payload CONTENT is excluded. */
export function renderShape(events: SeqEvent<DashboardEvent>[]): Array<{ role: string; key: string }> {
  let state = createInitialState();
  for (const { seq, event } of events) state = reduceEvent(state, event, { seq });
  return state.messages.map((m) => ({ role: m.role, key: m.toolCallId ?? m.id }));
}

export function assertOrderInvariant(
  raw: SeqEvent<DashboardEvent>[],
  projected: SeqEvent<DashboardEvent>[],
  label: string,
): void {
  expect(
    projected.map((e) => e.seq),
    `${label}: seq set must be identical (projection blanks in place, never removes)`,
  ).toEqual(raw.map((e) => e.seq));
  expect(renderShape(projected), `${label}: rendered row order/roles must match raw`).toEqual(renderShape(raw));
}

describe("projection order invariant", () => {
  it("identity projection preserves order for every scenario", () => {
    for (const scenario of ALL_SCENARIOS) {
      const raw = generateSession(scenario, 42);
      assertOrderInvariant(raw, raw.slice(), scenario);
    }
  });

  it("REGRESSION PROOF: a #102-style projection that reconstructs text at message_end is rejected", () => {
    // #102 dropped every message_update in a turn that had a message_end. Here
    // the same defect is expressed as blanking (the shape this codebase can
    // actually deliver, since removal would break ledger contiguity): prose
    // stops existing at its own seq and the reducer rebuilds it at message_end,
    // which sorts AFTER the turn's tool rows.
    const raw = generateSession("text-before-tool", 42);
    const hasEnd = raw.some((e) => e.event.eventType === "message_end");
    const broken = raw.map((entry) =>
      hasEnd && entry.event.eventType === "message_update"
        ? {
            seq: entry.seq,
            event: {
              eventType: "message_update",
              timestamp: entry.event.timestamp,
              data: {},
            } as unknown as DashboardEvent,
          }
        : entry,
    );
    // Assert the SPECIFIC inversion, not merely that something threw. Measured:
    //   raw    → user, assistant("Let me read the file."), toolResult
    //   broken → user, toolResult, assistant (rebuilt at message_end)
    const rawShape = renderShape(raw).map((r) => r.role);
    const brokenShape = renderShape(broken).map((r) => r.role);
    expect(rawShape.indexOf("assistant")).toBeLessThan(rawShape.indexOf("toolResult"));
    expect(brokenShape.indexOf("assistant")).toBeGreaterThan(brokenShape.indexOf("toolResult"));
    expect(() => assertOrderInvariant(raw, broken, "#102")).toThrow();
  });
});
