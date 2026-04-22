import { describe, it, expect } from "vitest";
import { createSemaphore } from "../semaphore.js";

function defer<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: any) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("createSemaphore", () => {
  it("throws when max < 1", () => {
    expect(() => createSemaphore(0)).toThrow();
    expect(() => createSemaphore(-1)).toThrow();
  });

  it("runs tasks immediately up to the cap", async () => {
    const sem = createSemaphore(2);
    const a = defer<string>();
    const b = defer<string>();
    const pa = sem.run(() => a.promise);
    const pb = sem.run(() => b.promise);
    expect(sem.size()).toBe(2);
    a.resolve("a");
    b.resolve("b");
    expect(await pa).toBe("a");
    expect(await pb).toBe("b");
    expect(sem.size()).toBe(0);
  });

  it("caps concurrency: third task waits", async () => {
    const sem = createSemaphore(2);
    const a = defer<string>();
    const b = defer<string>();
    const c = defer<string>();

    let cStarted = false;
    const pa = sem.run(() => a.promise);
    const pb = sem.run(() => b.promise);
    const pc = sem.run(() => { cStarted = true; return c.promise; });

    // Wait a microtask for queue placement
    await Promise.resolve();
    expect(cStarted).toBe(false);
    expect(sem.size()).toBe(3); // active + queued

    a.resolve("a");
    await pa;
    // c should now be started
    await Promise.resolve();
    expect(cStarted).toBe(true);
    b.resolve("b");
    c.resolve("c");
    expect(await pb).toBe("b");
    expect(await pc).toBe("c");
  });

  it("FIFO order of queued tasks", async () => {
    const sem = createSemaphore(1);
    const order: string[] = [];
    const blockers = [defer<void>(), defer<void>(), defer<void>()];
    const ps = blockers.map((d, i) =>
      sem.run(async () => { order.push(`start-${i}`); await d.promise; order.push(`end-${i}`); }),
    );
    await Promise.resolve();
    blockers[0].resolve(); await ps[0];
    blockers[1].resolve(); await ps[1];
    blockers[2].resolve(); await ps[2];
    expect(order).toEqual(["start-0", "end-0", "start-1", "end-1", "start-2", "end-2"]);
  });

  it("releases slot on reject so queued tasks still run", async () => {
    const sem = createSemaphore(1);
    const failed = sem.run(async () => { throw new Error("boom"); });
    await expect(failed).rejects.toThrow("boom");
    const ok = sem.run(async () => "ok");
    expect(await ok).toBe("ok");
  });

  it("setMax increases cap and drains queued tasks immediately", async () => {
    const sem = createSemaphore(1);
    const a = defer<void>();
    const b = defer<void>();
    let bStarted = false;
    const pa = sem.run(() => a.promise);
    const pb = sem.run(() => { bStarted = true; return b.promise; });
    await Promise.resolve();
    expect(bStarted).toBe(false);

    sem.setMax(2);
    await Promise.resolve();
    expect(bStarted).toBe(true);

    a.resolve(); b.resolve();
    await pa; await pb;
  });

  it("setMax shrinking does not interrupt in-flight tasks but caps new ones", async () => {
    const sem = createSemaphore(3);
    const a = defer<void>();
    const b = defer<void>();
    const pa = sem.run(() => a.promise);
    const pb = sem.run(() => b.promise);

    sem.setMax(1);
    const c = defer<void>();
    let cStarted = false;
    const pc = sem.run(() => { cStarted = true; return c.promise; });
    await Promise.resolve();
    expect(cStarted).toBe(false);

    a.resolve(); b.resolve();
    await pa; await pb;
    await Promise.resolve();
    expect(cStarted).toBe(true);
    c.resolve();
    await pc;
  });
});
