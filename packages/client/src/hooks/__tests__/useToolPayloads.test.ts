import type {
  BrowserToServerMessage,
  ServerToBrowserMessage,
} from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TOOL_PAYLOAD_TIMEOUT_MS, useToolPayloads } from "../useToolPayloads.js";

function harness(sessionId: string | null = "s1") {
  const sent: BrowserToServerMessage[] = [];
  let handler: ((msg: ServerToBrowserMessage) => void) | null = null;
  const send = (msg: BrowserToServerMessage) => {
    sent.push(msg);
  };
  const onMessage = (h: (msg: ServerToBrowserMessage) => void) => {
    handler = h;
    return () => {
      handler = null;
    };
  };
  const rendered = renderHook(
    ({ sid }: { sid: string | null }) => useToolPayloads(sid, send, onMessage),
    { initialProps: { sid: sessionId } },
  );
  return {
    ...rendered,
    sent,
    deliver: (msg: ServerToBrowserMessage) => act(() => handler?.(msg)),
    lastRequestId: () => (sent.at(-1) as { requestId: string } | undefined)?.requestId,
  };
}

beforeEach(() => {
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", { randomUUID: () => `uuid-${Math.random()}` });
  }
});

describe("useToolPayloads", () => {
  it("sends fetch_tool_payload and marks the row loading", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ type: "fetch_tool_payload", sessionId: "s1", toolCallId: "t1" });
    expect(h.result.current.isLoading("t1")).toBe(true);
  });

  it("caches the payload and clears loading when the response lands", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      payload: "the whole thing",
    });
    expect(h.result.current.get("t1")).toEqual({ payload: "the whole thing", truncated: false });
    expect(h.result.current.isLoading("t1")).toBe(false);
  });

  it("propagates the truncated flag", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      payload: "partial",
      truncated: true,
    });
    expect(h.result.current.get("t1")!.truncated).toBe(true);
  });

  it("marks an error response without caching anything", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      error: "not_found",
    });
    expect(h.result.current.isError("t1")).toBe(true);
    expect(h.result.current.isLoading("t1")).toBe(false);
    expect(h.result.current.get("t1")).toBeUndefined();
  });

  it("does not re-request a payload already in flight", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    act(() => h.result.current.fetch("t1"));
    expect(h.sent).toHaveLength(1);
  });

  it("does not re-request a payload already cached", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      payload: "done",
    });
    act(() => h.result.current.fetch("t1"));
    expect(h.sent).toHaveLength(1);
  });

  it("clears a previous error when the row is retried", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      error: "unavailable",
    });
    expect(h.result.current.isError("t1")).toBe(true);
    act(() => h.result.current.fetch("t1"));
    expect(h.result.current.isError("t1")).toBe(false);
    expect(h.result.current.isLoading("t1")).toBe(true);
  });

  it("ignores a response whose requestId it never issued", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: "not-ours",
      toolCallId: "t1",
      payload: "spoofed",
    });
    expect(h.result.current.get("t1")).toBeUndefined();
    expect(h.result.current.isLoading("t1")).toBe(true);
  });

  it("drops cached payloads when the selected session changes", () => {
    const h = harness();
    act(() => h.result.current.fetch("t1"));
    h.deliver({
      type: "tool_payload",
      sessionId: "s1",
      requestId: h.lastRequestId()!,
      toolCallId: "t1",
      payload: "session one",
    });
    expect(h.result.current.get("t1")).toBeDefined();
    h.rerender({ sid: "s2" });
    expect(h.result.current.get("t1")).toBeUndefined();
  });

  it("does not send when no session is selected", () => {
    const h = harness(null);
    act(() => h.result.current.fetch("t1"));
    expect(h.sent).toHaveLength(0);
  });

  it("REGRESSION: a response that never arrives releases the row instead of stranding it", () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      act(() => h.result.current.fetch("t1"));
      expect(h.result.current.isLoading("t1")).toBe(true);
      act(() => {
        vi.advanceTimersByTime(TOOL_PAYLOAD_TIMEOUT_MS + 1);
      });
      expect(h.result.current.isLoading("t1")).toBe(false);
      expect(h.result.current.isError("t1")).toBe(true);
      // And the in-flight guard must not block the retry.
      act(() => h.result.current.fetch("t1"));
      expect(h.sent).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a timed-out request cannot land later and clobber the row", () => {
    vi.useFakeTimers();
    try {
      const h = harness();
      act(() => h.result.current.fetch("t1"));
      const stale = h.lastRequestId()!;
      act(() => {
        vi.advanceTimersByTime(TOOL_PAYLOAD_TIMEOUT_MS + 1);
      });
      h.deliver({ type: "tool_payload", sessionId: "s1", requestId: stale, toolCallId: "t1", payload: "late" });
      expect(h.result.current.get("t1")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
