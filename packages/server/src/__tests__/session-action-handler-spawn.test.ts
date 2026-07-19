/**
 * Tests for handleSpawnSession — preflight gate, watchdog arming, failure log.
 * See change: spawn-failure-diagnostics.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

// Mock everything the handler depends on.
vi.mock("../spawn-preflight.js", () => ({
  preflightSpawn: vi.fn().mockReturnValue({ ok: true, reasons: [] }),
}));

vi.mock("../spawn-register-watchdog.js", () => ({
  getSpawnRegisterWatchdog: vi.fn().mockReturnValue({
    arm: vi.fn(),
  }),
}));

vi.mock("../spawn-failure-log.js", () => ({
  appendSpawnFailure: vi.fn(),
}));

vi.mock("../process-manager.js", () => ({
  spawnPiSession: vi.fn(),
}));

vi.mock("@blackbelt-technology/pi-dashboard-shared/config.js", () => ({
  clampSpawnRegisterTimeoutMs: vi.fn((timeoutMs: number) => timeoutMs),
  loadConfig: vi.fn().mockReturnValue({
    spawnStrategy: "headless",
    spawnRegisterTimeoutMs: 30000,
  }),
}));

vi.mock("@blackbelt-technology/pi-dashboard-shared/platform/binary-lookup.js", () => ({
  ToolResolver: function MockToolResolver() {
    return {
      resolvePi: vi.fn().mockReturnValue(["pi"]),
      resolveNode: vi.fn().mockReturnValue("/usr/bin/node"),
    };
  },
}));

import { handleSpawnSession } from "../browser-handlers/session-action-handler.js";
import { spawnPiSession } from "../process-manager.js";
import { appendSpawnFailure } from "../spawn-failure-log.js";
import { preflightSpawn } from "../spawn-preflight.js";
import { getSpawnRegisterWatchdog } from "../spawn-register-watchdog.js";

const mockSpawnPiSession = vi.mocked(spawnPiSession);
const mockPreflightSpawn = vi.mocked(preflightSpawn);
const mockAppendSpawnFailure = vi.mocked(appendSpawnFailure);

function makeCtx() {
  const messages: unknown[] = [];
  const ws = {
    readyState: WebSocket.OPEN,
    send: vi.fn((data: string) => messages.push(JSON.parse(data))),
  } as unknown as WebSocket;

  const sendTo = vi.fn((_ws: WebSocket, msg: unknown) => messages.push(msg));

  return {
    ws,
    messages,
    sendTo,
    headlessPidRegistry: { register: vi.fn() } as never,
    pendingDashboardSpawns: new Map(),
    pendingAttachRegistry: { enqueue: vi.fn() } as never,
    pendingAdvisorRegistry: { reserve: vi.fn(), arm: vi.fn(), discard: vi.fn(), has: vi.fn(), consume: vi.fn(), dispose: vi.fn(), size: vi.fn() },
    sessionManager: {} as never,
    broadcast: vi.fn() as never,
    piGateway: {} as never,
  };
}

describe("handleSpawnSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preflight failure sends spawn_error with PREFLIGHT_FAILED", async () => {
    mockPreflightSpawn.mockReturnValue({
      ok: false,
      reasons: [{ code: "PI_NOT_FOUND", message: "pi not found" }],
    });

    const ctx = makeCtx();
    await handleSpawnSession({ type: "spawn_session", cwd: "/p/x" } as never, ctx as never);

    expect(mockSpawnPiSession).not.toHaveBeenCalled();
    const errorMsg = ctx.messages.find((m: any) => m.type === "spawn_error") as any;
    expect(errorMsg).toBeDefined();
    expect(errorMsg.code).toBe("PREFLIGHT_FAILED");
    expect(mockAppendSpawnFailure).toHaveBeenCalledWith(expect.objectContaining({ code: "PREFLIGHT_FAILED" }));
  });

  it("successful headless spawn arms watchdog with pid", async () => {
    mockPreflightSpawn.mockReturnValue({ ok: true, reasons: [] });
    mockSpawnPiSession.mockResolvedValue({
      success: true,
      pid: 123,
      process: {} as never,
      dashboardSpawned: true,
      message: "spawned",
      logPath: "/tmp/pi-spawn.log",
    });

    const watchdog = { arm: vi.fn() };
    vi.mocked(getSpawnRegisterWatchdog).mockReturnValue(watchdog as never);

    const ctx = makeCtx();
    await handleSpawnSession({ type: "spawn_session", cwd: "/p/x" } as never, ctx as never);

    expect(watchdog.arm).toHaveBeenCalledWith(expect.objectContaining({
      pid: 123,
      cwd: "/p/x",
      logPath: "/tmp/pi-spawn.log",
    }));
  });

  it("failed spawn forwards code and appends log", async () => {
    mockPreflightSpawn.mockReturnValue({ ok: true, reasons: [] });
    mockSpawnPiSession.mockResolvedValue({
      success: false,
      code: "PI_CRASHED" as never,
      message: "crashed",
      stderr: "error output",
    });

    const ctx = makeCtx();
    await handleSpawnSession({ type: "spawn_session", cwd: "/p/x" } as never, ctx as never);

    const errorMsg = ctx.messages.find((m: any) => m.type === "spawn_error") as any;
    expect(errorMsg.code).toBe("PI_CRASHED");
    expect(errorMsg.stderr).toBe("error output");
    expect(mockAppendSpawnFailure).toHaveBeenCalledWith(expect.objectContaining({
      code: "PI_CRASHED",
      stderrTail: "error output",
    }));
  });

  it("thrown exception appends SPAWN_ERRNO entry", async () => {
    mockPreflightSpawn.mockReturnValue({ ok: true, reasons: [] });
    mockSpawnPiSession.mockRejectedValue(new Error("ENOENT"));

    const ctx = makeCtx();
    await handleSpawnSession({ type: "spawn_session", cwd: "/p/x" } as never, ctx as never);

    expect(mockAppendSpawnFailure).toHaveBeenCalledWith(expect.objectContaining({ code: "SPAWN_ERRNO" }));
  });

  it("passes advisor through and arms only a successful true spawn token", async () => {
    mockPreflightSpawn.mockReturnValue({ ok: true, reasons: [] });
    const watchdog = { arm: vi.fn() };
    vi.mocked(getSpawnRegisterWatchdog).mockReturnValue(watchdog as never);
    mockSpawnPiSession.mockImplementationOnce(async (_cwd, options) => ({
      success: true,
      spawnToken: options?.spawnToken,
      message: "spawned",
    }));

    const ctx = makeCtx();
    await handleSpawnSession(
      { type: "spawn_session", cwd: "/p/x", advisor: true } as never,
      ctx as never,
    );

    expect(mockSpawnPiSession).toHaveBeenCalledWith("/p/x", expect.objectContaining({ advisor: true }));
    const spawnOptions = mockSpawnPiSession.mock.calls[0]?.[1];
    expect(spawnOptions?.spawnToken).toBeTypeOf("string");
    expect(ctx.pendingAdvisorRegistry.reserve).toHaveBeenCalledWith(spawnOptions?.spawnToken);
    expect(ctx.pendingAdvisorRegistry.arm).toHaveBeenCalledWith(spawnOptions?.spawnToken, 30_000);
    expect(watchdog.arm).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 30_000 }));
  });

  it("does not arm advisor proof for false, absent, or failed spawns", async () => {
    mockPreflightSpawn.mockReturnValue({ ok: true, reasons: [] });
    mockSpawnPiSession
      .mockResolvedValueOnce({ success: true, spawnToken: "false-token", message: "spawned" })
      .mockResolvedValueOnce({ success: true, spawnToken: "absent-token", message: "spawned" })
      .mockResolvedValueOnce({ success: false, spawnToken: "failed-token", message: "failed" });

    const ctx = makeCtx();
    await handleSpawnSession(
      { type: "spawn_session", cwd: "/p/x", advisor: false } as never,
      ctx as never,
    );
    await handleSpawnSession({ type: "spawn_session", cwd: "/p/x" } as never, ctx as never);
    await handleSpawnSession(
      { type: "spawn_session", cwd: "/p/x", advisor: true } as never,
      ctx as never,
    );

    const failedSpawnOptions = mockSpawnPiSession.mock.calls[2]?.[1];
    expect(ctx.pendingAdvisorRegistry.reserve).toHaveBeenCalledTimes(1);
    expect(ctx.pendingAdvisorRegistry.discard).toHaveBeenCalledWith(failedSpawnOptions?.spawnToken);
    expect(ctx.pendingAdvisorRegistry.arm).not.toHaveBeenCalled();
  });
});
