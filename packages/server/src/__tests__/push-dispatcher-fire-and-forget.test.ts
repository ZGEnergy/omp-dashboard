/** Behavioral regression test for non-blocking push dispatch. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPushDispatcher } from "../push/push-dispatcher.js";
import { createPushTokenRegistry } from "../push/push-token-registry.js";
import type { PushTransport } from "../push/push-transports/types.js";

describe("push dispatcher fire-and-forget behavior", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it("returns immediately while a transport send remains pending", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "push-dispatcher-faf-"));
    const registry = createPushTokenRegistry({ path: path.join(tempDir, "push-tokens.json") });
    registry.add({ deviceToken: "dev-hang", transport: "web-push" });

    let sendStarted = false;
    let sendResolved = false;
    const hangingTransport: PushTransport = {
      kind: "web-push",
      send: () => {
        sendStarted = true;
        return new Promise(() => {
          /* intentionally never settles */
        }).then(() => {
          sendResolved = true;
          return { ok: true };
        });
      },
    };

    const dispatcher = createPushDispatcher({
      registry,
      transports: { "web-push": hangingTransport },
      coalesceWindowMs: 30_000,
      getSession: () =>
        ({
          id: "session-1",
          cwd: "/tmp",
          source: "cli",
          status: "idle",
          startedAt: 0,
          name: "worker",
        }) as any,
    });

    const startedAt = Date.now();
    expect(dispatcher.fanout("session-1", { eventType: "agent_end", timestamp: 0, data: {} })).toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(50);
    expect(sendStarted).toBe(true);
    expect(sendResolved).toBe(false);
    dispatcher.shutdown();
  });
});
