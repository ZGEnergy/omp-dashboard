/**
 * Handles server→extension messages by dispatching to pi API.
 */
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type {
  ServerToExtensionMessage,
  ExtensionToServerMessage,
} from "../shared/protocol.js";
import type { FileEntry, PiSessionInfo, DashboardEvent } from "../shared/types.js";
import { replayEntriesAsEvents } from "./state-replay.js";

/** Escape regex special characters for fd pattern */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Search files using fd */
function searchFiles(cwd: string, query: string): FileEntry[] {
  const args = [
    "--base-directory", cwd,
    "--max-results", "20",
    "--type", "f",
    "--type", "d",
    "--full-path",
    "--hidden",
    "--exclude", ".git",
  ];

  if (query) {
    args.push(escapeRegex(query));
  }

  try {
    const result = spawnSync("fd", args, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000,
    });

    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    return result.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const normalized = line.replace(/\\/g, "/");
      const isDirectory = normalized.endsWith("/");
      return { path: normalized, isDirectory };
    });
  } catch {
    return [];
  }
}

export interface CommandHandler {
  handle(msg: ServerToExtensionMessage): ExtensionToServerMessage | undefined | Promise<ExtensionToServerMessage | undefined>;
}

export function createCommandHandler(
  pi: ExtensionAPI,
  sessionIdOrGetter: string | (() => string),
  options?: {
    getModelRegistry?: () => any;
    setThinkingLevel?: (level: string) => void;
    getThinkingLevel?: () => string | undefined;
    shutdown?: () => void;
    abort?: () => void;
    getCwd?: () => string;
  },
): CommandHandler {
  const getSessionId = typeof sessionIdOrGetter === "function" ? sessionIdOrGetter : () => sessionIdOrGetter;
  return {
    async handle(msg: ServerToExtensionMessage): Promise<ExtensionToServerMessage | undefined> {
      const sessionId = getSessionId();

      // load_session_events is workspace-scoped, not session-scoped
      if (msg.type === "load_session_events") {
        return handleLoadSessionEvents(msg.sessionId, msg.sessionFile);
      }

      // Ignore messages for other sessions
      if (msg.sessionId !== sessionId) {
        console.error(`[dashboard] Ignoring message type=${msg.type} for session ${msg.sessionId}, current session is ${sessionId}`);
        return undefined;
      }

      switch (msg.type) {
        case "send_prompt":
          if (msg.images && msg.images.length > 0) {
            const validMimeTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
            const validImages = msg.images.filter((img) => {
              if (!img || typeof img !== "object") {
                console.error("[dashboard] Dropping non-object image entry");
                return false;
              }
              if (!img.mimeType || typeof img.mimeType !== "string" || !validMimeTypes.has(img.mimeType)) {
                console.error(`[dashboard] Dropping image with invalid mimeType: "${img.mimeType}" (type: ${typeof img.mimeType})`);
                return false;
              }
              if (!img.data || typeof img.data !== "string") {
                console.error(`[dashboard] Dropping image with invalid data (type: ${typeof img.data}, length: ${img.data?.length ?? 0})`);
                return false;
              }
              return true;
            });
            if (validImages.length > 0) {
              const content = [
                { type: "text" as const, text: msg.text },
                ...validImages.map((img) => ({
                  type: "image" as const,
                  data: img.data,
                  mimeType: img.mimeType,
                })),
              ];
              console.error(`[dashboard] Sending message with ${validImages.length} image(s), mimeTypes: ${validImages.map(i => i.mimeType).join(", ")}`);
              pi.sendUserMessage(content);
            } else {
              pi.sendUserMessage(msg.text);
            }
          } else {
            pi.sendUserMessage(msg.text);
          }
          return undefined;

        case "abort":
          if (options?.abort) {
            options.abort();
          }
          return undefined;

        case "request_commands": {
          const commands = pi.getCommands();
          return {
            type: "commands_list",
            sessionId,
            commands,
          };
        }

        case "list_files": {
          const files = searchFiles(process.cwd(), msg.query);
          return {
            type: "files_list",
            sessionId,
            query: msg.query,
            files,
          };
        }

        case "openspec_refresh":
          // Handled by bridge.ts onMessage to update lastOpenSpecJson cache
          return undefined;

        case "rename_session":
          pi.setSessionName(msg.name);
          return {
            type: "session_name_update",
            sessionId,
            name: msg.name,
          };

        case "request_models": {
          const registry = options?.getModelRegistry?.();
          if (registry) {
            try {
              registry.refresh();
              const models = registry.getAvailable().map((m: any) => ({
                provider: m.provider,
                id: m.id,
              }));
              return { type: "models_list", sessionId, models };
            } catch { /* ignore */ }
          }
          return { type: "models_list", sessionId, models: [] };
        }

        case "set_thinking_level":
          if (options?.setThinkingLevel) {
            options.setThinkingLevel(msg.level);
          }
          return undefined;

        case "shutdown":
          if (options?.shutdown) {
            options.shutdown();
          }
          return undefined;

        case "request_state_sync":
          // State sync is handled by the bridge on reconnect
          return undefined;

        case "list_sessions": {
          try {
            // Dynamic import to avoid hard dependency at module load
            const { SessionManager } = await import("@mariozechner/pi-coding-agent") as any;
            const cwd = msg.cwd || options?.getCwd?.() || process.cwd();
            const sessionInfos = await SessionManager.list(cwd);
            const sessions: PiSessionInfo[] = (sessionInfos || []).map((s: any) => ({
              id: s.id,
              path: s.path,
              cwd: s.cwd,
              name: s.name,
              parentSessionPath: s.parentSessionPath,
              created: s.created instanceof Date ? s.created.toISOString() : String(s.created),
              modified: s.modified instanceof Date ? s.modified.toISOString() : String(s.modified),
              messageCount: s.messageCount ?? 0,
              firstMessage: s.firstMessage,
            }));
            return { type: "sessions_list", sessionId, cwd, sessions };
          } catch {
            return { type: "sessions_list", sessionId, cwd: msg.cwd || process.cwd(), sessions: [] };
          }
        }

        default:
          return undefined;
      }
    },
  };
}

async function handleLoadSessionEvents(
  sessionId: string,
  sessionFile: string,
): Promise<ExtensionToServerMessage> {
  try {
    const { SessionManager } = await import("@mariozechner/pi-coding-agent") as any;
    const sm = SessionManager.open(sessionFile);
    const entries = sm.getBranch();
    const eventMessages = replayEntriesAsEvents(sessionId, entries);
    const events: Array<{ eventType: string; timestamp: number; data: Record<string, unknown> }> =
      eventMessages.map((m) => m.event);
    return { type: "load_session_events_result", sessionId, events };
  } catch (err: any) {
    const message = err?.code === "ENOENT" ? "file_not_found" : (err?.message ?? "parse_error");
    return { type: "load_session_events_error", sessionId, error: message };
  }
}
