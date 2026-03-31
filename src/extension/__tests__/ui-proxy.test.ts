import { describe, it, expect, vi, beforeEach } from "vitest";
import { createUiProxy, type UiProxyOptions } from "../ui-proxy.js";

function createMockUi() {
  return {
    confirm: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves by default
    select: vi.fn().mockImplementation(() => new Promise(() => {})),
    input: vi.fn().mockImplementation(() => new Promise(() => {})),
    editor: vi.fn().mockImplementation(() => new Promise(() => {})),
    notify: vi.fn(),
  };
}

function createMockConnection() {
  return {
    send: vi.fn(),
  };
}

describe("createUiProxy", () => {
  let mockUi: ReturnType<typeof createMockUi>;
  let mockConnection: ReturnType<typeof createMockConnection>;
  let proxy: ReturnType<typeof createUiProxy>;
  let sessionId: string;

  beforeEach(() => {
    mockUi = createMockUi();
    mockConnection = createMockConnection();
    sessionId = "test-session";
  });

  function setup(hasUI: boolean) {
    proxy = createUiProxy({
      ui: mockUi as any,
      hasUI,
      getSessionId: () => sessionId,
      send: mockConnection.send,
    });
  }

  describe("confirm forwarding", () => {
    it("should send extension_ui_request for confirm", () => {
      setup(false);
      proxy.wrappedUi.confirm("Delete?", "This is permanent");

      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          sessionId: "test-session",
          method: "confirm",
          params: { title: "Delete?", message: "This is permanent" },
        }),
      );
    });

    it("should resolve when dashboard responds with confirmed", async () => {
      setup(false);
      const promise = proxy.wrappedUi.confirm("Delete?", "Sure?");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: true } });

      expect(await promise).toBe(true);
    });

    it("should resolve false when cancelled", async () => {
      setup(false);
      const promise = proxy.wrappedUi.confirm("Delete?", "Sure?");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, cancelled: true });

      expect(await promise).toBe(false);
    });
  });

  describe("select forwarding", () => {
    it("should send extension_ui_request for select", () => {
      setup(false);
      proxy.wrappedUi.select("Pick:", ["A", "B", "C"]);

      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          method: "select",
          params: { title: "Pick:", options: ["A", "B", "C"] },
        }),
      );
    });

    it("should resolve with selected value", async () => {
      setup(false);
      const promise = proxy.wrappedUi.select("Pick:", ["A", "B"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { value: "B" } });

      expect(await promise).toBe("B");
    });

    it("should resolve undefined when cancelled", async () => {
      setup(false);
      const promise = proxy.wrappedUi.select("Pick:", ["A"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, cancelled: true });

      expect(await promise).toBeUndefined();
    });
  });

  describe("input forwarding", () => {
    it("should send extension_ui_request for input", () => {
      setup(false);
      proxy.wrappedUi.input("Name:", "placeholder");

      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          method: "input",
          params: { title: "Name:", placeholder: "placeholder" },
        }),
      );
    });

    it("should resolve with entered value", async () => {
      setup(false);
      const promise = proxy.wrappedUi.input("Name:");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { value: "hello" } });

      expect(await promise).toBe("hello");
    });
  });

  describe("editor forwarding", () => {
    it("should send extension_ui_request for editor", () => {
      setup(false);
      proxy.wrappedUi.editor("Edit:", "prefill text");

      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          method: "editor",
          params: { title: "Edit:", prefill: "prefill text" },
        }),
      );
    });
  });

  describe("notify forwarding", () => {
    it("should call original notify AND send to dashboard", () => {
      setup(true);
      proxy.wrappedUi.notify("Done!", "success");

      expect(mockUi.notify).toHaveBeenCalledWith("Done!", "success");
      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          method: "notify",
          params: { message: "Done!", level: "success" },
        }),
      );
    });

    it("should call original notify in headless mode too", () => {
      setup(false);
      proxy.wrappedUi.notify("Info", "info");

      expect(mockUi.notify).toHaveBeenCalledWith("Info", "info");
      expect(mockConnection.send).toHaveBeenCalled();
    });
  });

  describe("race pattern (hasUI=true)", () => {
    it("should race TUI and dashboard for confirm", async () => {
      // Make original resolve after a tick
      mockUi.confirm.mockResolvedValue(true);
      setup(true);
      const result = await proxy.wrappedUi.confirm("Title", "Msg");
      // Original wins (resolves immediately)
      expect(result).toBe(true);
    });

    it("should let dashboard win the race if faster", async () => {
      // Original never resolves
      setup(true);
      const promise = proxy.wrappedUi.confirm("Title", "Msg");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: false } });

      expect(await promise).toBe(false);
    });
  });

  describe("race cancellation", () => {
    it("should pass AbortSignal to TUI dialog calls", () => {
      setup(true);
      // Make TUI never resolve so we can inspect the call
      proxy.wrappedUi.confirm("Title", "Msg");

      expect(mockUi.confirm).toHaveBeenCalledWith(
        "Title",
        "Msg",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("should abort TUI dialog when dashboard wins confirm", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockUi.confirm.mockImplementation((_t: string, _m: string, opts?: any) => {
        capturedSignal = opts?.signal;
        return new Promise(() => {}); // never resolves
      });
      setup(true);
      const promise = proxy.wrappedUi.confirm("Title", "Msg");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: true } });
      await promise;

      // Wait a tick for the .then() cleanup to run
      await new Promise((r) => setTimeout(r, 0));
      expect(capturedSignal?.aborted).toBe(true);
    });

    it("should send extension_ui_dismiss when TUI wins confirm", async () => {
      mockUi.confirm.mockResolvedValue(true);
      setup(true);
      await proxy.wrappedUi.confirm("Title", "Msg");

      // Wait a tick for the .then() cleanup to run
      await new Promise((r) => setTimeout(r, 0));

      const dismissMsg = mockConnection.send.mock.calls.find(
        (c: any) => c[0].type === "extension_ui_dismiss",
      );
      expect(dismissMsg).toBeDefined();
      expect(dismissMsg![0]).toMatchObject({
        type: "extension_ui_dismiss",
        sessionId: "test-session",
      });
    });

    it("should clean up pending Map when TUI wins", async () => {
      mockUi.confirm.mockResolvedValue(false);
      setup(true);
      await proxy.wrappedUi.confirm("Title", "Msg");

      // Wait for cleanup
      await new Promise((r) => setTimeout(r, 0));

      // Dashboard response after TUI won should be silently ignored
      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: true } });
      // No error — entry already cleaned up
    });

    it("should abort TUI dialog when dashboard wins select", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockUi.select.mockImplementation((_t: string, _opts: string[], opts?: any) => {
        capturedSignal = opts?.signal;
        return new Promise(() => {});
      });
      setup(true);
      const promise = proxy.wrappedUi.select("Pick:", ["A", "B"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { value: "A" } });
      await promise;
      await new Promise((r) => setTimeout(r, 0));

      expect(capturedSignal?.aborted).toBe(true);
    });

    it("should abort TUI dialog when dashboard wins input", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockUi.input.mockImplementation((_t: string, _p?: string, opts?: any) => {
        capturedSignal = opts?.signal;
        return new Promise(() => {});
      });
      setup(true);
      const promise = proxy.wrappedUi.input("Name:");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { value: "hello" } });
      await promise;
      await new Promise((r) => setTimeout(r, 0));

      expect(capturedSignal?.aborted).toBe(true);
    });

    it("should send dismiss when TUI wins select", async () => {
      mockUi.select.mockResolvedValue("B");
      setup(true);
      await proxy.wrappedUi.select("Pick:", ["A", "B"]);
      await new Promise((r) => setTimeout(r, 0));

      const dismissMsg = mockConnection.send.mock.calls.find(
        (c: any) => c[0].type === "extension_ui_dismiss",
      );
      expect(dismissMsg).toBeDefined();
    });

    it("should abort TUI input when dashboard wins multiselect", async () => {
      let capturedSignal: AbortSignal | undefined;
      mockUi.input.mockImplementation((_t: string, _p?: string, opts?: any) => {
        capturedSignal = opts?.signal;
        return new Promise(() => {});
      });
      setup(true);
      const promise = proxy.wrappedUi.multiselect("Pick:", ["A", "B"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { values: ["A"] } });
      await promise;
      await new Promise((r) => setTimeout(r, 0));

      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe("headless-only mode (hasUI=false)", () => {
    it("should NOT call original dialog methods", () => {
      setup(false);
      proxy.wrappedUi.confirm("Title", "Msg");
      expect(mockUi.confirm).not.toHaveBeenCalled();
    });

    it("should only await dashboard response", async () => {
      setup(false);
      const promise = proxy.wrappedUi.select("Pick:", ["A"]);

      expect(mockUi.select).not.toHaveBeenCalled();

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { value: "A" } });

      expect(await promise).toBe("A");
    });
  });

  describe("multiselect forwarding", () => {
    it("should send extension_ui_request for multiselect", () => {
      setup(false);
      proxy.wrappedUi.multiselect("Pick files:", ["a.ts", "b.ts", "c.ts"]);

      expect(mockConnection.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "extension_ui_request",
          method: "multiselect",
          params: { title: "Pick files:", options: ["a.ts", "b.ts", "c.ts"] },
        }),
      );
    });

    it("should resolve with selected values array", async () => {
      setup(false);
      const promise = proxy.wrappedUi.multiselect("Pick:", ["A", "B", "C"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({
        type: "extension_ui_response",
        sessionId,
        requestId,
        result: { values: ["A", "C"] },
      });

      expect(await promise).toEqual(["A", "C"]);
    });

    it("should resolve with empty array when cancelled", async () => {
      setup(false);
      const promise = proxy.wrappedUi.multiselect("Pick:", ["A", "B"]);

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({
        type: "extension_ui_response",
        sessionId,
        requestId,
        cancelled: true,
      });

      expect(await promise).toEqual([]);
    });

    it("should use TUI input fallback with numbered options when hasUI=true", async () => {
      mockUi.input.mockResolvedValue("1,3");
      setup(true);
      const promise = proxy.wrappedUi.multiselect("Pick:", ["a.ts", "b.ts", "c.ts"]);

      const result = await promise;
      expect(result).toEqual(["a.ts", "c.ts"]);
      expect(mockUi.input).toHaveBeenCalledWith(
        expect.stringContaining("1. a.ts"),
        expect.any(String),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("should return empty array when TUI input is empty or cancelled", async () => {
      mockUi.input.mockResolvedValue(undefined);
      setup(true);
      const result = await proxy.wrappedUi.multiselect("Pick:", ["a.ts"]);
      expect(result).toEqual([]);
    });

    it("should ignore invalid numbers in TUI input", async () => {
      mockUi.input.mockResolvedValue("1, 99, abc, 2");
      setup(true);
      const result = await proxy.wrappedUi.multiselect("Pick:", ["a.ts", "b.ts", "c.ts"]);
      expect(result).toEqual(["a.ts", "b.ts"]);
    });

    it("should only await dashboard in headless mode", async () => {
      setup(false);
      const promise = proxy.wrappedUi.multiselect("Pick:", ["A"]);

      expect(mockUi.input).not.toHaveBeenCalled();

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({
        type: "extension_ui_response",
        sessionId,
        requestId,
        result: { values: ["A"] },
      });

      expect(await promise).toEqual(["A"]);
    });
  });

  describe("unknown requestId", () => {
    it("should silently ignore responses with unknown requestId", () => {
      setup(false);
      // No pending requests — should not throw
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId: "unknown-id", result: {} });
    });
  });

  describe("pending request cleanup", () => {
    it("should remove pending request after resolution", async () => {
      setup(false);
      const promise = proxy.wrappedUi.confirm("Title", "Msg");

      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: true } });
      await promise;

      // Second response with same ID should be ignored (already cleaned up)
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: false } });
      // No error thrown — silently ignored
    });
  });

  describe("recursion guard", () => {
    it("should not recurse when ui.confirm calls back into the proxy", async () => {
      setup(true);

      // Simulate ctx.ui being patched: make ui.confirm call the proxy's wrappedUi.confirm
      let callCount = 0;
      mockUi.confirm.mockImplementation(() => {
        callCount++;
        // This simulates the scenario where ui.confirm IS the proxy (ctx.ui was patched)
        return proxy.wrappedUi.confirm("re-entrant", "msg");
      });

      const promise = proxy.wrappedUi.confirm("Test?", "msg");

      // Should have called ui.confirm exactly once (inProxy guard prevents re-entry)
      expect(callCount).toBe(1);

      // The re-entrant call should go dashboard-only (no TUI race)
      // Two sendRequest calls: original + re-entrant
      expect(mockConnection.send).toHaveBeenCalledTimes(2);

      // Resolve via dashboard to clean up
      const requestId = mockConnection.send.mock.calls[0][0].requestId;
      proxy.handleResponse({ type: "extension_ui_response", sessionId, requestId, result: { confirmed: true } });
    });

    it("should not recurse when ui.input calls back into the proxy", async () => {
      setup(true);

      let callCount = 0;
      mockUi.input.mockImplementation(() => {
        callCount++;
        return proxy.wrappedUi.input("re-entrant", "placeholder");
      });

      proxy.wrappedUi.input("Test input", "placeholder");
      expect(callCount).toBe(1);
    });
  });
});
