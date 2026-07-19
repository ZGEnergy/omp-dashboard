import { describe, expect, it, vi } from "vitest";
import type { ModelUpdateMessage } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";
import { type EventWiringDeps, wireEvents } from "../event-wiring.js";

const SESSION_ID = "model-update-session";

function makeWiring() {
  const callOrder: string[] = [];
  const update = vi.fn(() => callOrder.push("update"));
  const broadcastSessionUpdated = vi.fn(() => callOrder.push("broadcast"));
  const broadcastEvent = vi.fn();
  const eventStore = {
    insertEvent: vi.fn(() => 1),
    getEvent: vi.fn(() => undefined),
  };
  const piGateway: any = {};
  const deps = {
    sessionManager: {
      get: vi.fn(),
      update,
    },
    eventStore,
    piGateway,
    browserGateway: {
      broadcastEvent,
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
  return { piGateway, eventStore, update, broadcastEvent, broadcastSessionUpdated, callOrder };
}

describe("event-wiring model_update", () => {
  it("forwards model_select into event history without deriving live model state", () => {
    const { piGateway, eventStore, update, broadcastEvent, broadcastSessionUpdated } = makeWiring();
    const event = {
      eventType: "model_select",
      timestamp: Date.now(),
      data: {
        type: "model_select",
        model: { provider: "anthropic", id: "claude-opus-4-6" },
        thinkingLevel: "high",
      },
    };

    piGateway.onEvent(SESSION_ID, {
      type: "event_forward",
      sessionId: SESSION_ID,
      event,
    });

    expect(eventStore.insertEvent).toHaveBeenCalledWith(SESSION_ID, event);
    expect(broadcastEvent).toHaveBeenCalledWith(SESSION_ID, 1, event);
    expect(update).not.toHaveBeenCalled();
    expect(broadcastSessionUpdated).not.toHaveBeenCalled();
  });

  it("applies and broadcasts one complete model snapshot, including null thinking level", () => {
    const { piGateway, update, broadcastSessionUpdated, callOrder } = makeWiring();
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
    expect(callOrder).toEqual(["update", "broadcast"]);
  });

  it("does not send explicit undefined for a model_update from an older bridge", () => {
    const { piGateway, update, broadcastSessionUpdated } = makeWiring();
    const message = {
      type: "model_update",
      sessionId: SESSION_ID,
      model: "anthropic/claude-opus-4-6",
    } as ModelUpdateMessage;

    piGateway.onEvent(SESSION_ID, message);

    const expected = { model: message.model };
    expect(update).toHaveBeenCalledWith(SESSION_ID, expected);
    expect(broadcastSessionUpdated).toHaveBeenCalledWith(SESSION_ID, expected);
    expect(Object.hasOwn(update.mock.calls[0][1], "thinkingLevel")).toBe(false);
    expect(Object.hasOwn(broadcastSessionUpdated.mock.calls[0][1], "thinkingLevel")).toBe(false);
  });
});
