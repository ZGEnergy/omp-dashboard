import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { describe, expect, it } from "vitest";
import {
  createMemoryEventStore,
  exceedsSerializedSize,
} from "../memory-event-store.js";

function makeEvent(type: string = "test"): DashboardEvent {
  return { eventType: type, timestamp: Date.now(), data: {} };
}

describe("memory-event-store", () => {
  const neverPinned = () => false;

  it("inserts and retrieves events", () => {
    const store = createMemoryEventStore(neverPinned);
    const seq1 = store.insertEvent("s1", makeEvent("a"));
    const seq2 = store.insertEvent("s1", makeEvent("b"));
    expect(seq1).toBe(1);
    expect(seq2).toBe(2);

    const events = store.getEvents("s1", 1);
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(1);
    expect(events[1].seq).toBe(2);
  });

  it("getEvents with minSeq filters correctly", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());

    const events = store.getEvents("s1", 2);
    expect(events).toHaveLength(2);
    expect(events[0].seq).toBe(2);
  });

  it("getEvents returns empty for unknown session", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.getEvents("unknown", 1)).toEqual([]);
  });

  it("getEvent retrieves single event", () => {
    const store = createMemoryEventStore(neverPinned);
    const evt = makeEvent("special");
    store.insertEvent("s1", evt);
    const result = store.getEvent("s1", 1);
    expect(result?.eventType).toBe("special");
  });

  it("getEvent returns undefined for missing", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.getEvent("s1", 1)).toBeUndefined();
  });

  it("deleteEventsForSession clears buffer", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    const deleted = store.deleteEventsForSession("s1");
    expect(deleted).toBe(2);
    expect(store.getEvents("s1", 1)).toEqual([]);
    expect(store.hasEvents("s1")).toBe(false);
  });

  it("deleteEventsForSession returns 0 for unknown session", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.deleteEventsForSession("unknown")).toBe(0);
  });

  it("hasEvents checks correctly", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.hasEvents("s1")).toBe(false);
    store.insertEvent("s1", makeEvent());
    expect(store.hasEvents("s1")).toBe(true);
  });

  it("sessionCount tracks number of sessions", () => {
    const store = createMemoryEventStore(neverPinned);
    expect(store.sessionCount()).toBe(0);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s2", makeEvent());
    expect(store.sessionCount()).toBe(2);
  });

  it("assigns new seq numbers after deleteEventsForSession", () => {
    const store = createMemoryEventStore(neverPinned);
    store.insertEvent("s1", makeEvent());
    store.insertEvent("s1", makeEvent());
    store.deleteEventsForSession("s1");
    const seq = store.insertEvent("s1", makeEvent());
    expect(seq).toBe(1); // Resets after delete
  });

  describe("LRU eviction", () => {
    it("evicts least-recently-accessed when over limit", () => {
      const store = createMemoryEventStore(neverPinned, 3);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());
      expect(store.sessionCount()).toBe(3);

      // s4 should cause eviction of s1 (oldest)
      store.insertEvent("s4", makeEvent());
      expect(store.sessionCount()).toBe(3);
      expect(store.hasEvents("s1")).toBe(false);
      expect(store.hasEvents("s4")).toBe(true);
    });

    it("skips pinned sessions during eviction", () => {
      const pinned = new Set(["s1"]);
      const store = createMemoryEventStore((id) => pinned.has(id), 3);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());

      // s4 should cause eviction of s2 (s1 is pinned)
      store.insertEvent("s4", makeEvent());
      expect(store.hasEvents("s1")).toBe(true); // pinned, not evicted
      expect(store.hasEvents("s2")).toBe(false); // evicted
    });

    it("does not evict when all sessions are pinned", () => {
      const store = createMemoryEventStore(() => true, 2);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());
      // All pinned — can't evict, so size exceeds limit
      expect(store.sessionCount()).toBe(3);
    });

    it("accessing events updates lastAccess to prevent eviction", async () => {
      const store = createMemoryEventStore(neverPinned, 3);
      store.insertEvent("s1", makeEvent());
      await new Promise((r) => setTimeout(r, 5));
      store.insertEvent("s2", makeEvent());
      await new Promise((r) => setTimeout(r, 5));
      store.insertEvent("s3", makeEvent());

      // Access s1 so it becomes most recent
      await new Promise((r) => setTimeout(r, 5));
      store.getEvents("s1", 1);

      // s4 should evict s2 (least recently accessed), not s1
      store.insertEvent("s4", makeEvent());
      expect(store.hasEvents("s1")).toBe(true);
      expect(store.hasEvents("s2")).toBe(false);
    });
  });

  describe("image data preservation", () => {
    it("preserves base64 image data when sibling mimeType exists", () => {
      // maxStringFieldSize = 100 so normal strings get truncated
      const store = createMemoryEventStore(neverPinned, 100, 5000, 100);
      const longBase64 = "A".repeat(500);
      const event: DashboardEvent = {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [
              { type: "image", data: longBase64, mimeType: "image/png" },
            ],
          },
        },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1);
      const content = (stored as any).data.message.content[0];
      expect(content.data).toBe(longBase64);
      expect(content.data).toHaveLength(500);
    });

    it("still truncates data field without mimeType sibling", () => {
      const store = createMemoryEventStore(neverPinned, 100, 5000, 100);
      const longString = "B".repeat(500);
      const event: DashboardEvent = {
        eventType: "test",
        timestamp: Date.now(),
        data: { payload: { data: longString } },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1);
      const val = (stored as any).data.payload.data as string;
      expect(val.length).toBeLessThan(500);
      expect(val).toContain("truncated");
    });

    it("skill invocation envelope in user text is retained whole (Task 4.2: user text never capped)", () => {
      // Originally a regression test for capString's skill-envelope-aware
      // truncation (mid-string truncation destroyed the closing </skill> tag).
      // Task 4.2 makes the hard invariant unconditional: user message text is
      // NEVER capped or dropped, so this envelope now survives whole rather
      // than being body-capped. See change: bound-subagent-event-serialization
      // (skill regression fix); superseded by the message-content preservation
      // invariant (issue #48 Slice 4, Task 4.2).
      const store = createMemoryEventStore(neverPinned); // production defaults
      const bigBody = "Diagnose failed CI runs. ".repeat(2000); // ~50KB body
      const envelope = `<skill name="ci-troubleshoot" location="/u/.pi/skills/ci-troubleshoot/SKILL.md">\n${bigBody}\n</skill>\n\nplease check run 42`;
      const event: DashboardEvent = {
        eventType: "message_start",
        timestamp: Date.now(),
        data: { message: { role: "user", content: envelope } },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      expect(stored.data.__truncated).toBeUndefined();
      const content = stored.data.message.content as string;
      // Envelope stays intact (whole), never truncated.
      expect(content).toBe(envelope);
    });

    it("skill invocation envelope in tool output (non-protected context) is body-capped, head/tail preserved", () => {
      // Regression coverage: this branch of capString lost its only test when the
      // user-text-capping test above was inverted (user text is now never capped, so
      // that path no longer exercises the envelope-aware capping). Tool output strings
      // are still capped, so a skill envelope arriving as a tool_execution_end `result`
      // must still have its `<skill ...>` head and `</skill>` tail preserved verbatim
      // while the body is capped.
      const store = createMemoryEventStore(neverPinned); // production defaults
      const bigBody = "Diagnose failed CI runs. ".repeat(2000); // ~50KB body
      const head = `<skill name="ci-troubleshoot" location="/u/.pi/skills/ci-troubleshoot/SKILL.md">\n`;
      const envelope = `${head}${bigBody}\n</skill>`;
      const event: DashboardEvent = {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: { toolCallId: "t1", result: envelope },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      const result = stored.data.result as string;
      expect(result.length).toBeLessThan(envelope.length);
      expect(result.startsWith(head)).toBe(true);
      expect(result.endsWith("</skill>")).toBe(true);
      expect(result).toContain("truncated");
    });

    it("user message with a large pasted image survives the per-event size ceiling", () => {
      // Regression: the per-event total-size ceiling (DEFAULT_MAX_EVENT_DATA_SIZE)
      // counted preserved base64 image bytes, so ANY user message with a pasted
      // image (> 20KB base64) was replaced by the {__truncated} placeholder and
      // vanished from chat. Image blocks are deliberately preserved by the
      // string pass; the size walk must not count their bytes either.
      // See change: bound-subagent-event-serialization (regression fix).
      const store = createMemoryEventStore(neverPinned); // production defaults
      const bigImage = "A".repeat(100_000); // realistic pasted screenshot
      const event: DashboardEvent = {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [
              { type: "text", text: "here is the screenshot" },
              { type: "image", data: bigImage, mimeType: "image/png" },
            ],
          },
        },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      expect(stored.data.__truncated).toBeUndefined();
      expect(stored.data.message.role).toBe("user");
      expect(stored.data.message.content[1].data).toBe(bigImage);
    });

    it("truncates other fields alongside preserved image data", () => {
      const store = createMemoryEventStore(neverPinned, 100, 5000, 100);
      const longBase64 = "C".repeat(500);
      const longThinking = "D".repeat(5000);
      const event: DashboardEvent = {
        eventType: "message_start",
        timestamp: Date.now(),
        data: {
          message: {
            role: "user",
            content: [
              { type: "image", data: longBase64, mimeType: "image/png" },
            ],
          },
          thinking: longThinking,
        },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1);
      const content = (stored as any).data.message.content[0];
      expect(content.data).toBe(longBase64); // preserved
      const thinking = (stored as any).data.thinking as string;
      expect(thinking).toContain("truncated"); // truncated
      expect(thinking.length).toBeLessThan(longThinking.length); // shorter than original
    });
  });

  describe("string cap normalization", () => {
    const replayedEvent: DashboardEvent = {
      eventType: "message_start",
      timestamp: 1,
      data: {
        message: { role: "assistant", content: "replayed short message" },
        tool: { name: "read", callId: "replayed-call" },
        entry: { path: "src/replayed.ts", text: "replayed short entry" },
      },
    };

    it("preserves short nested fields for live and hydrated events with a zero cap", () => {
      const epoch = "00000000-0000-4000-8000-000000000000";
      const store = createMemoryEventStore(neverPinned, 100, 5000, 0, 20_000, epoch);

      store.insertEvent("live", replayedEvent);
      const liveData = store.getEvent("live", 1)!.data as any;
      expect(liveData.message.content).toBe("replayed short message");
      expect(liveData.tool.callId).toBe("replayed-call");
      expect(liveData.entry.text).toBe("replayed short entry");

      const hydrated = store.replaceEvents("hydrated", [replayedEvent]);
      const hydratedData = hydrated.events[0]!.event.data as any;
      expect(hydratedData.message.content).toBe("replayed short message");
      expect(hydratedData.tool.name).toBe("read");
      expect(hydratedData.entry.path).toBe("src/replayed.ts");
      expect(hydrated.sourceGeneration).toBe(`${epoch}:1`);
      expect(store.getSourceGeneration("hydrated")).toBe(hydrated.sourceGeneration);
    });

    it("still truncates oversized strings with a positive custom cap", () => {
      const store = createMemoryEventStore(neverPinned, 100, 5000, 8);
      store.insertEvent("s1", {
        eventType: "message_start",
        timestamp: 1,
        data: { message: { content: "0123456789abcdef" } },
      });

      expect((store.getEvent("s1", 1)!.data as any).message.content).toBe("01234567\n…[truncated]");
    });
  });

  describe("assistant prose preservation", () => {
    it("preserves long assistant text through insertion and hydration while capping unrelated fields", () => {
      const store = createMemoryEventStore(neverPinned);
      const longText = "assistant prose ".repeat(600);
      const events: DashboardEvent[] = ["message_update", "message_end"].map((eventType) => ({
        eventType,
        timestamp: 1,
        data: {
          message: { role: "assistant", content: [{ type: "text", text: longText }] },
          unrelated: "U".repeat(5_000),
        },
      }));

      for (const [index, event] of events.entries()) {
        store.insertEvent("live", event);
        const stored = store.getEvent("live", index + 1) as any;
        expect(stored.data.message.content[0].text).toBe(longText);
        expect(stored.data.message.content[0].text).not.toContain("…[truncated]");
        expect(stored.data.unrelated).toContain("…[truncated]");
      }

      const hydrated = store.replaceEvents("hydrated", events);
      for (const [index, entry] of hydrated.events.entries()) {
        const stored = entry.event as any;
        expect(stored.data.message.content[0].text).toBe(longText);
        expect(stored.data.message.content[0].text).not.toContain("…[truncated]");
        expect(stored.data.unrelated).toContain("…[truncated]");
        expect(entry.seq).toBe(index + 1);
      }

      // Task 4.2: user text is protected the same way as assistant text — never
      // capped or dropped (hard invariant, issue #48 Slice 4).
      const userStore = createMemoryEventStore(neverPinned);
      userStore.insertEvent("user", {
        eventType: "message_end",
        timestamp: 1,
        data: { message: { role: "user", content: [{ type: "text", text: longText }] } },
      });
      expect((userStore.getEvent("user", 1) as any).data.message.content[0].text).toBe(longText);
    });
  });

  describe("over-ceiling truncation preserves tool-call identity", () => {
    // Regression (Bug C): a tool_execution_end whose data exceeds
    // MAX_EVENT_DATA_SIZE was replaced by a placeholder that DROPPED toolCallId,
    // so findToolEndEvent 404'd and the client's running-tool row never cleared
    // (useStaleToolReconcile then polled it forever). A large `read`/`edit`
    // result routinely trips the ceiling. The placeholder must keep the small
    // scalar identity fields (toolCallId, toolName, isError) so the end still
    // pairs with its start.
    it("keeps toolCallId on an over-ceiling tool_execution_end so findToolEndEvent still matches", () => {
      // maxEventDataSize=100 → any real tool result trips the ceiling.
      const store = createMemoryEventStore(neverPinned, 100, 5000, 5000, 100);
      const toolCallId = "call-abc-2|fc_tmp_xyz";
      const event: DashboardEvent = {
        eventType: "tool_execution_end",
        timestamp: Date.now(),
        data: {
          type: "tool_execution_end",
          toolCallId,
          toolName: "read",
          isError: false,
          result: "R".repeat(2000), // large file read → over the ceiling
          details: { entries: Array.from({ length: 30 }, (_, i) => `line ${i}`) },
        },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      // Data WAS truncated (bounded) but identity survives.
      expect(stored.data.__truncated).toBe(true);
      expect(stored.data.toolCallId).toBe(toolCallId);
      expect(stored.data.isError).toBe(false);
      // The endpoint's lookup must now find it.
      const found = store.findToolEndEvent("s1", toolCallId);
      expect(found).toBeDefined();
      expect((found?.data as any).toolCallId).toBe(toolCallId);
    });
  });

  describe("getMaxSeq", () => {
    it("returns 0 for unknown session", () => {
      const store = createMemoryEventStore(neverPinned);
      expect(store.getMaxSeq("unknown")).toBe(0);
    });

    it("returns highest seq for session with events", () => {
      const store = createMemoryEventStore(neverPinned);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent());
      expect(store.getMaxSeq("s1")).toBe(3);
    });

    it("returns 0 after deleteEventsForSession", () => {
      const store = createMemoryEventStore(neverPinned);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent());
      store.deleteEventsForSession("s1");
      expect(store.getMaxSeq("s1")).toBe(0);
    });

    it("returns correct seq after oldest events trimmed", () => {
      const store = createMemoryEventStore(neverPinned, 100, 3);
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s1", makeEvent()); // seq 4, oldest (seq 1) trimmed
      expect(store.getMaxSeq("s1")).toBe(4);
    });
  });

  it("trims oldest events when per-session limit exceeded", () => {
    const store = createMemoryEventStore(neverPinned, 100, 3);
    store.insertEvent("s1", makeEvent("a"));
    store.insertEvent("s1", makeEvent("b"));
    store.insertEvent("s1", makeEvent("c"));
    store.insertEvent("s1", makeEvent("d"));

    const events = store.getEvents("s1", 1);
    expect(events).toHaveLength(3);
    // Oldest event (seq 1) should be trimmed
    expect(events[0].seq).toBe(2);
    expect(events[2].seq).toBe(4);
  });

  // See change: preserve-chat-head-on-event-trim.
  // Trimming is a CONTIGUOUS PREFIX drop.
  //
  // This block previously asserted the opposite contract: `message_start` /
  // `message_end` were preserved in place while the non-essential events between
  // them were dropped, deliberately leaving seq gaps, so the transcript head
  // survived a subagent flood (change: preserve-chat-head-on-event-trim).
  //
  // Measured against a real long-running session (~20% essential events), that
  // degenerates without bound — each trim strands more essentials and drops
  // everything between them:
  //
  //   inserted   retained   gaps     longest contiguous tail
  //     30,000     20,234    2,464            17,770
  //    120,000     20,027   20,000                27
  //    231,000     20,003   19,999                 4
  //
  // A sparse buffer is undeliverable: a replay window must be gap-free because
  // `SessionReplayLedger` accepts strictly `cursor + 1` and resets on
  // `gap_overflow`. With a 4-event dense tail the session hydrated to an empty
  // transcript, so the preserved chat head could never actually be shown.
  // Density beats head-preservation.
  // See change: fix-fragmenting-event-store-trim.
  describe("trimming keeps the retained range dense", () => {
    it("drops the oldest events, essential or not", () => {
      const store = createMemoryEventStore(neverPinned, 100, 3);
      store.insertEvent("s1", makeEvent("message_start")); // seq 1
      store.insertEvent("s1", makeEvent("message_end")); //   seq 2
      store.insertEvent("s1", makeEvent("tool_execution_start")); // seq 3
      store.insertEvent("s1", makeEvent("subagent_started")); //     seq 4

      const events = store.getEvents("s1", 1);
      expect(events.map((e) => e.seq)).toEqual([2, 3, 4]);
    });

    it("leaves no gaps when chat and noise are interleaved", () => {
      const store = createMemoryEventStore(neverPinned, 100, 3);
      for (const t of ["message_start", "tool_execution_start", "subagent_started", "message_end",
        "tool_execution_end", "message_start", "subagent_completed", "message_end"]) {
        store.insertEvent("s1", makeEvent(t));
      }
      const events = store.getEvents("s1", 1);
      expect(events.map((e) => e.seq)).toEqual([6, 7, 8]);
    });

    it("defers reclaim until trim slack is exhausted, then reclaims a batch", () => {
      const cap = 100;
      const slack = 5;
      const store = createMemoryEventStore(neverPinned, 100, cap);

      for (let i = 0; i < cap + slack; i++) {
        store.insertEvent("s1", makeEvent("tool_execution_start"));
      }
      expect(store.getEvents("s1", 1)).toHaveLength(cap + slack);

      store.insertEvent("s1", makeEvent("tool_execution_start"));
      const events = store.getEvents("s1", 1);
      expect(events).toHaveLength(cap);
      expect(events[0].seq).toBe(slack + 2);
      expect(events.at(-1)?.seq).toBe(cap + slack + 1);
    });

    it("survives a subagent flood: buffer stays bounded AND dense", () => {
      const cap = 500; // slack = floor(500*0.05) = 25
      const store = createMemoryEventStore(neverPinned, 100, cap);
      store.insertEvent("s1", makeEvent("message_start")); // seq 1
      store.insertEvent("s1", makeEvent("message_end")); //   seq 2
      for (let i = 0; i < 10_000; i++) {
        store.insertEvent("s1", makeEvent("tool_execution_start"));
      }

      const events = store.getEvents("s1", 1);
      expect(events.length).toBeLessThanOrEqual(cap + 25);
      // The opening chat events are gone — but what remains is deliverable,
      // which the stranded head never was.
      expect(events.every((e, i) => i === 0 || e.seq === events[i - 1].seq + 1)).toBe(true);
      expect(events.at(-1)?.seq).toBe(10_002);
    });
  });

  describe("per-event serialized-size ceiling", () => {
    // Signature: createMemoryEventStore(isPinned, maxCachedSessions,
    //   maxEventsPerSession, maxStringFieldSize, maxEventDataSize)
    const CAP = 2_000;

    it("bounds an oversized deeply-nested subagent event before storage", () => {
      // maxStringFieldSize huge (no per-field truncation) so ONLY the
      // per-event size ceiling can bound this; deep nesting past depth 4.
      const store = createMemoryEventStore(neverPinned, 100, 20000, 1_000_000, CAP);
      // Build data nested past the depth-4 recursion limit, each level
      // carrying a large string, so aggregate >> CAP.
      let node: Record<string, unknown> = { leaf: "Z".repeat(50_000) };
      for (let i = 0; i < 8; i++) node = { big: "Y".repeat(20_000), next: node };
      const event: DashboardEvent = {
        eventType: "subagent_end",
        timestamp: Date.now(),
        data: { result: node },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1);
      // The stored event must serialize small (ceiling + small constant).
      const size = JSON.stringify(stored).length;
      expect(size).toBeLessThanOrEqual(CAP + 500);
      // eventType preserved for the client.
      expect(stored?.eventType).toBe("subagent_end");
    });

    it("stores under-ceiling events unchanged (no placeholder)", () => {
      const store = createMemoryEventStore(neverPinned, 100, 20000, 1_000_000, CAP);
      const event: DashboardEvent = {
        eventType: "message_end",
        timestamp: Date.now(),
        data: { text: "hello world" },
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      expect(stored.data.text).toBe("hello world");
      expect(stored.data.__truncated).toBeUndefined();
    });

    it("truncates deep sub-trees rather than returning them raw", () => {
      // Small maxStringFieldSize; generous size ceiling so the depth escape,
      // not the ceiling, is what would (previously) leak the deep payload.
      const store = createMemoryEventStore(neverPinned, 100, 20000, 100, 10_000_000);
      const deepBig = "Q".repeat(50_000);
      const event: DashboardEvent = {
        eventType: "test",
        // depth: data(0) > a(1) > b(2) > c(3) > d(4) > e(5) — past the limit
        data: { a: { b: { c: { d: { e: { huge: deepBig } } } } } },
        timestamp: Date.now(),
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1);
      const size = JSON.stringify(stored).length;
      // The deep 50k string must NOT survive whole.
      expect(size).toBeLessThan(deepBig.length);
    });

    it("preserves deep base64 image data even past the depth limit", () => {
      const store = createMemoryEventStore(neverPinned, 100, 20000, 100, 10_000_000);
      const img = "I".repeat(2_000);
      const event: DashboardEvent = {
        eventType: "message_start",
        data: { a: { b: { c: { d: { e: { data: img, mimeType: "image/png" } } } } } },
        timestamp: Date.now(),
      };
      store.insertEvent("s1", event);
      const stored = store.getEvent("s1", 1) as any;
      expect(stored.data.a.b.c.d.e.data).toBe(img);
    });

    it("the broadcast source (getEvent) is bounded for an over-ceiling event", () => {
      // event-wiring broadcasts eventStore.getEvent(seq); asserting getEvent is
      // bounded proves the broadcast JSON.stringify cannot allocate unbounded.
      const store = createMemoryEventStore(neverPinned, 100, 20000, 1_000_000, 2_000);
      const event: DashboardEvent = {
        eventType: "subagent_end",
        timestamp: Date.now(),
        data: { timeline: Array.from({ length: 500 }, () => "X".repeat(1_000)) },
      };
      const seq = store.insertEvent("s1", event);
      const broadcastPayload = store.getEvent("s1", seq);
      expect(JSON.stringify(broadcastPayload).length).toBeLessThanOrEqual(2_500);
    });
  });

  describe("exceedsSerializedSize (bounded early-exit guard)", () => {
    it("returns false for small values", () => {
      expect(exceedsSerializedSize({ a: 1, b: "hi" }, 1_000)).toBe(false);
    });

    it("returns true once the running total crosses the cap", () => {
      expect(exceedsSerializedSize({ big: "A".repeat(10_000) }, 1_000)).toBe(true);
    });

    it("early-exits without visiting the whole object", () => {
      // A huge tail after an already-over-cap head must never be walked. Use a
      // getter that throws if accessed to prove the walk stopped early.
      const trap: Record<string, unknown> = { head: "A".repeat(5_000) };
      Object.defineProperty(trap, "tail", {
        enumerable: true,
        get() {
          throw new Error("walked past the cap");
        },
      });
      expect(() => exceedsSerializedSize(trap, 1_000)).not.toThrow();
      expect(exceedsSerializedSize(trap, 1_000)).toBe(true);
    });

    it("tolerates cyclic references without infinite recursion", () => {
      const a: Record<string, unknown> = {};
      a.self = a;
      expect(exceedsSerializedSize(a, 1_000)).toBe(false);
    });
  });

  // See change: instrument-event-store-trim.
  describe("getTrimStats (store-shed telemetry)", () => {
    it("reports all-zero stats when nothing is trimmed or evicted", () => {
      const store = createMemoryEventStore(neverPinned);
      store.insertEvent("s1", makeEvent("tool_execution_end"));
      store.insertEvent("s1", makeEvent("message_start"));
      expect(store.getTrimStats()).toEqual({
        trimmedEvents: { total: 0, toolExecutionEnd: 0, bySession: {} },
        evictedSessions: 0,
      });
    });

    it("counts trimmed events, exactly the dropped tool_execution_end, per session", () => {
      // cap = 3, trimSlack = 0 → trims on every over-cap insert.
      const store = createMemoryEventStore(neverPinned, 100, 3);
      // Trimming drops a contiguous prefix, so the oldest event goes first
      // regardless of type. See change: fix-fragmenting-event-store-trim.
      store.insertEvent("s1", makeEvent("message_start")); // 1
      store.insertEvent("s1", makeEvent("message_end")); // 2
      store.insertEvent("s1", makeEvent("tool_execution_end")); // 3
      store.insertEvent("s1", makeEvent("tool_execution_start")); // 4 → drops seq1
      store.insertEvent("s1", makeEvent("tool_execution_end")); // 5 → drops seq2
      store.insertEvent("s1", makeEvent("tool_execution_start")); // 6 → drops seq3

      const stats = store.getTrimStats();
      // Three oldest whole events dropped: seq1, seq2, seq3. Only seq3 is a
      // tool_execution_end.
      expect(stats.trimmedEvents.total).toBe(3);
      expect(stats.trimmedEvents.toolExecutionEnd).toBe(1);
      expect(stats.trimmedEvents.bySession).toEqual({ s1: 3 });
    });

    it("does not attribute drops to a session that stays under the cap", () => {
      const store = createMemoryEventStore(neverPinned, 100, 3);
      // s1 overshoots and trims; s2 stays under the cap.
      for (let i = 0; i < 5; i++) store.insertEvent("s1", makeEvent("tool_execution_end"));
      store.insertEvent("s2", makeEvent("tool_execution_end"));

      const stats = store.getTrimStats();
      expect(stats.trimmedEvents.bySession.s1).toBeGreaterThan(0);
      expect(stats.trimmedEvents.bySession.s2).toBeUndefined();
    });

    it("drops the bySession entry when its buffer is deleted or evicted", () => {
      // maxCachedSessions = 2 so a third session evicts the LRU one.
      const store = createMemoryEventStore(neverPinned, 2, 3);
      for (let i = 0; i < 5; i++) store.insertEvent("s1", makeEvent("tool_execution_end"));
      expect(store.getTrimStats().trimmedEvents.bySession.s1).toBeGreaterThan(0);
      // Explicit delete purges the per-session tally.
      store.deleteEventsForSession("s1");
      expect(store.getTrimStats().trimmedEvents.bySession.s1).toBeUndefined();
      // Re-trim s2, then evict it via LRU with s3/s4 → its tally is purged too.
      for (let i = 0; i < 5; i++) store.insertEvent("s2", makeEvent("tool_execution_end"));
      expect(store.getTrimStats().trimmedEvents.bySession.s2).toBeGreaterThan(0);
      store.insertEvent("s3", makeEvent());
      store.insertEvent("s4", makeEvent()); // evicts s2 (LRU)
      expect(store.hasEvents("s2")).toBe(false);
      expect(store.getTrimStats().trimmedEvents.bySession.s2).toBeUndefined();
      // The cumulative global total is NOT reset by eviction/deletion.
      expect(store.getTrimStats().trimmedEvents.total).toBeGreaterThan(0);
    });

    it("counts cross-session LRU evictions", () => {
      const store = createMemoryEventStore(neverPinned, 3); // maxCachedSessions = 3
      store.insertEvent("s1", makeEvent());
      store.insertEvent("s2", makeEvent());
      store.insertEvent("s3", makeEvent());
      expect(store.getTrimStats().evictedSessions).toBe(0);
      // s4 pushes over the LRU cap → evict 1 (s1).
      store.insertEvent("s4", makeEvent());
      expect(store.getTrimStats().evictedSessions).toBe(1);
      // s5 evicts another.
      store.insertEvent("s5", makeEvent());
      expect(store.getTrimStats().evictedSessions).toBe(2);
    });
  it("retains a contiguous capped suffix when replacing a hydrated source", () => {
    const store = createMemoryEventStore(neverPinned, 100, 2);
    store.replaceEvents("s1", [makeEvent("one"), makeEvent("two"), makeEvent("three")]);

    expect(store.getEvents("s1", 1).map(({ seq, event }) => [seq, event.eventType])).toEqual([[2, "two"], [3, "three"]]);
    expect(store.getRetainedRange("s1")).toEqual({ retainedMinSeq: 2, retainedMaxSeq: 3, historyTruncated: true });
    expect(store.getMaxSeq("s1")).toBe(3);
  });

  it("never reuses a source generation after an evicted session is recreated", () => {
    const store = createMemoryEventStore(neverPinned, 1, 10, 4_000, 20_000, "00000000-0000-4000-8000-000000000000");
    store.insertEvent("s1", makeEvent());
    const first = store.getSourceGeneration("s1");
    store.insertEvent("s2", makeEvent()); // evicts s1
    store.insertEvent("s1", makeEvent()); // recreates s1 and evicts s2

    expect(store.getSourceGeneration("s1")).not.toBe(first);
  });
  });
});
