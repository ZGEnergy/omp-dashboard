import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionHistorySyncMessage } from "../../shared/protocol.js";

// Mock the dynamic import of @mariozechner/pi-coding-agent
const mockList = vi.fn();
vi.mock("@mariozechner/pi-coding-agent", () => ({
  SessionManager: {
    list: (...args: any[]) => mockList(...args),
  },
}));

import { sendSessionHistory } from "../session-history.js";

describe("sendSessionHistory", () => {
  let sent: SessionHistorySyncMessage[];

  beforeEach(() => {
    sent = [];
    mockList.mockReset();
  });

  function makeDeps(cwd = "/tmp/project") {
    return {
      send: (msg: SessionHistorySyncMessage) => sent.push(msg),
      cwd,
    };
  }

  it("should send correct message format with session data", async () => {
    mockList.mockResolvedValue([
      {
        id: "sess-1",
        cwd: "/tmp/project",
        name: "My Session",
        created: new Date("2025-01-01T00:00:00Z"),
        firstMessage: "Hello world",
        path: "/path/to/session.jsonl",
      },
      {
        id: "sess-2",
        cwd: "/tmp/project",
        name: undefined,
        created: new Date("2025-01-02T00:00:00Z"),
        firstMessage: "",
        path: "/path/to/session2.jsonl",
      },
    ]);

    await sendSessionHistory(makeDeps());

    expect(mockList).toHaveBeenCalledWith("/tmp/project");
    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe("session_history_sync");
    expect(sent[0].sessions).toHaveLength(2);
    expect(sent[0].sessions[0]).toEqual({
      id: "sess-1",
      cwd: "/tmp/project",
      name: "My Session",
      startedAt: new Date("2025-01-01T00:00:00Z").getTime(),
      firstMessage: "Hello world",
      sessionFile: "/path/to/session.jsonl",
      sessionDir: undefined,
    });
    expect(sent[0].sessions[1].firstMessage).toBeUndefined(); // empty string → undefined
  });

  it("should not send when no sessions exist", async () => {
    mockList.mockResolvedValue([]);

    await sendSessionHistory(makeDeps());

    expect(sent).toHaveLength(0);
  });

  it("should silently handle errors from SessionManager.list()", async () => {
    mockList.mockRejectedValue(new Error("filesystem error"));

    await sendSessionHistory(makeDeps());

    expect(sent).toHaveLength(0);
    // No error thrown
  });

  it("should silently handle import failure", async () => {
    // This tests the catch block when the module itself fails to load
    // Since we mocked it, we simulate by making list throw
    mockList.mockImplementation(() => { throw new Error("module not found"); });

    await sendSessionHistory(makeDeps());

    expect(sent).toHaveLength(0);
  });
});
