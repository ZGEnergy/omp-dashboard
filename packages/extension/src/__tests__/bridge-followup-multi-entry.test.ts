/**
 * v2 bridge behavior tests for the multi-entry follow-up queue.
 *
 * Encodes the contract of the bridge's `rewriteFollowupQueue` helper and the
 * three new browser-message handlers (promote / remove / edit_entry). Tests
 * use a pure-helper reproduction (same shape as the production code) so the
 * contract is verifiable without instantiating the full bridge.
 *
 * See change: add-followup-edit-and-steer-cancel (tasks 13.6, 13.7, 13.13).
 */
import { describe, it, expect, vi } from "vitest";

const FOLLOWUP_QUEUE_CAP = 20;

/** Pure reproduction of the bridge's follow-up shadow + rewrite logic. */
function makeShadow() {
  const calls: Array<{ kind: "clear" } | { kind: "send"; text: string }> = [];
  let bridgeFollowUp: string[] = [];
  const fakePiClearFollowUpQueue = () => { calls.push({ kind: "clear" }); };
  const fakePiSendUserMessage = (text: string, opts: { deliverAs: string }) => {
    calls.push({ kind: "send", text });
    expect(opts).toEqual({ deliverAs: "followUp" });
  };

  function rewriteFollowupQueue(newEntries: string[]) {
    const capped = newEntries.slice(0, FOLLOWUP_QUEUE_CAP);
    fakePiClearFollowUpQueue();
    for (const t of capped) fakePiSendUserMessage(t, { deliverAs: "followUp" });
    bridgeFollowUp = [...capped];
  }

  function recordFollowupSent(text: string, isStreaming: boolean) {
    if (!isStreaming) return;
    if (bridgeFollowUp.length >= FOLLOWUP_QUEUE_CAP) return;
    bridgeFollowUp.push(text);
  }

  // Browser-message handlers (mirror bridge.ts shape)
  function handlePromoteEntry(index: number) {
    if (index < 0 || index >= bridgeFollowUp.length) return;
    const head = bridgeFollowUp[index];
    const rest = bridgeFollowUp.filter((_, i) => i !== index);
    rewriteFollowupQueue([head, ...rest]);
  }
  function handleRemoveEntry(index: number) {
    if (index < 0 || index >= bridgeFollowUp.length) return;
    const surviving = bridgeFollowUp.filter((_, i) => i !== index);
    rewriteFollowupQueue(surviving);
  }
  function handleEditEntry(index: number, text: string) {
    if (index < 0 || index >= bridgeFollowUp.length) return;
    const next = bridgeFollowUp.map((t, i) => (i === index ? text : t));
    rewriteFollowupQueue(next);
  }
  function handleEditFollowupSlotV1Compat(text: string) {
    rewriteFollowupQueue([text]);
  }

  return {
    snapshot: () => [...bridgeFollowUp],
    calls,
    rewriteFollowupQueue,
    recordFollowupSent,
    handlePromoteEntry,
    handleRemoveEntry,
    handleEditEntry,
    handleEditFollowupSlotV1Compat,
  };
}

describe("bridge follow-up multi-entry queue: rewrite helper", () => {
  it("clears pi + sends each entry in new order", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    expect(s.calls).toEqual([
      { kind: "clear" },
      { kind: "send", text: "a" },
      { kind: "send", text: "b" },
      { kind: "send", text: "c" },
    ]);
    expect(s.snapshot()).toEqual(["a", "b", "c"]);
  });

  it("clears + sends nothing for empty rewrite (queue drained)", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue([]);
    expect(s.calls).toEqual([{ kind: "clear" }]);
    expect(s.snapshot()).toEqual([]);
  });

  it("caps at FOLLOWUP_QUEUE_CAP (20)", () => {
    const s = makeShadow();
    const big = Array.from({ length: 25 }, (_, i) => `entry-${i}`);
    s.rewriteFollowupQueue(big);
    const sends = s.calls.filter((c) => c.kind === "send");
    expect(sends).toHaveLength(20);
    expect(s.snapshot()).toHaveLength(20);
    expect(s.snapshot()[0]).toBe("entry-0");
    expect(s.snapshot()[19]).toBe("entry-19");
  });
});

describe("bridge follow-up multi-entry queue: recordFollowupSent (append)", () => {
  it("appends when streaming", () => {
    const s = makeShadow();
    s.recordFollowupSent("a", true);
    s.recordFollowupSent("b", true);
    expect(s.snapshot()).toEqual(["a", "b"]);
  });

  it("does NOT append when idle (race fix)", () => {
    const s = makeShadow();
    s.recordFollowupSent("a", false);
    expect(s.snapshot()).toEqual([]);
  });

  it("drops silently at soft cap", () => {
    const s = makeShadow();
    for (let i = 0; i < FOLLOWUP_QUEUE_CAP; i++) {
      s.recordFollowupSent(`e${i}`, true);
    }
    expect(s.snapshot()).toHaveLength(FOLLOWUP_QUEUE_CAP);
    s.recordFollowupSent("over-cap", true);
    expect(s.snapshot()).toHaveLength(FOLLOWUP_QUEUE_CAP);
    expect(s.snapshot()).not.toContain("over-cap");
  });
});

describe("bridge follow-up multi-entry queue: promote handler", () => {
  it("moves entry at index N to position 0", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    s.handlePromoteEntry(2); // promote "c" to head
    expect(s.snapshot()).toEqual(["c", "a", "b"]);
  });

  it("promoting index 0 is a no-op (already at head)", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    s.handlePromoteEntry(0);
    expect(s.snapshot()).toEqual(["a", "b", "c"]);
  });

  it("out-of-bounds index is ignored", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a"]);
    const before = s.snapshot();
    s.handlePromoteEntry(5);
    s.handlePromoteEntry(-1);
    expect(s.snapshot()).toEqual(before);
  });
});

describe("bridge follow-up multi-entry queue: remove handler", () => {
  it("removes entry at index N", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    s.handleRemoveEntry(1);
    expect(s.snapshot()).toEqual(["a", "c"]);
  });

  it("removes last entry to leave empty queue", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["only"]);
    s.handleRemoveEntry(0);
    expect(s.snapshot()).toEqual([]);
  });

  it("out-of-bounds index is ignored", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b"]);
    const before = s.snapshot();
    s.handleRemoveEntry(99);
    expect(s.snapshot()).toEqual(before);
  });
});

describe("bridge follow-up multi-entry queue: edit handler", () => {
  it("replaces entry at index N with new text", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    s.handleEditEntry(1, "b-revised");
    expect(s.snapshot()).toEqual(["a", "b-revised", "c"]);
  });

  it("out-of-bounds index is ignored", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["only"]);
    const before = s.snapshot();
    s.handleEditEntry(99, "nope");
    expect(s.snapshot()).toEqual(before);
  });
});

describe("bridge follow-up multi-entry queue: v1 edit_followup_slot back-compat", () => {
  it("replaces the ENTIRE queue with a single entry (v1 semantic)", () => {
    const s = makeShadow();
    s.rewriteFollowupQueue(["a", "b", "c"]);
    s.handleEditFollowupSlotV1Compat("replacement");
    expect(s.snapshot()).toEqual(["replacement"]);
  });
});
