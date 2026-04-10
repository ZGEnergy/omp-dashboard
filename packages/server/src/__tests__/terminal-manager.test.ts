import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTerminalManager, type TerminalManager } from "../terminal-manager.js";

// Mock node-pty
const mockPtyWrite = vi.fn();
const mockPtyResize = vi.fn();
const mockPtyKill = vi.fn();
let mockOnData: ((data: string) => void) | null = null;
let mockOnExit: ((e: { exitCode: number; signal?: number }) => void) | null = null;

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => ({
    write: mockPtyWrite,
    resize: mockPtyResize,
    kill: mockPtyKill,
    onData: (cb: (data: string) => void) => {
      mockOnData = cb;
      return { dispose: vi.fn() };
    },
    onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => {
      mockOnExit = cb;
      return { dispose: vi.fn() };
    },
    pid: 12345,
  })),
}));

describe("TerminalManager", () => {
  let manager: TerminalManager;
  let exitCallbacks: Array<(termId: string) => void>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnData = null;
    mockOnExit = null;
    exitCallbacks = [];
    manager = createTerminalManager({
      onExit: (termId) => exitCallbacks.forEach((cb) => cb(termId)),
    });
  });

  afterEach(() => {
    // Kill all terminals to clean up
    for (const t of manager.list()) {
      try { manager.kill(t.id); } catch {}
    }
  });

  describe("spawn", () => {
    it("creates a terminal with term- prefix ID", () => {
      const session = manager.spawn("/tmp");
      expect(session.id).toMatch(/^term-/);
      expect(session.cwd).toBe("/tmp");
      expect(session.status).toBe("active");
      expect(session.shell).toBeDefined();
    });

    it("detects shell from env", () => {
      const original = process.env.SHELL;
      process.env.SHELL = "/bin/zsh";
      const session = manager.spawn("/tmp");
      expect(session.shell).toBe("/bin/zsh");
      process.env.SHELL = original;
    });

    it("falls back to /bin/bash when SHELL not set", () => {
      const original = process.env.SHELL;
      delete process.env.SHELL;
      const session = manager.spawn("/tmp");
      expect(session.shell).toBe("/bin/bash");
      process.env.SHELL = original;
    });

    it("spawns node-pty with correct args", async () => {
      const pty = await import("node-pty");
      manager.spawn("/home/user");
      expect(pty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        [],
        expect.objectContaining({
          cwd: "/home/user",
          cols: 80,
          rows: 24,
        }),
      );
    });
  });

  describe("list and get", () => {
    it("lists all active terminals", () => {
      manager.spawn("/tmp/a");
      manager.spawn("/tmp/b");
      expect(manager.list()).toHaveLength(2);
    });

    it("gets a terminal by ID", () => {
      const session = manager.spawn("/tmp");
      expect(manager.get(session.id)).toEqual(session);
    });

    it("returns undefined for unknown ID", () => {
      expect(manager.get("term-nonexistent")).toBeUndefined();
    });
  });

  describe("updateTitle", () => {
    it("updates the title", () => {
      const session = manager.spawn("/tmp");
      manager.updateTitle(session.id, "my title");
      expect(manager.get(session.id)?.title).toBe("my title");
    });
  });

  describe("kill", () => {
    it("sends SIGHUP to PTY (bash on Linux ignores SIGTERM)", () => {
      const session = manager.spawn("/tmp");
      manager.kill(session.id);
      expect(mockPtyKill).toHaveBeenCalledWith("SIGHUP");
    });

    it("throws for unknown ID", () => {
      expect(() => manager.kill("term-unknown")).toThrow();
    });
  });

  describe("attach", () => {
    it("replays buffer contents on attach", () => {
      const session = manager.spawn("/tmp");
      // Simulate PTY output
      mockOnData?.("hello world");

      const mockWs = {
        send: vi.fn(),
        on: vi.fn(),
        readyState: 1,
        OPEN: 1,
      } as any;

      manager.attach(session.id, mockWs);

      // First call should be the replay
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.any(Buffer),
      );
      const sentData = mockWs.send.mock.calls[0][0];
      expect(sentData.toString()).toBe("hello world");
    });

    it("routes binary frames to pty.write", () => {
      const session = manager.spawn("/tmp");
      const handlers: Record<string, Function> = {};

      const mockWs = {
        send: vi.fn(),
        on: vi.fn((event: string, cb: any) => { handlers[event] = cb; }),
        readyState: 1,
        OPEN: 1,
      } as any;

      manager.attach(session.id, mockWs);

      // Simulate binary input from browser
      const input = Buffer.from("ls\n");
      handlers.message(input, true);
      expect(mockPtyWrite).toHaveBeenCalledWith(input.toString());
    });

    it("routes non-JSON text frames to pty.write (AttachAddon sends text)", () => {
      const session = manager.spawn("/tmp");
      const handlers: Record<string, Function> = {};

      const mockWs = {
        send: vi.fn(),
        on: vi.fn((event: string, cb: any) => { handlers[event] = cb; }),
        readyState: 1,
        OPEN: 1,
      } as any;

      manager.attach(session.id, mockWs);

      // AttachAddon sends keystrokes as text frames
      const input = Buffer.from("ls\n");
      handlers.message(input, false);
      expect(mockPtyWrite).toHaveBeenCalledWith("ls\n");
    });

    it("handles resize control message", () => {
      const session = manager.spawn("/tmp");
      const handlers: Record<string, Function> = {};

      const mockWs = {
        send: vi.fn(),
        on: vi.fn((event: string, cb: any) => { handlers[event] = cb; }),
        readyState: 1,
        OPEN: 1,
      } as any;

      manager.attach(session.id, mockWs);

      // Simulate resize control message (text frame)
      const resizeMsg = Buffer.from(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
      handlers.message(resizeMsg, false);
      expect(mockPtyResize).toHaveBeenCalledWith(120, 40);
    });
  });

  describe("PTY exit", () => {
    it("calls onExit callback and removes terminal", () => {
      const cb = vi.fn();
      exitCallbacks.push(cb);

      const session = manager.spawn("/tmp");
      // Simulate PTY exit
      mockOnExit?.({ exitCode: 0 });

      expect(cb).toHaveBeenCalledWith(session.id);
      expect(manager.get(session.id)).toBeUndefined();
    });
  });
});
