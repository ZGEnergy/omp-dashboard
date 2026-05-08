/**
 * Optional JSONL request log for the model proxy.
 *
 * Appends one line per completed request to ~/.pi/dashboard/model-proxy.jsonl.
 * Never logs request/response body or API keys — only metadata.
 * Daily rotation when file exceeds 50MB.
 *
 * See change: add-dashboard-model-proxy.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG_DIR = path.join(os.homedir(), ".pi", "dashboard");
const LOG_FILE = path.join(LOG_DIR, "model-proxy.jsonl");
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export interface RequestLogEntry {
  ts: string;
  requestId: string;
  apiKeyId?: string;
  model: string;
  format: "openai" | "anthropic";
  status: number;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= MAX_SIZE_BYTES) {
      const date = new Date().toISOString().split("T")[0];
      const rotatedPath = `${LOG_FILE}.${date}`;
      fs.renameSync(LOG_FILE, rotatedPath);
    }
  } catch {
    // File doesn't exist or stat failed — no rotation needed
  }
}

export function logRequest(entry: RequestLogEntry): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // Best-effort logging — never crash the server
  }
}
