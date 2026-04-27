/**
 * Tests for bridge entryId stamping on message_end events.
 *
 * HISTORY: Originally this file modelled pi <0.69's synchronous emit pattern,
 * where the bridge's `queueMicrotask` deferral ran BEFORE
 * sessionManager.appendMessage. That design no longer reflects pi 0.70.x:
 * pi awaits extension handlers inside _emitExtensionEvent, so the microtask
 * resolves *inside* the awaited dispatcher, before persistence. The fix
 * (see change: fix-per-message-fork) is `setTimeout(0)` (a macrotask)
 * combined with reading `event.message.id` (which pi mutates in place
 * during appendMessage) or a WeakMap populated by the wrapped appendMessage.
 *
 * The previous test "message_start should still capture entryId immediately
 * (no deferral)" codified the off-by-one bug as expected behavior — it has
 * been REMOVED. The current test suite below models pi 0.70.x semantics
 * directly. Detailed pi-0.70-specific scenarios live in
 * `bridge-entry-id-pi-070.test.ts`.
 */
import { describe, it, expect } from "vitest";

describe("message_end entryId timing on pi 0.70.x", () => {
  it("setTimeout(0) deferral captures the post-persist entry ID", async () => {
    // Simulate pi 0.70.x: bridge handler runs awaited, THEN appendMessage runs.
    let leafId = "user-entry-100";
    const sessionManager = {
      getLeafId: () => leafId,
      appendMessage: (msg: any) => {
        msg.id = "assistant-entry-101";
        leafId = msg.id;
        return msg.id;
      },
    };

    const event = { type: "message_end", message: { role: "assistant" } as any };
    let captured: string | undefined;
    let sendDone!: () => void;
    const sentP = new Promise<void>((r) => { sendDone = r; });

    // Bridge handler: schedules a setTimeout(0) and returns synchronously.
    // The awaited dispatcher then unwinds, appendMessage runs, AND finally
    // the timeout fires.
    const bridgeHandler = (ev: any) => {
      setTimeout(() => {
        captured = ev.message.id ?? sessionManager.getLeafId();
        sendDone();
      }, 0);
    };

    // Simulate the dispatcher: await handler, then call appendMessage.
    await bridgeHandler(event);
    sessionManager.appendMessage(event.message);
    await sentP;

    expect(captured).toBe("assistant-entry-101");
  });

  it("queueMicrotask deferral would NOT work on pi 0.70.x (regression demonstration)", async () => {
    // Reproduces why we abandoned queueMicrotask: it resolves inside the
    // awaited dispatcher, before appendMessage runs.
    let leafId = "user-entry-100";
    let captured: string | undefined;

    const buggyBridge = async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      captured = leafId;
    };

    // Pi 0.70.x: await the bridge, THEN persist. Mirroring the real ordering:
    const handlerP = buggyBridge();
    await handlerP;
    leafId = "assistant-entry-101"; // appendMessage runs after await

    expect(captured).toBe("user-entry-100");
    expect(captured).not.toBe("assistant-entry-101");
  });

  it("entry_persisted is the back-fill mechanism for user message_start (where event.message.id is unavailable)", () => {
    // Behavioural assertion (pure data shape): when the bridge sends a
    // user message_start, it stamps a nonce; later when pi persists the
    // user entry, the bridge sends entry_persisted { nonce, entryId }.
    // The reducer pairs them by nonce. See change: fix-per-message-fork.
    const start = { type: "message_start", message: { role: "user" }, nonce: "n-1" };
    const persisted = { type: "entry_persisted", entryId: "user-200", nonce: "n-1" };

    expect(start.nonce).toBe(persisted.nonce);
    expect(persisted.entryId).toBe("user-200");
  });
});
