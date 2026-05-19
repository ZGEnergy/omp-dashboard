/**
 * Tests for the bridge's per-entry shadow-queue drain on user message_start.
 *
 * Pi mirrors this exact algorithm internally (see
 * `@earendil-works/pi-coding-agent/dist/core/agent-session.js`
 * `_processAgentEvent`, around line 270-292):
 *
 *   if (event.type === "message_start" && event.message.role === "user") {
 *     const text = _getUserMessageText(event.message);
 *     const steeringIdx = _steeringMessages.indexOf(text);
 *     if (steeringIdx !== -1) {
 *       _steeringMessages.splice(steeringIdx, 1);
 *       _emitQueueUpdate();
 *     } else {
 *       const followUpIdx = _followUpMessages.indexOf(text);
 *       if (followUpIdx !== -1) {
 *         _followUpMessages.splice(followUpIdx, 1);
 *         _emitQueueUpdate();
 *       }
 *     }
 *   }
 *
 * Pre-fix bug: bridge bulk-cleared `bridgeFollowUp = []` at every `agent_end`
 * and `bridgeSteering = []` at every `turn_end`. With pi's `mode:"all"`
 * (default), pi drains all queued follow-ups across multiple turns before
 * emitting the final `agent_end`. The dashboard saw the entire queue stay
 * visible for the whole drain window, then disappear all at once at the
 * end — instead of shrinking one entry per drain as the user observes them
 * being processed.
 *
 * Fix: bridge mirrors pi's per-entry matcher on user `message_start`. Bulk
 * clears at `agent_end` / `turn_end` are removed (would otherwise wipe
 * entries the user added DURING a drain).
 *
 * See change: add-followup-edit-and-steer-cancel (per-entry-drain scenario).
 */
import { describe, it, expect } from "vitest";

interface ShadowQueue {
  steering: string[];
  followUp: string[];
}

/**
 * Pure mirror of the per-entry drain matcher as it lives in bridge.ts'
 * `message_start` handler. If production drifts from this shape, the
 * test should drift in lockstep.
 */
function makeShadowDrainMatcher() {
  const queue: ShadowQueue = { steering: [], followUp: [] };
  const emits: ShadowQueue[] = [];
  function emit() {
    emits.push({ steering: [...queue.steering], followUp: [...queue.followUp] });
  }

  /** Mirrors pi's `_getUserMessageText` exactly. */
  function getUserMessageText(message: { role: string; content: unknown }): string {
    if (message.role !== "user") return "";
    const content = message.content;
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .filter((c: any) => c && c.type === "text")
      .map((c: any) => c.text ?? "")
      .join("");
  }

  /** Call when pi emits a user `message_start`. Mirrors pi's internal logic. */
  function onUserMessageStart(message: { role: string; content: unknown }): void {
    const text = getUserMessageText(message);
    if (!text) return;
    const steeringIdx = queue.steering.indexOf(text);
    if (steeringIdx !== -1) {
      queue.steering.splice(steeringIdx, 1);
      emit();
      return;
    }
    const followUpIdx = queue.followUp.indexOf(text);
    if (followUpIdx !== -1) {
      queue.followUp.splice(followUpIdx, 1);
      emit();
    }
  }

  return {
    queue,
    emits,
    onUserMessageStart,
    recordSteer: (t: string) => { queue.steering.push(t); emit(); },
    recordFollowup: (t: string) => { queue.followUp.push(t); emit(); },
    snapshotQueue: () => ({ steering: [...queue.steering], followUp: [...queue.followUp] }),
    snapshotEmits: () => emits.map((e) => ({ steering: [...e.steering], followUp: [...e.followUp] })),
  };
}

describe("Bridge shadow-queue per-entry drain on user message_start", () => {
  it("removes the matching follow-up entry when pi drains it, leaves the rest", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("a");
    m.recordFollowup("b");
    m.recordFollowup("c");
    expect(m.snapshotQueue().followUp).toEqual(["a", "b", "c"]);

    // Pi drains "a" first.
    m.onUserMessageStart({ role: "user", content: "a" });
    expect(m.snapshotQueue().followUp).toEqual(["b", "c"]);

    // Then "b".
    m.onUserMessageStart({ role: "user", content: "b" });
    expect(m.snapshotQueue().followUp).toEqual(["c"]);

    // Then "c".
    m.onUserMessageStart({ role: "user", content: "c" });
    expect(m.snapshotQueue().followUp).toEqual([]);

    // One emit per drain (plus the three initial record emits).
    expect(m.emits).toHaveLength(6);
  });

  it("removes the matching steering entry when pi drains it", () => {
    const m = makeShadowDrainMatcher();
    m.recordSteer("focus on X");
    m.recordSteer("ignore Y");
    expect(m.snapshotQueue().steering).toEqual(["focus on X", "ignore Y"]);

    m.onUserMessageStart({ role: "user", content: "focus on X" });
    expect(m.snapshotQueue().steering).toEqual(["ignore Y"]);
    expect(m.snapshotQueue().followUp).toEqual([]);
  });

  it("steering queue checked BEFORE follow-up when same text is in both", () => {
    const m = makeShadowDrainMatcher();
    m.recordSteer("hello");
    m.recordFollowup("hello");

    m.onUserMessageStart({ role: "user", content: "hello" });
    // Steering entry consumed, follow-up untouched.
    expect(m.snapshotQueue().steering).toEqual([]);
    expect(m.snapshotQueue().followUp).toEqual(["hello"]);

    // Second drain consumes the follow-up.
    m.onUserMessageStart({ role: "user", content: "hello" });
    expect(m.snapshotQueue().followUp).toEqual([]);
  });

  it("non-matching user message_start is a no-op (no queue mutation, no emit)", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("queued");
    const baselineEmits = m.emits.length;

    // Fresh user send not in any queue (e.g., the user typed something
    // new on an idle session, or a steer was added by a non-dashboard
    // consumer).
    m.onUserMessageStart({ role: "user", content: "fresh send" });
    expect(m.snapshotQueue().followUp).toEqual(["queued"]);
    expect(m.emits.length).toBe(baselineEmits);
  });

  it("user message_start with array content joins text blocks (matches pi's _getUserMessageText)", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("describe this");

    m.onUserMessageStart({
      role: "user",
      content: [
        { type: "text", text: "describe " },
        { type: "image", data: "<base64>", mimeType: "image/png" },
        { type: "text", text: "this" },
      ],
    });
    expect(m.snapshotQueue().followUp).toEqual([]);
  });

  it("ignores non-user message_start (assistant role does not touch the queue)", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("a");
    const baselineEmits = m.emits.length;

    m.onUserMessageStart({ role: "assistant", content: "a" });
    expect(m.snapshotQueue().followUp).toEqual(["a"]);
    expect(m.emits.length).toBe(baselineEmits);
  });

  it("removes only the FIRST occurrence on duplicate text (FIFO)", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("dup");
    m.recordFollowup("other");
    m.recordFollowup("dup");
    expect(m.snapshotQueue().followUp).toEqual(["dup", "other", "dup"]);

    m.onUserMessageStart({ role: "user", content: "dup" });
    // First "dup" removed; second one still queued (FIFO).
    expect(m.snapshotQueue().followUp).toEqual(["other", "dup"]);

    m.onUserMessageStart({ role: "user", content: "dup" });
    expect(m.snapshotQueue().followUp).toEqual(["other"]);
  });

  it("entries added DURING drain are preserved (no bulk wipe)", () => {
    const m = makeShadowDrainMatcher();
    m.recordFollowup("a");
    m.recordFollowup("b");

    // Pi drains "a"
    m.onUserMessageStart({ role: "user", content: "a" });
    expect(m.snapshotQueue().followUp).toEqual(["b"]);

    // User adds a new entry "c" while pi is still draining
    m.recordFollowup("c");
    expect(m.snapshotQueue().followUp).toEqual(["b", "c"]);

    // Pi drains "b"
    m.onUserMessageStart({ role: "user", content: "b" });
    // "c" must still be present
    expect(m.snapshotQueue().followUp).toEqual(["c"]);

    // Eventually pi drains "c"
    m.onUserMessageStart({ role: "user", content: "c" });
    expect(m.snapshotQueue().followUp).toEqual([]);
  });
});
