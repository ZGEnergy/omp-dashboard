import type { FetchToolPayloadMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { describe, expect, it } from "vitest";
import { handleFetchToolPayload, TOOL_PAYLOAD_RESPONSE_CAP } from "../browser-handlers/tool-payload-handler.js";

function storeWith(result: unknown) {
  return {
    findToolEndEvent: (_sessionId: string, toolCallId: string) =>
      toolCallId === "t1"
        ? ({
            eventType: "tool_execution_end",
            timestamp: 1,
            data: { toolCallId: "t1", result },
          } as never)
        : undefined,
  };
}

const req: FetchToolPayloadMessage = {
  type: "fetch_tool_payload",
  sessionId: "s1",
  toolCallId: "t1",
  requestId: "r1",
};

describe("handleFetchToolPayload", () => {
  it("returns the full payload under the cap", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith("hello"));
    expect(out).toEqual({
      type: "tool_payload",
      sessionId: "s1",
      requestId: "r1",
      toolCallId: "t1",
      payload: "hello",
    });
  });

  it("caps an oversized payload and flags truncation", () => {
    const big = "x".repeat(TOOL_PAYLOAD_RESPONSE_CAP + 5000);
    const out = handleFetchToolPayload({ ...req }, storeWith(big));
    expect(out.payload!.length).toBe(TOOL_PAYLOAD_RESPONSE_CAP);
    expect(out.truncated).toBe(true);
  });

  it("returns not_found for an unknown toolCallId", () => {
    const out = handleFetchToolPayload({ ...req, toolCallId: "nope" }, storeWith("hello"));
    expect(out.error).toBe("not_found");
    expect(out.payload).toBeUndefined();
  });

  it("stringifies a structured result", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith({ content: [{ text: "structured" }] }));
    expect(out.payload).toContain("structured");
  });

  it("returns not_found when the end event carries no result", () => {
    const out = handleFetchToolPayload({ ...req }, storeWith(undefined));
    expect(out.error).toBe("not_found");
  });

  it("echoes requestId so concurrent fetches never cross", () => {
    const out = handleFetchToolPayload({ ...req, requestId: "r2" }, storeWith("hello"));
    expect(out.requestId).toBe("r2");
  });

  it("survives a circular structured result instead of throwing", () => {
    const circular: Record<string, unknown> = { self: null };
    circular.self = circular;
    const out = handleFetchToolPayload({ ...req }, storeWith(circular));
    expect(out.error).toBe("not_found");
  });

  it("is side-effect free — repeated calls return identical results", () => {
    const store = storeWith("hello");
    expect(handleFetchToolPayload({ ...req }, store)).toEqual(handleFetchToolPayload({ ...req }, store));
  });
});
