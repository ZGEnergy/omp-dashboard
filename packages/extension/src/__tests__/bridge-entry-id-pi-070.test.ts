/**
 * Tests for the bridge entryId stamping under pi 0.70.x's emit-then-await-then-append
 * ordering. Pi 0.70.x's _processAgentEvent does (paraphrased):
 *
 *   await this._emitExtensionEvent(event);       // <-- bridge runs here, awaited
 *   this._emit(event);                           // sync legacy listeners
 *   if (event.type === "message_end") {
 *     sessionManager.appendMessage(event.message); // <-- entry id GENERATED HERE
 *   }
 *
 * The bridge's old `queueMicrotask` deferral resolves INSIDE the awaited dispatcher,
 * before appendMessage runs — so getLeafId() still returns the previous leaf. The fix
 * is `setTimeout(0)` (macrotask) so the entire await chain unwinds and appendMessage
 * runs first; OR reading `event.message.id` after pi mutates it in-place.
 *
 * This test simulates that ordering and asserts the correct mechanisms.
 */
import { describe, it, expect } from "vitest";

interface SimMessage {
  role: string;
  content: string;
  id?: string;
}

/**
 * Simulate pi 0.70.x's _processAgentEvent ordering. Returns a promise that
 * resolves when the entire event has been processed (including appendMessage).
 *
 * The `bridgeHandler` is registered as an "extension handler" — runs awaited
 * inside _emitExtensionEvent. It receives the event and a pseudo-ctx with
 * sessionManager.getLeafId().
 */
async function simulatePi070Emit(opts: {
  event: { type: string; message: SimMessage };
  state: { leafId: string; nextId: string };
  appendMessage: (msg: SimMessage) => string; // returns the new id
  bridgeHandler: (event: any, ctx: any) => Promise<void> | void;
}): Promise<void> {
  const ctx = {
    sessionManager: { getLeafId: () => opts.state.leafId },
  };

  // Step 1: await _emitExtensionEvent — runs the bridge handler awaited.
  await opts.bridgeHandler(opts.event, ctx);

  // Step 2: _emit (sync legacy listeners) — no-op in this simulation.

  // Step 3: persistence on message_end.
  if (opts.event.type === "message_end") {
    const id = opts.appendMessage(opts.event.message);
    opts.state.leafId = id;
  }
}

describe("pi 0.70 emit/append ordering", () => {
  it("queueMicrotask deferral DOES NOT capture the post-persist id (the bug)", async () => {
    const state = { leafId: "prev", nextId: "new-id-42" };
    let captured: string | undefined;

    const buggyBridge = async (event: any, ctx: any) => {
      // What the OLD bridge does today:
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      captured = ctx.sessionManager.getLeafId();
    };

    await simulatePi070Emit({
      event: { type: "message_end", message: { role: "assistant", content: "hi" } },
      state,
      appendMessage: (m) => {
        m.id = state.nextId;
        return state.nextId;
      },
      bridgeHandler: buggyBridge,
    });

    // Bug: captured is the previous leaf, NOT the just-appended id.
    expect(captured).toBe("prev");
    expect(captured).not.toBe("new-id-42");
  });

  it("setTimeout(0) deferral DOES capture the post-persist id (the fix)", async () => {
    const state = { leafId: "prev", nextId: "new-id-42" };
    let capturedFromGetLeafId: string | undefined;
    let capturedFromMessageId: string | undefined;
    let sendDone!: () => void;
    const sendCompleted = new Promise<void>((r) => { sendDone = r; });

    // The bridge schedules and returns synchronously — the only way the
    // awaited dispatcher can unwind so appendMessage runs before the timeout.
    const fixedBridge = (event: any, ctx: any) => {
      setTimeout(() => {
        capturedFromMessageId = (event.message as any).id;
        capturedFromGetLeafId = ctx.sessionManager.getLeafId();
        sendDone();
      }, 0);
    };

    await simulatePi070Emit({
      event: { type: "message_end", message: { role: "assistant", content: "hi" } },
      state,
      appendMessage: (m) => {
        m.id = state.nextId;
        return state.nextId;
      },
      bridgeHandler: fixedBridge,
    });
    await sendCompleted;

    // Both signals should now point at the just-persisted entry.
    expect(capturedFromMessageId).toBe("new-id-42");
    expect(capturedFromGetLeafId).toBe("new-id-42");
  });

  it("WeakMap-on-appendMessage captures the id even before the macrotask", async () => {
    const state = { leafId: "prev", nextId: "new-id-77" };
    const idByMessage = new WeakMap<object, string>();
    const wrappedAppend = (m: SimMessage): string => {
      m.id = state.nextId;
      idByMessage.set(m as object, m.id);
      return m.id;
    };

    let viaWeakMap: string | undefined;
    let viaMutation: string | undefined;
    let sendDone!: () => void;
    const sentP = new Promise<void>((r) => { sendDone = r; });

    // CRITICAL: bridge SCHEDULES the send and RETURNS IMMEDIATELY.
    // It does NOT await its own setTimeout — that would keep the
    // outer dispatcher awaiting and we'd be back to the queueMicrotask
    // bug (timeout fires before appendMessage).
    const fixedBridge = (event: any) => {
      setTimeout(() => {
        viaMutation = (event.message as any).id;
        viaWeakMap = idByMessage.get(event.message as object);
        sendDone();
      }, 0);
      // Return synchronously — let the awaited dispatcher unwind.
    };

    await simulatePi070Emit({
      event: { type: "message_end", message: { role: "assistant", content: "hi" } },
      state,
      appendMessage: wrappedAppend,
      bridgeHandler: fixedBridge,
    });
    await sentP;

    expect(viaMutation).toBe("new-id-77");
    expect(viaWeakMap).toBe("new-id-77");
  });

  it("user message_start has NO id (pi defers user persistence to message_end)", async () => {
    const state = { leafId: "prev-assistant", nextId: "new-user-id" };
    let captured: string | undefined;

    const fixedBridge = async (event: any) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      captured = (event.message as any).id; // still undefined for message_start
    };

    await simulatePi070Emit({
      event: { type: "message_start", message: { role: "user", content: "hello" } },
      state,
      appendMessage: () => state.nextId, // not called for message_start
      bridgeHandler: fixedBridge,
    });

    // No id available at message_start time — must rely on entry_persisted
    // back-fill (delivered when the message_end of the SAME message fires later).
    expect(captured).toBeUndefined();
  });
});
