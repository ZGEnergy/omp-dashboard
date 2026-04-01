import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    default: { ...actual.default, homedir: vi.fn(() => "/home/testuser") },
    homedir: vi.fn(() => "/home/testuser"),
  };
});

import {
  loadZrokEnv,
  detectZrokBinary,
  writeZrokPid,
  readZrokPid,
  removeZrokPid,
  cleanupStaleZrok,
  getTunnelStatus,
  _resetBinaryCache,
  _setBinaryAvailable,
} from "../tunnel.js";

beforeEach(() => {
  vi.mocked(os.homedir).mockReturnValue("/home/testuser");
  _resetBinaryCache();
});

afterEach(() => {
  vi.clearAllMocks();
  _resetBinaryCache();
});

describe("loadZrokEnv", () => {
  it("should return zrok env when enrolled", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        zrok_token: "tok_secret",
        ziti_identity: "env-abc123",
        api_endpoint: "https://api.zrok.io",
      })
    );

    const env = loadZrokEnv();
    expect(env).not.toBeNull();
    expect(env!.apiEndpoint).toBe("https://api.zrok.io");
    expect(env!.envZId).toBe("env-abc123");
    expect(env!.token).toBe("tok_secret");
  });

  it("should return null when not enrolled", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(loadZrokEnv()).toBeNull();
  });

  it("should return null on malformed JSON", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("not valid json{{{");
    expect(loadZrokEnv()).toBeNull();
  });

  it("should return null when required fields are missing", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({ ziti_identity: "test" })
    );
    expect(loadZrokEnv()).toBeNull();
  });
});

describe("detectZrokBinary", () => {
  it("should return true when set available", () => {
    _setBinaryAvailable(true);
    expect(detectZrokBinary()).toBe(true);
  });

  it("should return false when set unavailable", () => {
    _setBinaryAvailable(false);
    expect(detectZrokBinary()).toBe(false);
  });

  it("should cache the result across calls", () => {
    _setBinaryAvailable(true);
    expect(detectZrokBinary()).toBe(true);
    // Value is cached — stays true
    expect(detectZrokBinary()).toBe(true);
  });
});

describe("PID file helpers", () => {
  it("writeZrokPid should write PID to file", () => {
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    writeZrokPid(12345);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("zrok.pid"),
      "12345\n"
    );
  });

  it("readZrokPid should return PID from file", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("12345\n");
    expect(readZrokPid()).toBe(12345);
  });

  it("readZrokPid should return null when file does not exist", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(readZrokPid()).toBeNull();
  });

  it("readZrokPid should return null for invalid content", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("not-a-number\n");
    expect(readZrokPid()).toBeNull();
  });

  it("removeZrokPid should not throw if file does not exist", () => {
    vi.mocked(fs.unlinkSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => removeZrokPid()).not.toThrow();
  });
});

describe("cleanupStaleZrok", () => {
  it("should do nothing when no PID file exists", () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const killSpy = vi.spyOn(process, "kill");

    cleanupStaleZrok();

    expect(killSpy).not.toHaveBeenCalled();
  });

  it("should kill running stale process and remove PID file", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("99999\n");
    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    cleanupStaleZrok();

    expect(killSpy).toHaveBeenCalledWith(99999, 0);
    expect(killSpy).toHaveBeenCalledWith(99999, "SIGTERM");
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it("should just remove PID file if process is not running", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("99999\n");
    const killSpy = vi.spyOn(process, "kill").mockImplementation((_pid: number, signal?: string | number) => {
      if (signal === 0) throw new Error("ESRCH");
      return true;
    });
    vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

    cleanupStaleZrok();

    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(fs.unlinkSync).toHaveBeenCalled();
  });
});

describe("getTunnelStatus", () => {
  it("should return unavailable when binary not available", () => {
    _setBinaryAvailable(false);

    const status = getTunnelStatus();
    expect(status.status).toBe("unavailable");
    expect(status.serverOs).toBe(process.platform);
  });

  it("should return inactive when binary available but no tunnel", () => {
    _setBinaryAvailable(true);

    const status = getTunnelStatus();
    expect(status.status).toBe("inactive");
    expect(status.serverOs).toBe(process.platform);
  });
});
