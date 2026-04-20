/**
 * Canary for createTestServer(): verifies that port:0 end-to-end resolution
 * works and the helper returns non-zero, distinct ports.
 *
 * This test exists to de-risk the integration-test migration (tasks 4.x).
 * If createServer / piGateway ever stop propagating resolved ports, this
 * fails loudly before the other tests are touched.
 */
import { describe, it, expect, afterAll } from "vitest";
import { createTestServer, type TestServerHandle } from "../test-support/test-server.js";

let handle: TestServerHandle | undefined;

describe("createTestServer (port:0 canary)", () => {
  afterAll(async () => {
    if (handle) await handle.stop();
  });

  it("resolves non-zero distinct ports and answers /api/health", async () => {
    handle = await createTestServer();

    expect(handle.httpPort).toBeGreaterThan(0);
    expect(handle.piPort).toBeGreaterThan(0);
    expect(handle.httpPort).not.toBe(handle.piPort);

    const res = await fetch(`http://localhost:${handle.httpPort}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  }, 15000);
});
