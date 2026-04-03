/**
 * Model and thinking-level change detection.
 * Sends model_update only when values actually change.
 */
import type { BridgeContext } from "./bridge-context.js";
import { getCurrentModelString } from "./bridge-context.js";
import { gatherGitInfo } from "./git-info.js";

/**
 * Send model_update if model or thinking level has changed since last send.
 */
export function sendModelUpdateIfChanged(bc: BridgeContext): void {
  const model = getCurrentModelString(bc);
  const thinkingLevel = (bc.pi as any).getThinkingLevel?.() ?? undefined;
  if (model === bc.lastModel && thinkingLevel === bc.lastThinkingLevel) return;
  bc.lastModel = model;
  bc.lastThinkingLevel = thinkingLevel;
  if (model) {
    bc.connection.send({
      type: "model_update",
      sessionId: bc.sessionId,
      model,
      thinkingLevel,
    });
  }
}

/**
 * Send session_name_update if name has changed since last send.
 */
export function sendSessionNameIfChanged(bc: BridgeContext): void {
  const name = bc.pi.getSessionName() ?? "";
  if (name === bc.lastSessionName) return;
  bc.lastSessionName = name;
  bc.connection.send({
    type: "session_name_update",
    sessionId: bc.sessionId,
    name,
  });
}

/**
 * Send git_info_update if branch or PR has changed since last send.
 */
export function sendGitInfoIfChanged(bc: BridgeContext, cwd: string): void {
  const info = gatherGitInfo(cwd);
  if (!info) return;
  if (info.gitBranch === bc.lastGitBranch && info.gitPrNumber === bc.lastGitPrNumber) return;
  bc.lastGitBranch = info.gitBranch;
  bc.lastGitPrNumber = info.gitPrNumber;
  bc.connection.send({
    type: "git_info_update",
    sessionId: bc.sessionId,
    ...info,
  });
}
