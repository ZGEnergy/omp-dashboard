/**
 * Bridge thinking_level_select wiring (shape contract).
 *
 * Pi 0.71+ fires a dedicated `thinking_level_select` event when the thinking
 * level changes alone. The bridge handler calls `sendModelUpdateIfChanged`,
 * which pushes ONE `model_update` per distinct (model, thinkingLevel) pair.
 * A repeat event with the same level is a no-op via the dedup gate.
 *
 * See change: adopt-pi-071-072-073-features (A.3).
 */
import { describe, it, expect } from "vitest";
import { sendModelUpdateIfChanged } from "../model-tracker.js";
import type { BridgeContext } from "../bridge-context.js";
import bridge from "../bridge.js";

function makeBc(thinkingLevel: string | null | undefined): { bc: BridgeContext; sent: any[] } {
  const sent: any[] = [];
  const bc = {
    sessionId: "S1",
    cachedCtx: { model: { provider: "anthropic", id: "claude" } },
    pi: { getThinkingLevel: () => thinkingLevel },
    connection: { send: (m: any) => sent.push(m) },
    lastModel: undefined,
    lastThinkingLevel: undefined,
  } as unknown as BridgeContext;
  return { bc, sent };
}

function privateBridgeHelpers(): any {
  let helpers: any;
  bridge({
    __piDashboardModelPreferenceTestSeam: (value: any) => { helpers = value; },
  } as any);
  expect(helpers).toBeDefined();
  return helpers;
}

describe("bridge thinking_level_select → model_update", () => {
  it("fires one model_update on a new thinking level", () => {
    const { bc, sent } = makeBc("high");
    // Simulate the bridge's thinking_level_select handler.
    sendModelUpdateIfChanged(bc);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "model_update",
      sessionId: "S1",
      model: "anthropic/claude",
      thinkingLevel: "high",
    });
  });

  it("publishes an explicit null when Pi clears the thinking level", () => {
    const { bc, sent } = makeBc(null);
    sendModelUpdateIfChanged(bc);
    expect(sent).toEqual([{
      type: "model_update",
      sessionId: "S1",
      model: "anthropic/claude",
      thinkingLevel: null,
    }]);
  });

  it("normalizes an undefined Pi clear to an explicit null", () => {
    let level: string | undefined = "high";
    const sent: any[] = [];
    const bc = {
      sessionId: "S-clear",
      cachedCtx: { model: { provider: "anthropic", id: "claude" } },
      pi: { getThinkingLevel: () => level },
      connection: { send: (m: any) => sent.push(m) },
      lastModel: undefined,
      lastThinkingLevel: undefined,
    } as unknown as BridgeContext;

    sendModelUpdateIfChanged(bc);
    level = undefined;
    sendModelUpdateIfChanged(bc);

    expect(sent[1]).toMatchObject({ model: "anthropic/claude", thinkingLevel: null });
  });

  it("publishes rapid Pi snapshots in application order", () => {
    const { bc, sent } = makeBc("ignored");
    const publish = sendModelUpdateIfChanged as any;

    // The bridge captures these immutable post-Pi snapshots before placing
    // each publication behind its private promise tail.
    publish(bc, { model: "provider/model-a", thinkingLevel: "low" });
    publish(bc, { model: "provider/model-b", thinkingLevel: null });

    expect(sent.map((m) => [m.model, m.thinkingLevel])).toEqual([
      ["provider/model-a", "low"],
      ["provider/model-b", null],
    ]);
  });

  it("publishes dashboard setter state only after successful Pi application", () => {
    const { bc, sent } = makeBc("before");
    const publishAfterApply = (apply: () => void, snapshot: any) => {
      try {
        apply();
      } catch {
        return;
      }
      (sendModelUpdateIfChanged as any)(bc, snapshot);
    };

    publishAfterApply(
      () => undefined,
      { model: "anthropic/claude", thinkingLevel: "after" },
    );
    publishAfterApply(
      () => { throw new Error("Pi rejected setter"); },
      { model: "anthropic/claude", thinkingLevel: "rejected" },
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ model: "anthropic/claude", thinkingLevel: "after" });
  });

  it("private bridge tail emits rapid A→B and A→A snapshots correctly", async () => {
    const helpers = privateBridgeHelpers();
    const sent: any[] = [];
    const bc = {
      sessionId: "S-tail",
      cachedCtx: { model: { provider: "provider", id: "a" } },
      pi: { getThinkingLevel: () => "low" },
      connection: { send: (m: any) => sent.push(m) },
      lastModel: undefined,
      lastThinkingLevel: undefined,
    } as unknown as BridgeContext;
    const queue = helpers.createPublisher({
      readState: () => bc,
      captureSnapshot: (state: BridgeContext) => ({
        model: `${state.cachedCtx.model.provider}/${state.cachedCtx.model.id}`,
        thinkingLevel: (state.pi as any).getThinkingLevel?.() ?? null,
      }),
      publish: (state: BridgeContext, snapshot: any) => sendModelUpdateIfChanged(state, snapshot),
      applyState: () => undefined,
    });

    queue();
    bc.cachedCtx.model = { provider: "provider", id: "b" };
    queue();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((m) => m.model)).toEqual(["provider/a", "provider/b"]);

    sent.length = 0;
    bc.cachedCtx.model = { provider: "provider", id: "a" };
    bc.lastModel = undefined;
    bc.lastThinkingLevel = undefined;
    queue();
    queue();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent.map((m) => m.model)).toEqual(["provider/a"]);
  });

  it("private dashboard setters publish only after successful Pi application", async () => {
    const helpers = privateBridgeHelpers();
    const sent: any[] = [];
    let model = { provider: "provider", id: "before" };
    let level: string | undefined = "before";
    const bc = {
      sessionId: "S-setter",
      cachedCtx: { get model() { return model; } },
      pi: { getThinkingLevel: () => level },
      connection: { send: (m: any) => sent.push(m) },
      lastModel: undefined,
      lastThinkingLevel: undefined,
    } as unknown as BridgeContext;
    const queue = helpers.createPublisher({
      readState: () => bc,
      captureSnapshot: (state: BridgeContext) => ({
        model: `${state.cachedCtx.model.provider}/${state.cachedCtx.model.id}`,
        thinkingLevel: (state.pi as any).getThinkingLevel?.() ?? null,
      }),
      publish: (state: BridgeContext, snapshot: any) => sendModelUpdateIfChanged(state, snapshot),
      applyState: () => undefined,
    });
    const setters = helpers.createSetters({
      pi: {
        setThinkingLevel(next: string) { level = next; },
        async setModel(next: any) { model = next; },
      },
      getModelRegistry: () => ({ find: () => ({ provider: "provider", id: "after" }) }),
      publish: queue,
    });

    await setters.setModel("provider", "after");
    setters.setThinkingLevel("after-thinking");
    const beforeFailure = sent.length;
    const failing = helpers.createSetters({
      pi: {
        setThinkingLevel() { throw new Error("Pi rejected thinking level"); },
        async setModel() { throw new Error("Pi rejected model"); },
      },
      getModelRegistry: () => ({ find: () => ({ provider: "provider", id: "rejected" }) }),
      publish: queue,
    });
    await failing.setModel("provider", "rejected");
    try { failing.setThinkingLevel("rejected"); } catch { /* expected */ }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(beforeFailure).toBe(1);
    expect(sent.map((m) => m.thinkingLevel)).toEqual(["before", "after-thinking"]);
  });

  it("private reconnect sequence resets, registers, then queues a fresh snapshot", () => {
    const helpers = privateBridgeHelpers();
    const order: string[] = [];
    helpers.runReconnect({
      reset: () => order.push("reset"),
      stateSync: () => order.push("register"),
      publish: () => order.push("snapshot"),
    });
    expect(order).toEqual(["reset", "register", "snapshot"]);
  });

  it("does not re-emit when the thinking level is unchanged", () => {
    const { bc, sent } = makeBc("high");
    sendModelUpdateIfChanged(bc); // first push
    sendModelUpdateIfChanged(bc); // same value → dedup no-op
    expect(sent).toHaveLength(1);
  });

  it("re-emits when only the thinking level changes (model unchanged)", () => {
    const sent: any[] = [];
    let level = "medium";
    const bc = {
      sessionId: "S2",
      cachedCtx: { model: { provider: "anthropic", id: "claude" } },
      pi: { getThinkingLevel: () => level },
      connection: { send: (m: any) => sent.push(m) },
      lastModel: undefined,
      lastThinkingLevel: undefined,
    } as unknown as BridgeContext;

    sendModelUpdateIfChanged(bc);
    level = "high";
    sendModelUpdateIfChanged(bc);

    expect(sent).toHaveLength(2);
    expect(sent[1].thinkingLevel).toBe("high");
  });
});
