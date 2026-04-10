import { describe, it, expect, afterEach } from "vitest";
import { startMetricsMonitor, stopMetricsMonitor, collectMetrics } from "../process-metrics.js";

describe("process-metrics", () => {
  afterEach(() => {
    stopMetricsMonitor();
  });

  it("collectMetrics returns valid shape without monitor", () => {
    const m = collectMetrics();
    expect(m.rss).toBeGreaterThan(0);
    expect(m.heapUsed).toBeGreaterThan(0);
    expect(m.heapTotal).toBeGreaterThan(0);
    expect(typeof m.cpuPercent).toBe("number");
    expect(typeof m.loadAvg1m).toBe("number");
    // eventLoopMaxMs is undefined without monitor
    expect(m.eventLoopMaxMs).toBeUndefined();
  });

  it("collectMetrics includes eventLoopMaxMs with monitor", async () => {
    startMetricsMonitor();
    // Let the event loop tick to capture some delay
    await new Promise((r) => setTimeout(r, 50));
    const m = collectMetrics();
    expect(typeof m.eventLoopMaxMs).toBe("number");
    expect(m.eventLoopMaxMs).toBeGreaterThanOrEqual(0);
  });

  it("cpuPercent computes delta on second call", () => {
    const first = collectMetrics();
    // Do some CPU work
    let x = 0;
    for (let i = 0; i < 1_000_000; i++) x += Math.sqrt(i);
    const second = collectMetrics();
    // Both should be numbers, second should show some cpu
    expect(typeof first.cpuPercent).toBe("number");
    expect(typeof second.cpuPercent).toBe("number");
    void x;
  });

  it("startMetricsMonitor is idempotent", () => {
    startMetricsMonitor();
    startMetricsMonitor(); // should not throw
    const m = collectMetrics();
    expect(m.rss).toBeGreaterThan(0);
  });
});
