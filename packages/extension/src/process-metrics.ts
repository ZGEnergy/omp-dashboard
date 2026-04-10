/**
 * Lightweight process metrics collector for bridge heartbeats.
 * Uses Node.js built-in APIs — no external dependencies.
 */
import os from "node:os";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import type { ProcessMetrics } from "@blackbelt-technology/pi-dashboard-shared/protocol.js";

const ELD_RESOLUTION_MS = 20;

let lastCpuUsage: NodeJS.CpuUsage | undefined;
let lastCpuTime: number | undefined;
let eld: IntervalHistogram | undefined;

/** Start event loop delay monitoring. Call once at init. */
export function startMetricsMonitor(): void {
  if (eld) return; // already started
  try {
    eld = monitorEventLoopDelay({ resolution: ELD_RESOLUTION_MS });
    eld.enable();
  } catch {
    // monitorEventLoopDelay not available in older Node versions
  }
}

/** Stop event loop delay monitoring. */
export function stopMetricsMonitor(): void {
  if (eld) {
    eld.disable();
    eld = undefined;
  }
}

/** Collect current process metrics and reset deltas. */
export function collectMetrics(): ProcessMetrics {
  const mem = process.memoryUsage();

  // CPU percent since last call
  const now = Date.now();
  const cpuNow = process.cpuUsage();
  let cpuPercent = 0;
  if (lastCpuUsage && lastCpuTime) {
    const elapsedMs = now - lastCpuTime;
    if (elapsedMs > 0) {
      const userDelta = cpuNow.user - lastCpuUsage.user;   // microseconds
      const systemDelta = cpuNow.system - lastCpuUsage.system;
      // Total CPU microseconds / elapsed wall-clock microseconds * 100
      cpuPercent = ((userDelta + systemDelta) / (elapsedMs * 1000)) * 100;
    }
  }
  lastCpuUsage = cpuNow;
  lastCpuTime = now;

  // Event loop max delay since last reset
  let eventLoopMaxMs: number | undefined;
  if (eld) {
    // max is in nanoseconds
    eventLoopMaxMs = Math.round(eld.max / 1_000_000);
    eld.reset();
  }

  return {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    eventLoopMaxMs,
    loadAvg1m: Math.round(os.loadavg()[0] * 100) / 100,
  };
}
