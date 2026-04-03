/**
 * Shared mutable state for bridge modules.
 * Avoids passing 14+ closure variables to every extracted function.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ConnectionManager } from "./connection.js";

export interface BridgeContext {
  pi: ExtensionAPI;
  connection: ConnectionManager;
  /** Current session ID (mutated on session_switch/fork) */
  sessionId: string;
  cachedCtx: any;
  cachedModelRegistry: any;
  cachedHasUI: boolean | undefined;
  lastModel: string | undefined;
  lastThinkingLevel: string | undefined;
  lastSessionFile: string | undefined;
  lastSessionDir: string | undefined;
  lastFirstMessage: string | undefined;
  lastGitBranch: string | undefined;
  lastGitPrNumber: number | undefined;
  lastSessionName: string | undefined;
}

/** Filter out hidden commands (names starting with __) from commands list */
export function filterHiddenCommands(commands: any[]): any[] {
  return commands.filter((cmd) => !cmd.name.startsWith("__"));
}

/** Extract first user message text from session entries */
export function extractFirstMessage(ctx: any): string | undefined {
  try {
    const entries = ctx?.sessionManager?.getEntries?.();
    if (!entries || !Array.isArray(entries)) return undefined;
    for (const entry of entries) {
      if (entry.role === "user" && typeof entry.content === "string") {
        return entry.content.slice(0, 200);
      }
      if (entry.role === "user" && Array.isArray(entry.content)) {
        for (const part of entry.content) {
          if (part.type === "text" && typeof part.text === "string") {
            return part.text.slice(0, 200);
          }
        }
      }
    }
  } catch { /* ignore */ }
  return undefined;
}

/** Get current model string (provider/id) from cached context */
export function getCurrentModelString(bc: BridgeContext): string | undefined {
  const model = bc.cachedCtx?.model;
  if (!model) return undefined;
  return `${model.provider}/${model.id}`;
}
