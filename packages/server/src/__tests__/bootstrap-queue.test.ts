/**
 * Unit tests for the in-memory bootstrap ticket queue.
 *
 * See change: unified-bootstrap-install.
 */
import { describe, it, expect } from "vitest";
import { createBootstrapQueue } from "../bootstrap-queue.js";

describe("bootstrap-queue", () => {
  it("enqueue returns a unique ticketId + pending result", () => {
    const q = createBootstrapQueue();
    const a = q.enqueue(async () => "A");
    const b = q.enqueue(async () => "B");
    expect(a.ticketId).not.toBe(b.ticketId);
    expect(q.size()).toBe(2);
  });

  it("flushAll runs handlers in enqueue order and resolves results", async () => {
    const q = createBootstrapQueue();
    const order: string[] = [];
    const a = q.enqueue(async () => {
      order.push("a");
      return "A";
    });
    const b = q.enqueue(async () => {
      order.push("b");
      return "B";
    });
    await q.flushAll();
    expect(order).toEqual(["a", "b"]);
    await expect(a.result).resolves.toBe("A");
    await expect(b.result).resolves.toBe("B");
    expect(q.size()).toBe(0);
  });

  it("handler exceptions reject the ticket promise", async () => {
    const q = createBootstrapQueue();
    const t = q.enqueue(async () => {
      throw new Error("boom");
    });
    await q.flushAll();
    await expect(t.result).rejects.toThrow("boom");
  });

  it("onTicketComplete fires success=true for resolved handlers", async () => {
    const q = createBootstrapQueue();
    const events: Array<{ ticketId: string; success: boolean; error?: string }> = [];
    q.onTicketComplete((e) => events.push(e));
    const t = q.enqueue(async () => 42);
    await q.flushAll();
    await t.result;
    expect(events).toEqual([{ ticketId: t.ticketId, success: true }]);
  });

  it("onTicketComplete fires success=false with error message on rejection", async () => {
    const q = createBootstrapQueue();
    const events: Array<{ ticketId: string; success: boolean; error?: string }> = [];
    q.onTicketComplete((e) => events.push(e));
    const t = q.enqueue(async () => {
      throw new Error("oh no");
    });
    await q.flushAll();
    await t.result.catch(() => undefined);
    expect(events).toEqual([
      { ticketId: t.ticketId, success: false, error: "oh no" },
    ]);
  });

  it("onTicketComplete returns an unsubscribe function", async () => {
    const q = createBootstrapQueue();
    const events: unknown[] = [];
    const off = q.onTicketComplete((e) => events.push(e));
    off();
    q.enqueue(async () => "x");
    await q.flushAll();
    expect(events).toEqual([]);
  });

  it("clear drops pending tickets with an error result and broadcasts completion", async () => {
    const q = createBootstrapQueue();
    const events: Array<{ ticketId: string; success: boolean; error?: string }> = [];
    q.onTicketComplete((e) => events.push(e));
    const t = q.enqueue(async () => "never runs");
    q.clear("server shutting down");
    await t.result.catch(() => undefined);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      ticketId: t.ticketId,
      success: false,
      error: "server shutting down",
    });
    expect(q.size()).toBe(0);
  });

  it("multiple listeners all receive the completion event", async () => {
    const q = createBootstrapQueue();
    const a: unknown[] = [];
    const b: unknown[] = [];
    q.onTicketComplete((e) => a.push(e));
    q.onTicketComplete((e) => b.push(e));
    const t = q.enqueue(async () => "ok");
    await q.flushAll();
    await t.result;
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("a listener that throws does not block other listeners", async () => {
    const q = createBootstrapQueue();
    const seen: unknown[] = [];
    q.onTicketComplete(() => {
      throw new Error("listener crash");
    });
    q.onTicketComplete((e) => seen.push(e));
    const t = q.enqueue(async () => "ok");
    await q.flushAll();
    await t.result;
    expect(seen).toHaveLength(1);
  });
});
