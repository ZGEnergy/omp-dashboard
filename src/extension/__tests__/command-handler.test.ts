import { describe, it, expect, vi } from "vitest";
import { createCommandHandler } from "../command-handler.js";
import type { ServerToExtensionMessage, LoadSessionEventsResultMessage, LoadSessionEventsErrorMessage } from "../../shared/protocol.js";

describe("CommandHandler", () => {
  function createMockPi() {
    return {
      sendUserMessage: vi.fn(),
      getCommands: vi.fn().mockReturnValue([
        { name: "test", description: "Test cmd", source: "extension" as const },
      ]),
      setSessionName: vi.fn(),
      getSessionName: vi.fn(),
      on: vi.fn(),
    };
  }

  it("should call sendUserMessage on send_prompt when idle", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const msg: ServerToExtensionMessage = {
      type: "send_prompt",
      sessionId: "s1",
      text: "Hello agent",
    };

    await handler.handle(msg);

    expect(pi.sendUserMessage).toHaveBeenCalledWith("Hello agent");
  });

  it("should ignore messages for different sessionIds", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const msg: ServerToExtensionMessage = {
      type: "send_prompt",
      sessionId: "s2",
      text: "Hello",
    };

    await handler.handle(msg);
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("should send images with valid mimeType via sendUserMessage", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [
        { type: "image", data: "abc123", mimeType: "image/png" },
      ],
    });

    expect(pi.sendUserMessage).toHaveBeenCalledWith([
      { type: "text", text: "check this" },
      { type: "image", data: "abc123", mimeType: "image/png" },
    ]);
  });

  it("should drop images with invalid mimeType and send text only", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [
        { type: "image", data: "abc123", mimeType: "image/bmp" },
      ],
    });

    // Invalid mimeType → dropped, sends text only
    expect(pi.sendUserMessage).toHaveBeenCalledWith("check this");
  });

  it("should drop images with undefined or null mimeType", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [
        { type: "image", data: "abc123", mimeType: undefined as any },
        { type: "image", data: "abc123", mimeType: null as any },
      ],
    });

    expect(pi.sendUserMessage).toHaveBeenCalledWith("check this");
  });

  it("should drop images with empty or non-string data", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [
        { type: "image", data: "", mimeType: "image/png" },
      ],
    });

    expect(pi.sendUserMessage).toHaveBeenCalledWith("check this");
  });

  it("should drop non-object image entries", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [null as any, "bad" as any],
    });

    expect(pi.sendUserMessage).toHaveBeenCalledWith("check this");
  });

  it("should keep valid images and drop invalid ones", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    await handler.handle({
      type: "send_prompt",
      sessionId: "s1",
      text: "check this",
      images: [
        { type: "image", data: "good", mimeType: "image/jpeg" },
        { type: "image", data: "bad", mimeType: "image/bmp" },
        { type: "image", data: "also-good", mimeType: "image/webp" },
      ],
    });

    expect(pi.sendUserMessage).toHaveBeenCalledWith([
      { type: "text", text: "check this" },
      { type: "image", data: "good", mimeType: "image/jpeg" },
      { type: "image", data: "also-good", mimeType: "image/webp" },
    ]);
  });

  it("should handle rename_session by calling setSessionName and returning confirmation", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const result = await handler.handle({
      type: "rename_session",
      sessionId: "s1",
      name: "My New Name",
    });

    expect(pi.setSessionName).toHaveBeenCalledWith("My New Name");
    expect(result).toEqual({
      type: "session_name_update",
      sessionId: "s1",
      name: "My New Name",
    });
  });

  it("should call shutdown option when shutdown message received", async () => {
    const pi = createMockPi();
    const shutdown = vi.fn();
    const handler = createCommandHandler(pi as any, "s1", { shutdown });

    await handler.handle({ type: "shutdown", sessionId: "s1" } as ServerToExtensionMessage);
    expect(shutdown).toHaveBeenCalled();
  });

  it("should not crash when shutdown called without option", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    // Should not throw
    await handler.handle({ type: "shutdown", sessionId: "s1" } as ServerToExtensionMessage);
  });

  it("should call abort option when abort message received", async () => {
    const pi = createMockPi();
    const abort = vi.fn();
    const handler = createCommandHandler(pi as any, "s1", { abort });

    await handler.handle({ type: "abort", sessionId: "s1" } as ServerToExtensionMessage);
    expect(abort).toHaveBeenCalled();
  });

  it("should not crash when abort called without option", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    // Should not throw
    await handler.handle({ type: "abort", sessionId: "s1" } as ServerToExtensionMessage);
  });

  it("should return undefined for openspec_refresh (handled by bridge)", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const result = await handler.handle({
      type: "openspec_refresh",
      sessionId: "s1",
    } as ServerToExtensionMessage);

    expect(result).toBeUndefined();
  });

  it("should handle request_commands message", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const msg: ServerToExtensionMessage = {
      type: "request_commands",
      sessionId: "s1",
    };

    const result = await handler.handle(msg);
    expect(pi.getCommands).toHaveBeenCalled();
    expect(result).toBeDefined();
    expect(result?.type).toBe("commands_list");
  });

  it("should handle list_sessions gracefully when SessionManager is unavailable", async () => {
    const pi = createMockPi();
    const handler = createCommandHandler(pi as any, "s1");

    const result = await handler.handle({
      type: "list_sessions",
      sessionId: "s1",
      cwd: "/some/path",
    } as any);

    // Should return empty array on import failure
    expect(result).toBeDefined();
    expect(result!.type).toBe("sessions_list");
    expect((result as any).sessions).toEqual([]);
  });

  describe("load_session_events", () => {
    it("should load session file and return events", async () => {
      const pi = createMockPi();
      const handler = createCommandHandler(pi as any, "s1");

      // Mock the dynamic import
      const mockEntries = [
        {
          type: "message",
          timestamp: "2024-01-01T00:00:00Z",
          message: { role: "user", content: [{ type: "text", text: "Hello" }] },
        },
      ];
      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        SessionManager: {
          open: vi.fn().mockReturnValue({
            getBranch: vi.fn().mockReturnValue(mockEntries),
          }),
        },
      }));

      const result = await handler.handle({
        type: "load_session_events",
        sessionId: "old-session",
        sessionFile: "/path/to/session.json",
      } as any);

      expect(result).toBeDefined();
      expect(result!.type).toBe("load_session_events_result");
      const r = result as LoadSessionEventsResultMessage;
      expect(r.sessionId).toBe("old-session");
      expect(r.events.length).toBeGreaterThan(0);

      vi.doUnmock("@mariozechner/pi-coding-agent");
    });

    it("should return error when file not found", async () => {
      const pi = createMockPi();
      const handler = createCommandHandler(pi as any, "s1");

      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        SessionManager: {
          open: vi.fn().mockImplementation(() => {
            const err: any = new Error("ENOENT");
            err.code = "ENOENT";
            throw err;
          }),
        },
      }));

      const result = await handler.handle({
        type: "load_session_events",
        sessionId: "missing",
        sessionFile: "/nonexistent/session.json",
      } as any);

      expect(result).toBeDefined();
      expect(result!.type).toBe("load_session_events_error");
      const r = result as LoadSessionEventsErrorMessage;
      expect(r.sessionId).toBe("missing");
      expect(r.error).toBe("file_not_found");

      vi.doUnmock("@mariozechner/pi-coding-agent");
    });

    it("should return error on parse failure", async () => {
      const pi = createMockPi();
      const handler = createCommandHandler(pi as any, "s1");

      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        SessionManager: {
          open: vi.fn().mockImplementation(() => {
            throw new Error("Invalid JSON");
          }),
        },
      }));

      const result = await handler.handle({
        type: "load_session_events",
        sessionId: "corrupt",
        sessionFile: "/corrupt/session.json",
      } as any);

      expect(result).toBeDefined();
      expect(result!.type).toBe("load_session_events_error");
      const r = result as LoadSessionEventsErrorMessage;
      expect(r.error).toBe("Invalid JSON");

      vi.doUnmock("@mariozechner/pi-coding-agent");
    });

    it("should handle load_session_events for any sessionId (not just current)", async () => {
      const pi = createMockPi();
      const handler = createCommandHandler(pi as any, "s1");

      // load_session_events for "other-session" should NOT be ignored
      // even though current session is "s1"
      vi.doMock("@mariozechner/pi-coding-agent", () => ({
        SessionManager: {
          open: vi.fn().mockReturnValue({
            getBranch: vi.fn().mockReturnValue([]),
          }),
        },
      }));

      const result = await handler.handle({
        type: "load_session_events",
        sessionId: "other-session",
        sessionFile: "/path/to/other.json",
      } as any);

      expect(result).toBeDefined();
      expect(result!.type).toBe("load_session_events_result");
      expect((result as LoadSessionEventsResultMessage).sessionId).toBe("other-session");

      vi.doUnmock("@mariozechner/pi-coding-agent");
    });
  });

  it("should use sessionId getter for dynamic session ID", async () => {
    const pi = createMockPi();
    let currentId = "s1";
    const handler = createCommandHandler(pi as any, () => currentId);

    // Message for s1 should work
    await handler.handle({ type: "send_prompt", sessionId: "s1", text: "hello" });
    expect(pi.sendUserMessage).toHaveBeenCalledWith("hello");

    pi.sendUserMessage.mockClear();

    // Change the session ID
    currentId = "s2";

    // Now message for s1 should be ignored
    await handler.handle({ type: "send_prompt", sessionId: "s1", text: "ignored" });
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    // And message for s2 should work
    await handler.handle({ type: "send_prompt", sessionId: "s2", text: "accepted" });
    expect(pi.sendUserMessage).toHaveBeenCalledWith("accepted");
  });
});
