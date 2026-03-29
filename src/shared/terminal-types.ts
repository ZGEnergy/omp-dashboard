/**
 * Shared types for the terminal emulator feature.
 */

export interface TerminalSession {
  id: string;
  cwd: string;
  shell: string;
  status: "active" | "ended";
  title?: string;
  manuallyRenamed?: boolean;
  createdAt: number;
}

/** Control messages sent as text frames on the terminal WebSocket. */
export type TerminalControlMessage =
  | { type: "resize"; cols: number; rows: number }
  | { type: "title"; title: string };
