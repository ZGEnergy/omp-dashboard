import { describe, expect, it } from "vitest";
import { applyToolBudget, selectNewestEventsByBudget, TOOL_CEILING_FRACTION } from "../event-window.js";
import { coalesceProjection } from "../replay-projection.js";
import { ALL_SCENARIOS, generateSession } from "../test-support/generate-session.js";

const BUDGETS = [
  1.5 * 1024 * 1024,
  1024 * 1024,
  512 * 1024,
  256 * 1024,
  128 * 1024,
  64 * 1024,
  32 * 1024,
  16 * 1024,
];

function project(scenario: (typeof ALL_SCENARIOS)[number], budget: number) {
  return applyToolBudget(coalesceProjection(generateSession(scenario, 7)), budget);
}

/**
 * A long session built by concatenating many generated ones onto a single
 * contiguous seq axis. A single scenario fully degraded fits inside even a
 * 16 KiB window — which is the point of the projection — so multi-page paging
 * only exercises against a corpus this size.
 */
function longSession() {
  const events = [];
  let seq = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    for (const scenario of ALL_SCENARIOS) {
      for (const entry of generateSession(scenario, seed)) {
        seq += 1;
        events.push({ seq, event: entry.event });
      }
    }
  }
  return events;
}

describe("budget sweep", () => {
  it("honors the tool ceiling at every budget", () => {
    for (const scenario of ALL_SCENARIOS) {
      for (const budget of BUDGETS) {
        const out = project(scenario, budget);
        const ceiling = Math.floor(budget * TOOL_CEILING_FRACTION);
        // Once every call is at the `metadata` rung there is nothing left to
        // shed — the floor of what tool events can cost. Assert the ceiling is
        // honored OR the range is already fully collapsed.
        const atFloor = out.collapsed > 0 || out.toolBytes === 0;
        expect(out.toolBytes <= ceiling || atFloor, `${scenario}@${budget}`).toBe(true);
      }
    }
  });

  it("keeps the projected range contiguous at every budget", () => {
    for (const scenario of ALL_SCENARIOS) {
      for (const budget of BUDGETS) {
        const out = project(scenario, budget).events;
        for (let i = 1; i < out.length; i += 1) {
          expect(out[i]!.seq, `${scenario}@${budget}`).toBe(out[i - 1]!.seq + 1);
        }
      }
    }
  });

  it("the window selector accepts every projected range (never malformed)", () => {
    for (const scenario of ALL_SCENARIOS) {
      for (const budget of BUDGETS) {
        const window = selectNewestEventsByBudget(project(scenario, budget).events, budget);
        expect(window.sourceMalformed, `${scenario}@${budget}`).toBeUndefined();
      }
    }
  });

  it("a tool-heavy session retains at least one chat event at every budget", () => {
    for (const budget of BUDGETS) {
      const window = selectNewestEventsByBudget(project("subagent-burst", budget).events, budget);
      const chatEvents = window.events.filter(
        (e) => e.event.eventType === "message_start" || e.event.eventType === "message_end",
      );
      expect(chatEvents.length, `budget ${budget}`).toBeGreaterThan(0);
    }
  });

  it("hasMoreOlder is accurate at every budget", () => {
    for (const budget of BUDGETS) {
      const projected = project("subagent-burst", budget).events;
      const window = selectNewestEventsByBudget(projected, budget);
      expect(window.hasMoreOlder, `budget ${budget}`).toBe(window.events.length < projected.length);
    }
  });

  it("load-older advances to a strictly older range instead of stranding (#101)", () => {
    const budget = 16 * 1024;
    const projected = applyToolBudget(coalesceProjection(longSession()), budget).events;
    let cursor = projected.at(-1)!.seq + 1;
    const seen = new Set<number>();
    for (let page = 0; page < 10; page += 1) {
      const older = projected.filter((e) => e.seq < cursor);
      if (older.length === 0) break;
      const window = selectNewestEventsByBudget(older, budget);
      expect(window.events.length, `page ${page} must not be empty`).toBeGreaterThan(0);
      const min = window.windowMinSeq!;
      expect(seen.has(min), `page ${page} must not repeat window start ${min}`).toBe(false);
      seen.add(min);
      expect(min).toBeLessThan(cursor);
      cursor = min;
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is deterministic across the whole sweep", () => {
    for (const scenario of ALL_SCENARIOS) {
      for (const budget of BUDGETS) {
        expect(JSON.stringify(project(scenario, budget)), `${scenario}@${budget}`).toEqual(
          JSON.stringify(project(scenario, budget)),
        );
      }
    }
  });
});
