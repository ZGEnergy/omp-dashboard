/**
 * Backward-compatible replay-options seam for `replayEntriesAsEvents`
 * (mobile-session-rehydration: shared replay-preparation cutover).
 *
 * Contract (local://mobile-session-rehydration-plan.md):
 *   `prepareEventForReplay(event,{registerInlineAsset})` returns
 *   `{event, assetHashes, issues}`. `registerInlineAsset` receives
 *   `{data,mimeType}` and returns a content hash or undefined. The asset
 *   hash contract is sha256 truncated to 16 hex chars. The existing bridge
 *   `asset_register` message must precede the referencing event.
 *
 * This file exercises the opt-in 4th `options` argument. The 3-argument
 * form MUST remain byte-for-byte backward compatible (inline bodies kept,
 * no truncation, no prepare).
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { replayEntriesAsEvents } from "../state-replay.js";
import { createHash } from "node:crypto";
import type { EventForwardMessage } from "../protocol.js";

const prepareFailures = vi.hoisted(() => ({ toolEndFailuresRemaining: 0 }));

vi.mock("../prepare-event-for-replay.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../prepare-event-for-replay.js")>();
  return {
    ...actual,
    prepareEventForReplay(
      ...args: Parameters<typeof actual.prepareEventForReplay>
    ): ReturnType<typeof actual.prepareEventForReplay> {
      if (
        args[0].eventType === "tool_execution_end" &&
        prepareFailures.toolEndFailuresRemaining > 0
      ) {
        prepareFailures.toolEndFailuresRemaining -= 1;
        throw new Error("unexpected preparation failure");
      }
      return actual.prepareEventForReplay(...args);
    },
  };
});

beforeEach(() => {
  prepareFailures.toolEndFailuresRemaining = 0;
});

/** sha256 truncated to 16 hex chars — mirrors the extension's hashBytes contract. */
function hashBytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

/** Build a toolResult entry carrying inline image content blocks. */
function toolResultEntry(
  id: string,
  parentId: string,
  toolCallId: string,
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>,
  isError = false,
) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-07-18T00:00:00.000Z",
    message: {
      role: "toolResult",
      toolCallId,
      toolName: "screenshot",
      content,
      isError,
    },
  };
}

function assistantToolCallEntry(
  id: string,
  parentId: string,
  toolCallId: string,
  toolName = "screenshot",
) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-07-18T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: "{}" }],
    },
  };
}

function userEntry(id: string, text: string) {
  return {
    type: "message",
    id,
    parentId: "root",
    timestamp: "2026-07-18T00:00:00.000Z",
    message: { role: "user", content: [{ type: "text", text }] },
  };
}

const PNG_A = Buffer.from("png-bytes-A");
const PNG_B = Buffer.from("png-bytes-B");

/** A capturing registerInlineAsset that hashes decoded base64 bytes (sha256→16). */
function capturingRegistrar() {
  const calls: Array<{ data: string; mimeType: string }> = [];
  const registerInlineAsset = (asset: { data: string; mimeType: string }): string | undefined => {
    calls.push({ data: asset.data, mimeType: asset.mimeType });
    return hashBytes(Buffer.from(asset.data, "base64"));
  };
  return { calls, registerInlineAsset };
}

function toolEnds(events: EventForwardMessage[]) {
  return events.filter((e) => e.event.eventType === "tool_execution_end");
}

function imagesOf(ev: EventForwardMessage): Array<Record<string, unknown>> {
  return ((ev.event.data as { images?: Array<Record<string, unknown>> }).images) ?? [];
}

describe("replayEntriesAsEvents — replay-options seam", () => {
  it("backward-compatible 3-arg call keeps inline image bodies (no prepare)", () => {
    const entries = [
      userEntry("u1", "take a shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "text", text: "done" },
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];

    // No options → legacy behavior: inline body present, no pi-asset ref.
    const events = replayEntriesAsEvents("s1", entries, 200_000);
    const end = toolEnds(events)[0];
    expect(end).toBeDefined();
    const imgs = imagesOf(end);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].data).toBe(PNG_A.toString("base64"));
    expect(imgs[0].mimeType).toBe("image/png");
    expect(imgs[0].type).toBeUndefined();
    expect(imgs[0].src).toBeUndefined();
  });

  it("options seam routes tool_execution_end through prepareEventForReplay (inline data removed)", () => {
    const entries = [
      userEntry("u1", "take a shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "text", text: "done" },
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { calls, registerInlineAsset } = capturingRegistrar();

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });
    const end = toolEnds(events)[0];
    expect(end).toBeDefined();
    const imgs = imagesOf(end);
    expect(imgs).toHaveLength(1);
    // Inline body removed; bounded pi-asset: reference present.
    expect(imgs[0].data).toBeUndefined();
    expect(imgs[0].type).toBe("asset");
    expect(imgs[0].mimeType).toBe("image/png");
    const hash = hashBytes(PNG_A);
    expect(imgs[0].hash).toBe(hash);
    expect(imgs[0].src).toBe(`pi-asset:${hash}`);

    // Registrar received the raw base64 bytes + mime.
    expect(calls).toEqual([{ data: PNG_A.toString("base64"), mimeType: "image/png" }]);
  });

  it("registerInlineAsset is invoked once per inline image and preserves duplicate output order", () => {
    const entries = [
      userEntry("u1", "shots"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { calls, registerInlineAsset } = capturingRegistrar();

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });
    const hash = hashBytes(PNG_A);
    expect(calls).toEqual([{ data: PNG_A.toString("base64"), mimeType: "image/png" }]);

    const end = toolEnds(events)[0];
    expect(end).toBeDefined();
    expect(imagesOf(end)).toEqual([
      { type: "asset", hash, mimeType: "image/png", src: `pi-asset:${hash}` },
      { type: "asset", hash, mimeType: "image/png", src: `pi-asset:${hash}` },
    ]);
  });

  it("preserves exact event order when options seam is active", () => {
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
      assistantToolCallEntry("a2", "r1", "tc2"),
      toolResultEntry("r2", "a2", "tc2", [{ type: "text", text: "ok" }]),
    ];
    const { registerInlineAsset } = capturingRegistrar();

    const prepared = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });
    const legacy = replayEntriesAsEvents("s1", entries);

    expect(prepared.map((e) => e.event.eventType)).toEqual(
      legacy.map((e) => e.event.eventType),
    );
    // Sequence identity — same count, same order, same timestamps.
    expect(prepared.length).toBe(legacy.length);
    prepared.forEach((p, i) => {
      expect(p.event.eventType).toBe(legacy[i].event.eventType);
      expect(p.event.timestamp).toBe(legacy[i].event.timestamp);
    });
  });

  it("registerInlineAsset returning undefined marks the image unavailable (no throw)", () => {
    const entries = [
      userEntry("u1", "shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const registerInlineAsset = (): string | undefined => undefined;

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });
    const end = toolEnds(events)[0];
    expect(end).toBeDefined();
    const imgs = imagesOf(end);
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe("asset_unavailable");
    expect(imgs[0].mimeType).toBe("image/png");
    expect(imgs[0].data).toBeUndefined();
    expect(imgs[0].src).toBeUndefined();
  });

  it("retries an unexpected preparation failure without the registrar or inline data", () => {
    const entries = [
      userEntry("u1", "shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const legacy = replayEntriesAsEvents("s1", entries);
    const { calls, registerInlineAsset } = capturingRegistrar();
    prepareFailures.toolEndFailuresRemaining = 1;

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });

    expect(events.map(({ event }) => [event.eventType, event.timestamp])).toEqual(
      legacy.map(({ event }) => [event.eventType, event.timestamp]),
    );
    expect(calls).toHaveLength(0);
    expect(imagesOf(toolEnds(events)[0])).toEqual([
      { type: "asset_unavailable", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(events)).not.toContain(PNG_A.toString("base64"));
  });

  it("emits a bounded explicit unavailable event if safe preparation also fails", () => {
    const entries = [
      userEntry("u1", "shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const legacy = replayEntriesAsEvents("s1", entries);
    const { calls, registerInlineAsset } = capturingRegistrar();
    prepareFailures.toolEndFailuresRemaining = 2;

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });

    expect(events.map(({ event }) => [event.eventType, event.timestamp])).toEqual(
      legacy.map(({ event }) => [event.eventType, event.timestamp]),
    );
    expect(calls).toHaveLength(0);
    expect(toolEnds(events)[0].event.data).toEqual({ replayUnavailable: true });
    expect(Buffer.byteLength(JSON.stringify(toolEnds(events)[0].event))).toBeLessThan(1024);
    expect(JSON.stringify(events)).not.toContain(PNG_A.toString("base64"));
  });

  it("malformed tool execution (cyclic details) is recovered, not dropped or thrown", () => {
    const cyclic: { label: string; self?: unknown } = { label: "x" };
    cyclic.self = cyclic;
    const result = toolResultEntry("r1", "a1", "tc1", [{ type: "text", text: "done" }]);
    const resultWithDetails = { ...result, message: { ...result.message, details: cyclic } };
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      resultWithDetails,
    ];
    const { registerInlineAsset } = capturingRegistrar();

    const events = replayEntriesAsEvents("s1", entries, undefined, { registerInlineAsset });
    const end = toolEnds(events)[0];
    expect(end).toBeDefined();
    expect((end.event.data as { toolCallId: unknown }).toolCallId).toBe("tc1");
    expect((end.event.data as any).details.self).toBe("[unavailable: circular reference]");
    expect(() => JSON.stringify(end)).not.toThrow();
  });

  it("maxTextBytes option bounds an oversized tool result via the seam", () => {
    // Marker "«earlier output hidden by byte limit»\n" is ~41 UTF-8 bytes, so
    // the budget must exceed the marker for it to appear in the bounded suffix.
    const huge = "x".repeat(4096);
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [{ type: "text", text: huge }]),
    ];
    const { registerInlineAsset } = capturingRegistrar();

    const events = replayEntriesAsEvents("s1", entries, undefined, {
      registerInlineAsset,
      maxTextBytes: 80,
    });
    const end = toolEnds(events)[0];
    const result = (end.event.data as { result: string }).result;
    // Legacy (no seam) returns the full string.
    const legacy = replayEntriesAsEvents("s1", entries);
    const legacyResult = (toolEnds(legacy)[0].event.data as { result: string }).result;
    expect(legacyResult).toBe(huge);
    // Seam + small budget → bounded suffix with the byte-limit marker.
    expect(result.length).toBeLessThan(huge.length);
    expect(result).toContain("«earlier output hidden by byte limit»");
  });
});
