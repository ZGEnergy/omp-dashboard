import { describe, it, expect, vi } from "vitest";
import { autoStartServer, type AutoStartDeps } from "../server-auto-start.js";

function makeDeps(overrides: Partial<AutoStartDeps> = {}): AutoStartDeps {
  return {
    isPortOpen: vi.fn().mockResolvedValue(false),
    launchServer: vi.fn().mockResolvedValue({ success: true, message: "Server started" }),
    notify: vi.fn(),
    ...overrides,
  };
}

const baseConfig = { piPort: 9999, port: 8000, autoStart: true };

describe("autoStartServer", () => {
  it("shows success notification when launch succeeds", async () => {
    const deps = makeDeps({
      isPortOpen: vi.fn().mockResolvedValue(false),
      launchServer: vi.fn().mockResolvedValue({ success: true, message: "Server started" }),
    });

    await autoStartServer(baseConfig, deps);

    expect(deps.notify).toHaveBeenCalledWith(
      "🌐 Dashboard started at http://localhost:8000",
      "info",
    );
  });

  it("suppresses warning when launch fails but port is open on re-probe (concurrent launch)", async () => {
    const isPortOpen = vi.fn()
      .mockResolvedValueOnce(false)   // initial probe: not running
      .mockResolvedValueOnce(true);   // re-probe after failure: now running

    const deps = makeDeps({
      isPortOpen,
      launchServer: vi.fn().mockResolvedValue({ success: false, message: "Server process exited immediately" }),
    });

    await autoStartServer(baseConfig, deps);

    expect(deps.notify).not.toHaveBeenCalled();
    expect(isPortOpen).toHaveBeenCalledTimes(2);
  });

  it("shows warning when launch fails and port is still closed on re-probe", async () => {
    const isPortOpen = vi.fn()
      .mockResolvedValueOnce(false)   // initial probe: not running
      .mockResolvedValueOnce(false);  // re-probe: still not running

    const deps = makeDeps({
      isPortOpen,
      launchServer: vi.fn().mockResolvedValue({ success: false, message: "Server process exited immediately" }),
    });

    await autoStartServer(baseConfig, deps);

    expect(deps.notify).toHaveBeenCalledWith(
      "Dashboard server failed to start: Server process exited immediately",
      "warning",
    );
    expect(isPortOpen).toHaveBeenCalledTimes(2);
  });

  it("does nothing when server is already running", async () => {
    const deps = makeDeps({
      isPortOpen: vi.fn().mockResolvedValue(true),
    });

    await autoStartServer(baseConfig, deps);

    expect(deps.launchServer).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it("does nothing when autoStart is disabled", async () => {
    const deps = makeDeps();

    await autoStartServer({ ...baseConfig, autoStart: false }, deps);

    expect(deps.launchServer).not.toHaveBeenCalled();
  });
});
