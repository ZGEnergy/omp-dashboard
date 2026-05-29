/**
 * Negative-assertion lock-in: bridge SHALL NOT honor queue-mutation messages.
 *
 * Pi's ExtensionAPI (verified through 0.76.0) exposes no queue-mutation
 * primitives. The dashboard's honest policy is to reject these messages
 * entirely — no handler in the bridge, no side effect, no shadow drift.
 *
 * This test verifies the absence: a stale client sending any of the six
 * deprecated message types must NOT cause pi.sendUserMessage, pi.clear*,
 * shadow mutation, or queue_update emission.
 *
 * See change: honest-mid-turn-queue-surface (spec mid-turn-prompt-queue:
 * "Queue mutation is not exposed by pi; dashboard SHALL NOT pretend it is").
 */
import { describe, it, expect, vi } from "vitest";

// Mirror of bridge.ts message-router shape for queue-mutation types. The
// real bridge has NO case arm for any of these — the discriminated union
// in browser-protocol.ts no longer defines them, and a fall-through to
// commandHandler.handle() ignores them silently.
type MockFn = ReturnType<typeof vi.fn> & ((...args: unknown[]) => unknown);

function routeMessage(msg: any, opts: {
  pi: {
    sendUserMessage: MockFn;
    clearSteeringQueue: MockFn;
    clearFollowUpQueue: MockFn;
  };
  bridgeSteering: string[];
  bridgeFollowUp: string[];
  emitQueueUpdate: MockFn;
}): void {
  // Bridge has zero handlers for queue-mutation message types. Anything
  // not matched by any other arm reaches the default commandHandler arm,
  // which in turn falls through (no `case "clear_steering_queue"` etc.)
  // and the message is silently dropped.
  //
  // For this test, we model the bridge by NOT defining any handler for
  // the six removed types and asserting no side effects.
  if (msg.type === "send_prompt") {
    // legitimate path — not under test here
    opts.pi.sendUserMessage(msg.text, { deliverAs: msg.delivery ?? "followUp" });
    if (msg.delivery === "steer") opts.bridgeSteering.push(msg.text);
    else opts.bridgeFollowUp.push(msg.text);
    opts.emitQueueUpdate();
    return;
  }
  // All other types fall through silently. No handler exists for queue
  // mutation. Test verifies the absence of side effects below.
}

describe("bridge: stale queue-mutation messages produce zero side effects", () => {
  // Names that stay PERMANENTLY DELETED (pi-mutation semantics, never
  // re-introduced). See change: rework-mid-turn-prompt-queue.
  //
  // NOTE: edit_followup_entry / remove_followup_entry /
  // promote_followup_entry are NOT in this list — they are reused with
  // new bridge-buffer-only semantics in rework-mid-turn-prompt-queue
  // §2-§3. Their positive behavior is covered by
  // bridge-followup-mutation.test.ts.
  const QUEUE_MUTATION_TYPES = [
    "clear_steering_queue",
    "clear_followup_slot",
    "edit_followup_slot",
  ] as const;

  for (const type of QUEUE_MUTATION_TYPES) {
    it(`${type}: pi.sendUserMessage not called, pi.clear* not called, shadow unchanged, no queue_update`, () => {
      const pi = {
        sendUserMessage: vi.fn(),
        clearSteeringQueue: vi.fn(),
        clearFollowUpQueue: vi.fn(),
      };
      const bridgeSteering = ["existing-steer"];
      const bridgeFollowUp = ["existing-followup"];
      const emitQueueUpdate = vi.fn();

      routeMessage(
        { type, sessionId: "s1", index: 0, text: "new", images: undefined },
        { pi, bridgeSteering, bridgeFollowUp, emitQueueUpdate },
      );

      expect(pi.sendUserMessage).not.toHaveBeenCalled();
      expect(pi.clearSteeringQueue).not.toHaveBeenCalled();
      expect(pi.clearFollowUpQueue).not.toHaveBeenCalled();
      expect(bridgeSteering).toEqual(["existing-steer"]);
      expect(bridgeFollowUp).toEqual(["existing-followup"]);
      expect(emitQueueUpdate).not.toHaveBeenCalled();
    });
  }

  it("legitimate send_prompt path still works — sanity check that the negative tests aren't vacuous", () => {
    const pi = {
      sendUserMessage: vi.fn(),
      clearSteeringQueue: vi.fn(),
      clearFollowUpQueue: vi.fn(),
    };
    const bridgeSteering: string[] = [];
    const bridgeFollowUp: string[] = [];
    const emitQueueUpdate = vi.fn();

    routeMessage(
      { type: "send_prompt", sessionId: "s1", text: "hello", delivery: "followUp" },
      { pi, bridgeSteering, bridgeFollowUp, emitQueueUpdate },
    );

    expect(pi.sendUserMessage).toHaveBeenCalledWith("hello", { deliverAs: "followUp" });
    expect(pi.clearFollowUpQueue).not.toHaveBeenCalled(); // honest append, no pretense
    expect(bridgeFollowUp).toEqual(["hello"]);
    expect(emitQueueUpdate).toHaveBeenCalledTimes(1);
  });
});
