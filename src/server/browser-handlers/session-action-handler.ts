/**
 * Session action handlers: send_prompt, abort, resume, spawn, shutdown, flow_control.
 */
import type { BrowserToServerMessage } from "../../shared/browser-protocol.js";
import type { BrowserHandlerContext } from "./handler-context.js";
import { spawnPiSession } from "../process-manager.js";
import { loadConfig } from "../../shared/config.js";
import { execSync } from "node:child_process";

function killHeadlessBySessionId(sessionId: string): boolean {
  if (process.platform === "win32") return false;
  try {
    const output = execSync(
      `ps -eo pid,command | grep "${sessionId}" | grep "sleep 2147483647" | grep -v grep`,
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    if (!output) return false;
    for (const line of output.split("\n")) {
      const pid = parseInt(line.trim(), 10);
      if (pid > 0) {
        try { process.kill(-pid, "SIGTERM"); } catch {
          try { process.kill(pid, "SIGTERM"); } catch { /* ignore */ }
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function handleSendPrompt(
  msg: Extract<BrowserToServerMessage, { type: "send_prompt" }>,
  ctx: BrowserHandlerContext,
): Promise<void> {
  const { sessionManager, piGateway, headlessPidRegistry, pendingResumeRegistry, pendingDashboardSpawns, broadcast } = ctx;
  const promptSession = sessionManager.get(msg.sessionId);

  if (promptSession?.status === "ended") {
    if (!promptSession.sessionFile) {
      console.error(`[dashboard] auto-resume failed: no session file for session ${msg.sessionId}`);
      return;
    }
    const alreadyResuming = promptSession.resuming;
    pendingResumeRegistry.record(promptSession.cwd, {
      text: msg.text,
      images: msg.images,
      oldSessionId: msg.sessionId,
      sessionFile: promptSession.sessionFile,
    });
    if (alreadyResuming) return;
    sessionManager.update(msg.sessionId, { resuming: true });
    broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { resuming: true } });
    const autoResumeConfig = loadConfig();
    const spawnResult = await spawnPiSession(promptSession.cwd, {
      sessionFile: promptSession.sessionFile,
      mode: "continue",
      strategy: autoResumeConfig.spawnStrategy,
    });
    if (!spawnResult.success) {
      console.error(`[dashboard] auto-resume spawn failed: ${spawnResult.message}`);
      pendingResumeRegistry.consume(promptSession.cwd);
      sessionManager.update(msg.sessionId, { resuming: false });
      broadcast({ type: "session_updated", sessionId: msg.sessionId, updates: { resuming: false } });
    }
    if (spawnResult.dashboardSpawned && spawnResult.success) {
      pendingDashboardSpawns?.set(promptSession.cwd, (pendingDashboardSpawns?.get(promptSession.cwd) ?? 0) + 1);
    }
    if (spawnResult.process && spawnResult.pid) {
      headlessPidRegistry.register(spawnResult.pid, promptSession.cwd, spawnResult.process);
    }
  } else {
    const sent = piGateway.sendToSession(msg.sessionId, {
      type: "send_prompt",
      sessionId: msg.sessionId,
      text: msg.text,
      images: msg.images,
    });
    if (!sent) {
      console.error(`[dashboard] send_prompt failed: no bridge connection for session ${msg.sessionId}`);
    }
  }
}

export async function handleResumeSession(
  msg: Extract<BrowserToServerMessage, { type: "resume_session" }>,
  ctx: BrowserHandlerContext,
): Promise<void> {
  const { ws, sessionManager, pendingForkRegistry, headlessPidRegistry, pendingDashboardSpawns, sendTo } = ctx;
  const session = sessionManager.get(msg.sessionId);
  if (!session) {
    sendTo(ws, { type: "resume_result", sessionId: msg.sessionId, success: false, message: "Session not found" });
    return;
  }
  if (!session.sessionFile) {
    sendTo(ws, { type: "resume_result", sessionId: msg.sessionId, success: false, message: "Session file is unknown (pre-migration session)" });
    return;
  }
  if (msg.mode === "continue" && session.status !== "ended") {
    sendTo(ws, { type: "resume_result", sessionId: msg.sessionId, success: false, message: "Session is already active" });
    return;
  }
  if (session.resuming) {
    sendTo(ws, { type: "resume_result", sessionId: msg.sessionId, success: false, message: "Session is already being resumed" });
    return;
  }
  if (msg.mode === "fork" && pendingForkRegistry) {
    pendingForkRegistry.recordFork(session.cwd, msg.sessionId);
  }
  const resumeConfig = loadConfig();
  const result = await spawnPiSession(session.cwd, {
    sessionFile: session.sessionFile,
    mode: msg.mode,
    strategy: resumeConfig.spawnStrategy,
  });
  if (result.dashboardSpawned && result.success) {
    pendingDashboardSpawns?.set(session.cwd, (pendingDashboardSpawns?.get(session.cwd) ?? 0) + 1);
  }
  if (result.process && result.pid) {
    headlessPidRegistry.register(result.pid, session.cwd, result.process);
  }
  sendTo(ws, { type: "resume_result", sessionId: msg.sessionId, success: result.success, message: result.message });
}

export async function handleSpawnSession(
  msg: Extract<BrowserToServerMessage, { type: "spawn_session" }>,
  ctx: BrowserHandlerContext,
): Promise<void> {
  const { ws, headlessPidRegistry, pendingDashboardSpawns, sendTo } = ctx;
  const config = loadConfig();
  const spawnResult = await spawnPiSession(msg.cwd, { strategy: config.spawnStrategy });
  if (spawnResult.process && spawnResult.pid) {
    headlessPidRegistry.register(spawnResult.pid, msg.cwd, spawnResult.process);
  }
  if (spawnResult.dashboardSpawned && spawnResult.success) {
    pendingDashboardSpawns?.set(msg.cwd, (pendingDashboardSpawns?.get(msg.cwd) ?? 0) + 1);
  }
  sendTo(ws, { type: "spawn_result", cwd: msg.cwd, success: spawnResult.success, message: spawnResult.message });
}

export function handleShutdown(
  msg: Extract<BrowserToServerMessage, { type: "shutdown" }>,
  ctx: BrowserHandlerContext,
): void {
  const { sessionManager, piGateway, headlessPidRegistry, broadcast } = ctx;
  piGateway.sendToSession(msg.sessionId, { type: "shutdown", sessionId: msg.sessionId });
  headlessPidRegistry.killBySessionId(msg.sessionId);
  killHeadlessBySessionId(msg.sessionId);
  sessionManager.unregister(msg.sessionId);
  broadcast({ type: "session_removed", sessionId: msg.sessionId });
}

export function handleAbort(
  msg: Extract<BrowserToServerMessage, { type: "abort" }>,
  ctx: BrowserHandlerContext,
): void {
  ctx.piGateway.sendToSession(msg.sessionId, { type: "abort", sessionId: msg.sessionId });
}

export function handleFlowControl(
  msg: Extract<BrowserToServerMessage, { type: "flow_control" }>,
  ctx: BrowserHandlerContext,
): void {
  ctx.piGateway.sendToSession(msg.sessionId, { type: "flow_control", sessionId: msg.sessionId, action: msg.action });
}
