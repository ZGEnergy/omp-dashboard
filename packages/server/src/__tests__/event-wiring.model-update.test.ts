import { describe, expect, it, vi } from "vitest";
import type { ModelUpdateMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";
import { type EventWiringDeps, wireEvents } from "../event-wiring.js";

const SESSION_ID = "model-update-session";

function makeWiring() {
  const update = vi.fn();
  const broadcastSessionUpdated = vi.fn();
  const piGateway: any = {};
  const deps = {
    sessionManager: {
      get: vi.fn(),
      update,
    },
    eventStore: {},
    piGateway,
    browserGateway: {
      broadcastSessionUpdated,
    },
    sessionOrderManager: {},
    preferencesStore: {},
    pendingForkRegistry: {},
    directoryService: {},
    knownSessionIds: new Set<string>(),
    pendingDashboardSpawns: new Map<string, number>(),
  } as unknown as EventWiringDeps;

  wireEvents(deps);
  return { piGateway, update, broadcastSessionUpdated };
}

describe("event-wiring model_update", () => {
  it("applies and broadcasts one complete model snapshot, including null thinking level", () => {
    const { piGateway, update, broadcastSessionUpdated } = makeWiring();
    const message: ModelUpdateMessage = {
      type: "model_update",
      sessionId: SESSION_ID,
      model: "anthropic/claude-opus-4-6",
      thinkingLevel: null,
    };

    piGateway.onEvent(SESSION_ID, message);

    const expected = { model: message.model, thinkingLevel: message.thinkingLevel };
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(SESSION_ID, expected);
    expect(broadcastSessionUpdated).toHaveBeenCalledTimes(1);
    expect(broadcastSessionUpdated).toHaveBeenCalledWith(SESSION_ID, expected);
  });
});
