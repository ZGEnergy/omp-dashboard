/**
 * Round-trip test for state-replay (per change: fix-per-message-fork):
 * for every persisted entry, the reducer-equivalent message_start /
 * message_end carries entryId === entry.id. Replay does NOT need
 * entry_persisted back-fill because it reads from the persisted JSONL.
 */
import { describe, expect, it } from "vitest";
import { replayEntriesAsEvents } from "../state-replay.js";

describe("replayEntriesAsEvents — entryId fidelity", () => {
  it("stamps entryId on user message_start matching the source entry id", () => {
    const sessionId = "sess-1";
    const entries = [
      {
        type: "message",
        id: "u1",
        parentId: "root",
        timestamp: "2026-04-27T07:26:25.000Z",
        message: { role: "user", content: [{ type: "text", text: "Hello" }] },
      },
    ];

    const events = replayEntriesAsEvents(sessionId, entries);
    const start = events.find((e) => e.event.eventType === "message_start");
    expect(start).toBeDefined();
    expect((start!.event.data as any).entryId).toBe("u1");
  });

  it("stamps entryId on assistant message_end matching the source entry id", () => {
    const sessionId = "sess-1";
    const entries = [
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-04-27T07:26:30.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "Hi!" }] },
      },
    ];

    const events = replayEntriesAsEvents(sessionId, entries);
    const end = events.find((e) => e.event.eventType === "message_end");
    expect(end).toBeDefined();
    expect((end!.event.data as any).entryId).toBe("a1");
  });


  it("replays visible advisor records as one message event pair", () => {
    const events = replayEntriesAsEvents("s1", [{
      type: "custom_message",
      id: "advisor-7",
      customType: "advisor",
      display: true,
      content: "<advisory>fix type</advisory>",
      details: { notes: [{ note: "fix type", severity: "concern" }] },
    }]);

    expect(events.map((event) => event.event.eventType)).toEqual(["message_start", "message_end"]);
    expect(events[1]?.event.data).toMatchObject({
      message: {
        role: "custom",
        customType: "advisor",
        content: "<advisory>fix type</advisory>",
        details: { notes: [{ note: "fix type", severity: "concern" }] },
      },
      entryId: "advisor-7",
    });
  });

  it("skips hidden and non-advisor custom_message records", () => {
    const events = replayEntriesAsEvents("s1", [
      { type: "custom_message", id: "hidden", customType: "advisor", display: false },
      { type: "custom_message", id: "other", customType: "rewind-report", display: true },
    ]);

    expect(events).toEqual([]);
  });

  it("emits no entry_persisted events during replay", () => {
    const sessionId = "sess-1";
    const entries = [
      {
        type: "message",
        id: "u1",
        timestamp: "2026-04-27T07:26:25.000Z",
        message: { role: "user", content: [{ type: "text", text: "Hi" }] },
      },
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-04-27T07:26:30.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
      },
    ];

    const events = replayEntriesAsEvents(sessionId, entries);
    const persisted = events.filter((e) => e.event.eventType === "entry_persisted");
    expect(persisted).toHaveLength(0);
  });
});
