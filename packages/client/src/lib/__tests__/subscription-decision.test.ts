import { describe, expect, it } from "vitest";
import { computeSubscribeAction, type SubscribeDecisionInput } from "../subscription-decision.js";

const base: SubscribeDecisionInput = {
  selectedId: "A",
  connected: true,
  alreadySubscribed: false,
  continuation: false,
  ledgerHasBaseline: false,
};

describe("computeSubscribeAction", () => {
  it("does not subscribe when no session is selected", () => {
    expect(computeSubscribeAction({ ...base, selectedId: undefined }).subscribe).toBe(false);
  });

  it("does not subscribe while disconnected", () => {
    expect(computeSubscribeAction({ ...base, connected: false }).subscribe).toBe(false);
  });

  it("issues no replay when returning to an already-subscribed session (A→B→A)", () => {
    // #59 AC: switching A → B → A never re-subscribes A.
    expect(computeSubscribeAction({ ...base, alreadySubscribed: true })).toEqual({
      subscribe: false,
      kind: "cold",
      reason: "initial_navigation",
    });
  });

  it("cold-opens a first navigation", () => {
    expect(computeSubscribeAction(base)).toEqual({
      subscribe: true,
      kind: "cold",
      reason: "initial_navigation",
    });
  });

  it("resumes via delta on a reconnect continuation over a retained baseline", () => {
    // #59 AC: reconnect with a compatible retained tail merges off-screen (delta).
    expect(computeSubscribeAction({ ...base, continuation: true, ledgerHasBaseline: true })).toEqual({
      subscribe: true,
      kind: "delta",
      reason: "transport_reconnect",
    });
  });

  it("falls back to cold on reconnect when no retained baseline exists", () => {
    expect(computeSubscribeAction({ ...base, continuation: true, ledgerHasBaseline: false })).toEqual({
      subscribe: true,
      kind: "cold",
      reason: "transport_reconnect",
    });
  });

  it("is device-independent: identical inputs yield identical actions", () => {
    // Desktop and mobile share this decision; #59 AC covers both surfaces.
    const inputs: SubscribeDecisionInput = { ...base, continuation: true, ledgerHasBaseline: true };
    expect(computeSubscribeAction(inputs)).toEqual(computeSubscribeAction({ ...inputs }));
  });
});
