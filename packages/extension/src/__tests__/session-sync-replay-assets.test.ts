/**
 * replaySessionEntries — extension asset registration seam
 * (mobile-session-rehydration: shared replay-preparation cutover).
 *
 * Contract: the extension caller hashes/registers legacy inline tool-result
 * images through existing asset machinery and emits each deduped
 * `asset_register` BEFORE the referencing `event_forward`. Prepared events
 * carry bounded `pi-asset:` references, never inline bodies.
 */
import { describe, it, expect } from "vitest";
import { replaySessionEntries } from "../session-sync.js";
import { hashBytes, MAX_PER_IMAGE_BYTES } from "../markdown-image-inliner.js";
import type { BridgeContext } from "../bridge-context.js";

function makeBc(entries: any[], sessionId = "sess-1"): { bc: BridgeContext; sent: any[] } {
  const sent: any[] = [];
  const bc = {
    sessionId,
    cachedCtx: {
      sessionManager: {
        getBranch: () => entries,
      },
    },
    connection: {
      send: (msg: any) => sent.push(msg),
    },
  } as unknown as BridgeContext;
  return { bc, sent };
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

function assistantToolCallEntry(id: string, parentId: string, toolCallId: string, toolName = "screenshot") {
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

function toolResultEntry(
  id: string,
  parentId: string,
  toolCallId: string,
  content: any[],
  isError = false,
) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2026-07-18T00:00:00.000Z",
    message: { role: "toolResult", toolCallId, toolName: "screenshot", content, isError },
  };
}

const PNG_A = Buffer.from("png-bytes-A");
const PNG_B = Buffer.from("png-bytes-B");

describe("replaySessionEntries — asset registration seam", () => {
  it("emits a deduped asset_register before the referencing event_forward", () => {
    const entries = [
      userEntry("u1", "take a shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "text", text: "done" },
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const registers = sent.filter((m) => m.type === "asset_register");
    const forwards = sent.filter((m) => m.type === "event_forward");

    // Exactly one asset_register for the single unique image.
    expect(registers).toHaveLength(1);
    expect(registers[0].sessionId).toBe("sess-1");
    expect(registers[0].hash).toBe(hashBytes(PNG_A));
    expect(registers[0].mimeType).toBe("image/png");
    expect(registers[0].data).toBe(PNG_A.toString("base64"));

    // The asset_register precedes the referencing event_forward.
    const regIdx = sent.indexOf(registers[0]);
    const toolEnd = forwards.find(
      (m) => m.event.eventType === "tool_execution_end",
    );
    expect(toolEnd).toBeDefined();
    const fwdIdx = sent.indexOf(toolEnd);
    expect(regIdx).toBeLessThan(fwdIdx);
  });

  it("removes inline data from the event_forward (bounded pi-asset: reference)", () => {
    const entries = [
      userEntry("u1", "shot"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const toolEnd = sent.find(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(toolEnd).toBeDefined();
    const imgs = toolEnd.event.data.images ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].data).toBeUndefined();
    expect(imgs[0].type).toBe("asset");
    expect(imgs[0].src).toBe(`pi-asset:${hashBytes(PNG_A)}`);
  });

  it("dedupes duplicate assets across multiple tool results to one asset_register", () => {
    // The SAME image bytes appear in two separate tool results. The extension's
    // per-replay dedup set must emit a single asset_register for the shared hash.
    const entries = [
      userEntry("u1", "two shots"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
      assistantToolCallEntry("a2", "r1", "tc2"),
      toolResultEntry("r2", "a2", "tc2", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const registers = sent.filter((m) => m.type === "asset_register");
    expect(registers).toHaveLength(1);
    expect(registers[0].hash).toBe(hashBytes(PNG_A));

    // Both tool_execution_end events reference the SAME registered hash.
    const ends = sent.filter(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(ends).toHaveLength(2);
    for (const e of ends) {
      const imgs = e.event.data.images ?? [];
      expect(imgs).toHaveLength(1);
      expect(imgs[0].src).toBe(`pi-asset:${hashBytes(PNG_A)}`);
    }
  });

  it("distinct images each get their own asset_register", () => {
    const entries = [
      userEntry("u1", "two distinct"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
        { type: "image", data: PNG_B.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const registers = sent.filter((m) => m.type === "asset_register");
    expect(registers).toHaveLength(2);
    expect(new Set(registers.map((r) => r.hash))).toEqual(
      new Set([hashBytes(PNG_A), hashBytes(PNG_B)]),
    );
  });

  it("every asset_register precedes its referencing event_forward", () => {
    const entries = [
      userEntry("u1", "shots"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
      assistantToolCallEntry("a2", "r1", "tc2"),
      toolResultEntry("r2", "a2", "tc2", [
        { type: "image", data: PNG_B.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const registerIndexByHash = new Map<string, number>();
    sent.forEach((message, index) => {
      if (message.type === "asset_register") registerIndexByHash.set(message.hash, index);
    });

    let referenceCount = 0;
    sent.forEach((message, eventIndex) => {
      if (message.type !== "event_forward") return;
      const serialized = JSON.stringify(message.event.data);
      for (const match of serialized.matchAll(/pi-asset:([A-Za-z0-9_-]+)/g)) {
        referenceCount += 1;
        const registerIndex = registerIndexByHash.get(match[1]);
        expect(registerIndex, `missing registration for ${match[1]}`).toBeDefined();
        expect(registerIndex).toBeLessThan(eventIndex);
      }
    });
    expect(referenceCount).toBe(2);
  });

  it("retains a persisted pi-asset reference when matching inline bytes register", () => {
    const persistedReference = `pi-asset:${hashBytes(PNG_A)}`;
    const entries = [
      userEntry("u1", "show the previous screenshot"),
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-07-18T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: `Previously captured: ${persistedReference}` }],
        },
      },
      assistantToolCallEntry("a2", "a1", "tc1"),
      toolResultEntry("r1", "a2", "tc1", [
        { type: "image", data: PNG_A.toString("base64"), mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    const registration = sent.find((m) => m.type === "asset_register");
    expect(registration).toBeDefined();
    expect(registration.hash).toBe(hashBytes(PNG_A));
    const registrationIndex = sent.indexOf(registration);
    const persistedUses = sent.flatMap((message, index) =>
      message.type === "event_forward" && JSON.stringify(message.event.data).includes(persistedReference)
        ? [index]
        : [],
    );
    expect(persistedUses).toHaveLength(3);
    expect(persistedUses.every((index) => index > registrationIndex)).toBe(true);
    expect(JSON.stringify(sent)).toContain(persistedReference);
  });

  it("replaces unrecoverable persisted pi-asset references in every replay frame", () => {
    const entries = [
      userEntry("u1", "show the previous screenshot"),
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: "2026-07-18T00:00:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "The image is pi-asset:deadbeefdeadbeef" }],
        },
      },
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    expect(sent.filter((m) => m.type === "asset_register")).toHaveLength(0);
    const forwards = sent.filter((m) => m.type === "event_forward");
    const unresolved = forwards.filter((m) => JSON.stringify(m.event.data).includes("pi-asset:deadbeefdeadbeef"));
    // An assistant message synthesizes both its content and completion frames;
    // neither may retain a persisted ref after the registry that supplied it is gone.
    expect(unresolved).toEqual([]);
    // Preparation canonicalizes unavailable persisted text references before
    // the extension delivery pass; every synthesized assistant frame must
    // carry the explicit text fallback rather than a stale asset URL.
    expect(forwards.filter((m) => JSON.stringify(m.event.data).includes("[asset unavailable]"))).toHaveLength(2);
  });

  it("malformed cyclic details reach preparation and remain serializable", () => {
    const cyclic: any = { label: "x" };
    cyclic.self = cyclic;
    const result = toolResultEntry("r1", "a1", "tc1", [{ type: "text", text: "done" }]);
    const resultWithDetails = { ...result, message: { ...result.message, details: cyclic } };
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      resultWithDetails,
    ];
    const { bc, sent } = makeBc(entries);

    expect(() => replaySessionEntries(bc)).not.toThrow();
    const ends = sent.filter(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(ends).toHaveLength(1);
    expect(ends[0].event.data.toolCallId).toBe("tc1");
    expect(ends[0].event.data.details.self).toBe("[unavailable: circular reference]");
    expect(() => JSON.stringify(ends[0])).not.toThrow();
  });

  it.each([
    ["invalid alphabet", "not-base64!"],
    ["empty decoded bytes", "===="],
  ])("rejects %s without inline data or asset registration", (_label, data) => {
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data, mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    expect(sent.filter((m) => m.type === "asset_register")).toHaveLength(0);
    const end = sent.find(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(end.event.data.images).toEqual([
      { type: "asset_unavailable", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(end)).not.toContain(data);
  });

  it("rejects decoded images above MAX_PER_IMAGE_BYTES before hash/register/send", () => {
    const oversizedData = Buffer.alloc(MAX_PER_IMAGE_BYTES + 1, 1).toString("base64");
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data: oversizedData, mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    replaySessionEntries(bc);

    expect(sent.filter((m) => m.type === "asset_register")).toHaveLength(0);
    const end = sent.find(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(end.event.data.images).toEqual([
      { type: "asset_unavailable", mimeType: "image/png" },
    ]);
    expect(JSON.stringify(end)).not.toContain(oversizedData);
  });

  it("turns throwing duplicate registrations into explicit unavailable without inline data", () => {
    const data = PNG_A.toString("base64");
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        { type: "image", data, mimeType: "image/png" },
      ]),
      assistantToolCallEntry("a2", "r1", "tc2"),
      toolResultEntry("r2", "a2", "tc2", [
        { type: "image", data, mimeType: "image/png" },
      ]),
    ];
    const { bc, sent } = makeBc(entries);
    let registrationAttempts = 0;
    (bc.connection as any).send = (message: any) => {
      if (message.type === "asset_register") {
        registrationAttempts += 1;
        throw new Error("registration failed");
      }
      sent.push(message);
    };

    replaySessionEntries(bc);

    expect(sent.filter((m) => m.type === "asset_register")).toHaveLength(0);
    expect(registrationAttempts).toBe(2);
    const ends = sent.filter(
      (m) => m.type === "event_forward" && m.event.eventType === "tool_execution_end",
    );
    expect(ends).toHaveLength(2);
    for (const end of ends) {
      expect(end.event.data.images).toEqual([
        { type: "asset_unavailable", mimeType: "image/png" },
      ]);
      expect(JSON.stringify(end)).not.toContain(data);
    }
  });

  it("malformed image block (missing mimeType) is skipped, not registered", () => {
    const entries = [
      userEntry("u1", "go"),
      assistantToolCallEntry("a1", "u1", "tc1"),
      toolResultEntry("r1", "a1", "tc1", [
        // Missing mimeType → not a registerable inline image.
        { type: "image", data: PNG_A.toString("base64") },
      ]),
    ];
    const { bc, sent } = makeBc(entries);

    expect(() => replaySessionEntries(bc)).not.toThrow();
    const registers = sent.filter((m) => m.type === "asset_register");
    expect(registers).toHaveLength(0);
  });

  it("no-op when there are no entries", () => {
    const { bc, sent } = makeBc([]);
    replaySessionEntries(bc);
    expect(sent).toHaveLength(0);
  });

  it("no-op when getBranch throws", () => {
    const bc = {
      sessionId: "sess-1",
      cachedCtx: {
        sessionManager: {
          getBranch: () => {
            throw new Error("boom");
          },
        },
      },
      connection: { send: () => {} },
    } as unknown as BridgeContext;
    expect(() => replaySessionEntries(bc)).not.toThrow();
  });
});
