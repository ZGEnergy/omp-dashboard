/**
 * Tests for the `/api/health.hotWindow` field.
 * See change: bounded-hot-transcript-state (Slice 3, Task 3.2).
 */
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createHotWindowMetrics } from "../hot-window-metrics.js";
import { registerSystemRoutes } from "../routes/system-routes.js";

function makeHealthDeps(hotWindowMetrics?: ReturnType<typeof createHotWindowMetrics>) {
  return {
    sessionManager: { listActive: () => [], listAll: () => [] } as never,
    preferencesStore: { flush: () => {} } as never,
    metaPersistence: { flushAll: () => {} } as never,
    config: { port: 8000, piPort: 9999, dev: false } as never,
    networkGuard: (async () => {}) as never,
    version: "test",
    hotWindowMetrics,
  };
}

describe("GET /api/health — hotWindow", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("defaults to zeroed shape when no hotWindowMetrics provided", async () => {
    app = Fastify({ logger: false });
    registerSystemRoutes(app, makeHealthDeps() as never);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hotWindow).toEqual({
      reports: [],
      highWaterBytes: 0,
      maxMessages: 0,
      maxToolCalls: 0,
      maxSubagents: 0,
      maxInteractiveRequests: 0,
      totalEvictions: 0,
      totalReports: 0,
    });
  });

  it("exposes hot-window high-water marks after ingesting a report", async () => {
    const hotWindowMetrics = createHotWindowMetrics(20);
    hotWindowMetrics.ingest({
      sessionId: "session-1",
      ledgerBytes: 1234,
      ledgerEvents: 10,
      persisterBytes: 0,
      messages: 5,
      toolCalls: 2,
      subagents: 0,
      interactiveRequests: 0,
      detailBytes: 0,
      evictions: 3,
      highWaterBytes: 1234,
      derivationMs: 0,
      hydrationSource: "memory",
    });

    app = Fastify({ logger: false });
    registerSystemRoutes(app, makeHealthDeps(hotWindowMetrics) as never);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hotWindow.highWaterBytes).toBeGreaterThanOrEqual(1234);
    expect(body.hotWindow.reports).toHaveLength(1);
    expect(body.hotWindow.reports[0].sessionId).toBe("session-1");
    expect(typeof body.hotWindow.reports[0].receivedAt).toBe("number");
    expect(body.hotWindow.totalEvictions).toBe(3);
    expect(body.hotWindow.maxMessages).toBe(5);
    expect(body.hotWindow.maxToolCalls).toBe(2);
  });

  it("throwing hotWindowMetrics.snapshot never turns /api/health into a 500", async () => {
    const hotWindowMetrics = {
      ingest: () => {},
      snapshot: () => { throw new Error("boom"); },
    };
    app = Fastify({ logger: false });
    registerSystemRoutes(app, makeHealthDeps(hotWindowMetrics as never) as never);
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.hotWindow).toEqual({
      reports: [],
      highWaterBytes: 0,
      maxMessages: 0,
      maxToolCalls: 0,
      maxSubagents: 0,
      maxInteractiveRequests: 0,
      totalEvictions: 0,
      totalReports: 0,
    });
  });
});
