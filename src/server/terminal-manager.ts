/**
 * Server-side terminal session management with PTY lifecycle and output buffering.
 */
import * as pty from "node-pty";
import type { IPty } from "node-pty";
import { randomBytes } from "node:crypto";
import type { TerminalSession, TerminalControlMessage } from "../shared/terminal-types.js";
import type { WebSocket } from "ws";

const DEFAULT_BUFFER_SIZE = 256 * 1024; // 256KB

/** Circular buffer for PTY output replay. */
export class RingBuffer {
  private buf: Buffer;
  private capacity: number;
  private writePos = 0;
  private filled = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = Buffer.alloc(capacity);
  }

  write(data: Buffer): void {
    const len = data.length;

    if (len >= this.capacity) {
      // Data larger than buffer: keep only the last `capacity` bytes
      data.copy(this.buf, 0, len - this.capacity, len);
      this.writePos = 0;
      this.filled = this.capacity;
      return;
    }

    const spaceToEnd = this.capacity - this.writePos;
    if (len <= spaceToEnd) {
      data.copy(this.buf, this.writePos);
    } else {
      // Wrap around
      data.copy(this.buf, this.writePos, 0, spaceToEnd);
      data.copy(this.buf, 0, spaceToEnd);
    }

    this.writePos = (this.writePos + len) % this.capacity;
    this.filled = Math.min(this.filled + len, this.capacity);
  }

  contents(): Buffer {
    if (this.filled === 0) return Buffer.alloc(0);

    if (this.filled < this.capacity) {
      // Haven't wrapped yet
      return Buffer.from(this.buf.subarray(0, this.filled));
    }

    // Wrapped: readPos is at writePos (oldest data)
    const result = Buffer.alloc(this.capacity);
    const readPos = this.writePos; // oldest byte is at writePos after wrap
    const tailLen = this.capacity - readPos;
    this.buf.copy(result, 0, readPos, readPos + tailLen);
    this.buf.copy(result, tailLen, 0, readPos);
    return result;
  }
}

interface TerminalEntry {
  session: TerminalSession;
  pty: IPty;
  buffer: RingBuffer;
  clients: Set<WebSocket>;
}

export interface TerminalManagerOptions {
  onExit?: (terminalId: string) => void;
  bufferSize?: number;
}

export interface TerminalManager {
  spawn(cwd: string): TerminalSession;
  attach(id: string, ws: WebSocket): void;
  detach(id: string, ws: WebSocket): void;
  kill(id: string): void;
  get(id: string): TerminalSession | undefined;
  list(): TerminalSession[];
  updateTitle(id: string, title: string): void;
}

function generateId(): string {
  return "term-" + randomBytes(8).toString("hex");
}

export function createTerminalManager(options?: TerminalManagerOptions): TerminalManager {
  const entries = new Map<string, TerminalEntry>();
  const bufferSize = options?.bufferSize ?? DEFAULT_BUFFER_SIZE;

  function spawn(cwd: string): TerminalSession {
    const shell = process.env.SHELL || "/bin/bash";
    const id = generateId();

    const p = pty.spawn(shell, [], {
      cwd,
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });

    const session: TerminalSession = {
      id,
      cwd,
      shell,
      status: "active",
      createdAt: Date.now(),
    };

    const buffer = new RingBuffer(bufferSize);
    const clients = new Set<WebSocket>();

    const entry: TerminalEntry = { session, pty: p, buffer, clients };
    entries.set(id, entry);

    p.onData((data: string) => {
      const buf = Buffer.from(data);
      buffer.write(buf);
      for (const ws of clients) {
        if (ws.readyState === ws.OPEN) {
          ws.send(buf);
        }
      }
    });

    p.onExit(() => {
      entry.session = { ...entry.session, status: "ended" };
      // Close all client WebSockets
      for (const ws of clients) {
        try { ws.close(); } catch {}
      }
      clients.clear();
      entries.delete(id);
      options?.onExit?.(id);
    });

    return session;
  }

  function attach(id: string, ws: WebSocket): void {
    const entry = entries.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);

    // Replay buffered output
    const replay = entry.buffer.contents();
    if (replay.length > 0) {
      ws.send(replay);
    }

    entry.clients.add(ws);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Terminal input
        entry.pty.write(data.toString());
      } else {
        // Control message (text frame)
        try {
          const msg: TerminalControlMessage = JSON.parse(data.toString());
          if (msg.type === "resize") {
            entry.pty.resize(msg.cols, msg.rows);
          }
        } catch {
          // Ignore malformed control messages
        }
      }
    });

    ws.on("close", () => {
      entry.clients.delete(ws);
    });
  }

  function detach(id: string, ws: WebSocket): void {
    const entry = entries.get(id);
    if (entry) {
      entry.clients.delete(ws);
    }
  }

  function kill(id: string): void {
    const entry = entries.get(id);
    if (!entry) throw new Error(`Terminal ${id} not found`);
    entry.pty.kill("SIGTERM");
    // onExit handler will do cleanup
  }

  function get(id: string): TerminalSession | undefined {
    return entries.get(id)?.session;
  }

  function list(): TerminalSession[] {
    return Array.from(entries.values()).map((e) => e.session);
  }

  function updateTitle(id: string, title: string): void {
    const entry = entries.get(id);
    if (entry) {
      entry.session = { ...entry.session, title };
    }
  }

  return { spawn, attach, detach, kill, get, list, updateTitle };
}
