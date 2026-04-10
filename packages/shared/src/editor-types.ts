/**
 * Shared types for the browser-based editor (code-server) feature.
 */

export type EditorInstanceStatus = "starting" | "ready" | "stopped";

export interface EditorInstance {
  id: string;
  cwd: string;
  port: number;
  status: EditorInstanceStatus;
  proxyPath: string;
}

export interface EditorDetectionResult {
  available: boolean;
  binary?: string;
}
