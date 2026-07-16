/**
 * model_change replay → model_select event. pi records provider + modelId as
 * separate fields; omp records a single "provider/id" string under `model`.
 * Both must yield model_select.data.model = { provider, id } so the client
 * reducer's `${provider}/${id}` round-trips (regression: omp showed
 * "undefined/undefined").
 */
import { describe, it, expect } from "vitest";
import { replayEntriesAsEvents } from "../state-replay.js";

function modelOf(entries: any[]) {
  const ev = replayEntriesAsEvents("s1", entries as any).find(
    (e) => e.event.eventType === "model_select",
  );
  return (ev?.event.data as any)?.model;
}

describe("replayEntriesAsEvents — model_change", () => {
  it("pi shape (provider + modelId) → {provider, id}", () => {
    const m = modelOf([
      { type: "model_change", id: "m1", timestamp: "2026-04-27T07:26:26.000Z", provider: "anthropic", modelId: "claude-sonnet-5" },
    ]);
    expect(m).toEqual({ provider: "anthropic", id: "claude-sonnet-5" });
    expect(`${m.provider}/${m.id}`).toBe("anthropic/claude-sonnet-5");
  });

  it("omp shape (single model string) → split on first slash", () => {
    const m = modelOf([
      { type: "model_change", id: "m1", timestamp: "2026-04-27T07:26:26.000Z", model: "openrouter/z-ai/glm-5.2" },
    ]);
    expect(m).toEqual({ provider: "openrouter", id: "z-ai/glm-5.2" });
    // Round-trips to the exact label the model list uses (no undefined/undefined).
    expect(`${m.provider}/${m.id}`).toBe("openrouter/z-ai/glm-5.2");
  });
});
