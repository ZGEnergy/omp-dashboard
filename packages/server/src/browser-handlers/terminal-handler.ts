/**
 * Terminal message handlers: create, kill, rename.
 */
import type { BrowserToServerMessage } from "@blackbelt-technology/pi-dashboard-shared/browser-protocol.js";
import type { BrowserHandlerContext } from "./handler-context.js";

export function handleCreateTerminal(
  msg: Extract<BrowserToServerMessage, { type: "create_terminal" }>,
  ctx: BrowserHandlerContext,
): void {
  const { terminalManager, sessionOrderManager, broadcast } = ctx;
  if (terminalManager && sessionOrderManager) {
    const terminal = terminalManager.spawn(msg.cwd);
    sessionOrderManager.insert(msg.cwd, terminal.id);
    broadcast({ type: "terminal_added", terminal });
    broadcast({ type: "sessions_reordered", cwd: msg.cwd, sessionIds: sessionOrderManager.getOrder(msg.cwd) });
  }
}

export function handleKillTerminal(
  msg: Extract<BrowserToServerMessage, { type: "kill_terminal" }>,
  ctx: BrowserHandlerContext,
): void {
  if (ctx.terminalManager) {
    try { ctx.terminalManager.kill(msg.terminalId); } catch { /* ignore */ }
  }
}

export function handleRenameTerminal(
  msg: Extract<BrowserToServerMessage, { type: "rename_terminal" }>,
  ctx: BrowserHandlerContext,
): void {
  if (ctx.terminalManager) {
    ctx.terminalManager.updateTitle(msg.terminalId, msg.title);
    ctx.broadcast({ type: "terminal_updated", terminalId: msg.terminalId, updates: { title: msg.title } });
  }
}
