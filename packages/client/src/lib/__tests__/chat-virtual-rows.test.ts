import { describe, expect, it } from "vitest";
import {
  buildTurnToFirstRowIndex,
  estimateVirtualRowSize,
  isBurst,
  isGroup,
  virtualRowKey,
} from "../chat-virtual-rows.js";
import type { ChatMessage } from "../event-reducer.js";
import type { BurstItem, ToolBurstGroup } from "../group-tool-bursts.js";
import type { ToolCallGroup } from "../group-tool-calls.js";

function msg(partial: Partial<ChatMessage> & { id: string }): ChatMessage {
  return { role: "assistant", content: "", timestamp: 0, ...partial };
}

function burst(id: string): ToolBurstGroup {
  return { type: "burst", id, items: [] };
}

function group(memberId?: string, toolName = "bash"): ToolCallGroup {
  return {
    type: "group",
    toolName,
    messages: memberId ? [msg({ id: memberId, role: "toolResult" })] : [],
  } as unknown as ToolCallGroup;
}

describe("virtualRowKey (CR-3)", () => {
  it("keys a burst by its id", () => {
    expect(virtualRowKey(burst("b1"), 0)).toBe("b1");
  });

  it("keys a group by its first member id", () => {
    expect(virtualRowKey(group("m1"), 3)).toBe("m1");
  });

  it("falls back to a positional group key (never a bare toolName)", () => {
    // A member-less group would otherwise collide across two sub-threshold
    // bursts of the same tool — synthesize a per-position id instead.
    expect(virtualRowKey(group(undefined, "bash"), 7)).toBe("group-7");
  });

  it("keys a plain message by its id", () => {
    expect(virtualRowKey(msg({ id: "u1", role: "user" }), 0)).toBe("u1");
  });

  it("produces unique keys across a mixed row list", () => {
    const rows: BurstItem[] = [
      msg({ id: "u1", role: "user" }),
      burst("b1"),
      group("m1"),
      group(undefined),
      msg({ id: "a1", role: "assistant" }),
    ];
    const keys = rows.map((r, i) => virtualRowKey(r, i));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("estimateVirtualRowSize (task 2.2)", () => {
  it("estimates a burst taller than a turn separator", () => {
    expect(estimateVirtualRowSize(burst("b"))).toBeGreaterThan(
      estimateVirtualRowSize(msg({ id: "s", role: "turnSeparator" })),
    );
  });

  it("returns a positive estimate for every message role", () => {
    const roles: ChatMessage["role"][] = [
      "user",
      "assistant",
      "toolResult",
      "thinking",
      "bashOutput",
      "commandFeedback",
      "interactiveUi",
      "turnSeparator",
      "rawEvent",
      "inlineTerminal",
    ];
    for (const role of roles) {
      expect(estimateVirtualRowSize(msg({ id: role, role }))).toBeGreaterThan(0);
    }
  });
});

describe("buildTurnToFirstRowIndex (CR-4)", () => {
  it("maps each turnIndex to its first row index", () => {
    const rows: BurstItem[] = [
      msg({ id: "u0", role: "user", turnIndex: 0 }),
      msg({ id: "a0", role: "assistant" }),
      burst("b0"),
      msg({ id: "u1", role: "user", turnIndex: 1 }),
      msg({ id: "a1", role: "assistant" }),
    ];
    const map = buildTurnToFirstRowIndex(rows);
    expect(map.get(0)).toBe(0);
    expect(map.get(1)).toBe(3);
  });

  it("keeps the first row for a duplicated turnIndex", () => {
    const rows: BurstItem[] = [
      msg({ id: "u2a", role: "user", turnIndex: 2 }),
      msg({ id: "u2b", role: "user", turnIndex: 2 }),
    ];
    expect(buildTurnToFirstRowIndex(rows).get(2)).toBe(0);
  });

  it("skips burst/group rows (they carry no turnIndex)", () => {
    const rows: BurstItem[] = [
      burst("b"),
      group("m"),
      msg({ id: "u5", role: "user", turnIndex: 5 }),
    ];
    const map = buildTurnToFirstRowIndex(rows);
    expect(map.size).toBe(1);
    expect(map.get(5)).toBe(2);
  });

  it("returns an empty map when no row carries a turnIndex", () => {
    expect(buildTurnToFirstRowIndex([burst("b"), msg({ id: "a", role: "assistant" })]).size).toBe(0);
  });
});

describe("type guards", () => {
  it("discriminates burst / group / message", () => {
    expect(isBurst(burst("b"))).toBe(true);
    expect(isGroup(group("m"))).toBe(true);
    expect(isBurst(msg({ id: "m", role: "user" }))).toBe(false);
    expect(isGroup(msg({ id: "m", role: "user" }))).toBe(false);
  });
});
