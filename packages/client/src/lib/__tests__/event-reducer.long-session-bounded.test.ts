import { describe, expect, it } from "vitest";
import { createInitialState, evictBelow, reduceEvent } from "../event-reducer.js";
import {
  computeChatFloorSeq,
  computeToolFloorSeq,
  DEFAULT_CHAT_RETAINED_TURNS,
  DEFAULT_TOOL_TIER_MAX_BYTES,
  DEFAULT_TOOL_TIER_MAX_COUNT,
} from "../two-tier-floors.js";

describe("long synthetic session stays bounded", () => {
  it("keeps toolCalls bounded while chat survives as the ledger evicts", () => {
    let s = createInitialState();
    let seq = 0;
    for (let turn = 0; turn < 1000; turn += 1) {
      s = reduceEvent(s, { eventType: "message_start", timestamp: 0, data: { role: "user", message: { role: "user", content: `turn ${turn}` } } } as any, { seq: ++seq });
      for (let k = 0; k < 20; k += 1) { // tool salvo
        s = reduceEvent(s, { eventType: "tool_execution_start", timestamp: 0, data: { toolCallId: `t${seq}`, toolName: "bash" } } as any, { seq: ++seq });
        s = reduceEvent(s, { eventType: "tool_execution_end", timestamp: 0, data: { toolCallId: `t${seq - 1}`, result: "z".repeat(1000) } } as any, { seq: ++seq });
      }
      s = evictBelow(s, {
        chatFloorSeq: computeChatFloorSeq(s.messages, DEFAULT_CHAT_RETAINED_TURNS, null),
        toolFloorSeq: computeToolFloorSeq(s.toolCalls.values(), DEFAULT_TOOL_TIER_MAX_BYTES, DEFAULT_TOOL_TIER_MAX_COUNT),
      });
    }
    expect(s.toolCalls.size).toBeLessThanOrEqual(DEFAULT_TOOL_TIER_MAX_COUNT);
    const userTurns = s.messages.filter((m) => m.role === "user").length;
    expect(userTurns).toBeGreaterThan(0); // chat not annihilated by tool salvos
  });
});
