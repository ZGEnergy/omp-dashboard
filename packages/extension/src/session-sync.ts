/**
 * Session sync: register, replay, and handle session changes.
 * Extracted from bridge.ts for clarity.
 */
import type { BridgeContext } from "./bridge-context.js";
import { getCurrentModelString, extractFirstMessage, filterHiddenCommands } from "./bridge-context.js";
import { detectSessionSource } from "./source-detector.js";
import { replayEntriesAsEvents } from "@blackbelt-technology/pi-dashboard-shared/state-replay.js";
import { gatherGitInfo, detectIsGitRepo } from "./vcs-info.js";
import type { FlowInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { buildProviderCatalogue, toModelInfo } from "./provider-register.js";
import { hashBytes, MAX_PER_IMAGE_BYTES } from "./markdown-image-inliner.js";

/**
 * Send full state sync to the server (session_register, commands, flows, models).
 * Called on initial connect and reconnect.
 */
export function sendStateSync(
  bc: BridgeContext,
  getFlowsList: () => FlowInfo[],
): void {
  const model = getCurrentModelString(bc);
  const thinkingLevel = (bc.pi as any).getThinkingLevel?.() ?? undefined;
  bc.lastModel = model;
  bc.lastThinkingLevel = thinkingLevel;

  const sessionFile = bc.lastSessionFile ?? bc.cachedCtx?.sessionManager?.getSessionFile?.() ?? undefined;
  const sessionDir = bc.lastSessionDir ?? bc.cachedCtx?.sessionManager?.getSessionDir?.() ?? undefined;
  const firstMessage = extractFirstMessage(bc.cachedCtx);

  // Include eventCount so server can skip event wipe on reconnect
  let eventCount: number | undefined;
  try {
    const entries = bc.cachedCtx?.sessionManager?.getBranch?.();
    if (entries) eventCount = entries.length;
  } catch { /* ignore */ }

  // Tag the very first sendStateSync after process boot as "spawn";
  // every subsequent invocation (driven by WebSocket reconnect after a
  // dashboard restart) is a "reattach". Server applies the configured
  // `reattachPlacement` policy on "reattach".
  // See change: reattach-move-to-front.
  const isFirstRegister = !bc.hasRegisteredOnce;
  const registerReason: "spawn" | "reattach" = isFirstRegister ? "spawn" : "reattach";

  // Include the spawn correlation token (server-minted UUID injected via
  // env var at spawn time) ONLY on the first register. Subsequent
  // registers (reattach after dashboard restart, in-process Ctrl+F fork)
  // omit it because the sessionId is already known to the server.
  // See change: spawn-correlation-token (Decision 3).
  //
  // The token is SINGLE-USE. After reading it on the first register we scrub
  // `process.env.PI_DASHBOARD_SPAWN_TOKEN` so any pi process this pi later
  // spawns (subagent, nested `pi`, reload) does NOT inherit and re-report the
  // consumed token. See change: fix-spawn-token-env-leak.
  let spawnToken: string | undefined;
  if (isFirstRegister) {
    spawnToken = process.env.PI_DASHBOARD_SPAWN_TOKEN;
    delete process.env.PI_DASHBOARD_SPAWN_TOKEN;
  }

  // Strong, restart-survival flag, derived from the capture-once boolean
  // (captured at bridge startup BEFORE the token was scrubbed), not a live
  // env read — the token is intentionally removed after first register.
  // Sent on every register (unlike spawnToken which fires only on the first).
  // See change: fix-spawn-token-env-leak.
  const dashboardSpawned = bc.dashboardSpawned;

  bc.connection.send({
    type: "session_register",
    sessionId: bc.sessionId,
    cwd: process.cwd(),
    name: bc.pi.getSessionName() ?? undefined,
    source: detectSessionSource(bc.cachedHasUI, sessionFile),
    model,
    thinkingLevel,
    sessionFile,
    sessionDir,
    firstMessage,
    eventCount,
    pid: process.pid,
    registerReason,
    // Tri-state git-repo signal computed synchronously (no git_info_update
    // arrival race). See change: gate-session-worktree-button-on-git.
    isGitRepo: detectIsGitRepo(process.cwd()),
    ...(spawnToken ? { spawnToken } : {}),
    ...(dashboardSpawned ? { dashboardSpawned: true } : {}),
  });

  bc.hasRegisteredOnce = true;

  const commands = filterHiddenCommands(bc.pi.getCommands());
  bc.connection.send({ type: "commands_list", sessionId: bc.sessionId, commands });

  // Send flows list
  const flows = getFlowsList();
  bc.connection.send({ type: "flows_list", sessionId: bc.sessionId, flows });

  if (bc.cachedModelRegistry) {
    try {
      const models = bc.cachedModelRegistry.getAvailable().map(toModelInfo);
      bc.connection.send({ type: "models_list", sessionId: bc.sessionId, models });
      // See change: replace-hardcoded-provider-lists.
      bc.connection.send({ type: "providers_list", sessionId: bc.sessionId, providers: buildProviderCatalogue() });
    } catch { /* ignore */ }
  }
}

const STRICT_BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const PERSISTED_ASSET_REFERENCE_RE = /pi-asset:([A-Za-z0-9_-]+)/g;
const UNAVAILABLE_ASSET_OUTPUT = "[asset unavailable]";

/**
 * A replay may contain durable pi-asset URLs whose bytes existed only in the
 * prior extension process. Current-replay successful registrations are the
 * only authority that permits one of those URLs to reach the server.
 */
function replaceUnregisteredReplayAssets(
  value: unknown,
  registeredHashes: ReadonlySet<string>,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return value.replace(PERSISTED_ASSET_REFERENCE_RE, (reference, hash: string) =>
      registeredHashes.has(hash) ? reference : UNAVAILABLE_ASSET_OUTPUT,
    );
  }
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = replaceUnregisteredReplayAssets(value[index], registeredHashes, seen);
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      (value as Record<string, unknown>)[key] = replaceUnregisteredReplayAssets(child, registeredHashes, seen);
    }
  }
  return value;
}

function decodeReplayAsset(data: string): Buffer | undefined {
  if (data.length === 0 || !STRICT_BASE64_RE.test(data)) return undefined;
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  const decodedLength = (data.length / 4) * 3 - padding;
  if (decodedLength <= 0 || decodedLength > MAX_PER_IMAGE_BYTES) return undefined;

  const bytes = Buffer.from(data, "base64");
  if (
    bytes.length !== decodedLength ||
    bytes.length === 0 ||
    bytes.length > MAX_PER_IMAGE_BYTES ||
    bytes.toString("base64") !== data
  ) {
    return undefined;
  }
  return bytes;
}

/**
 * Replay all session entries as protocol events.
 *
 * (mobile-session-rehydration: shared replay-preparation cutover.)
 * Routes every synthesized event through the shared
 * `replayEntriesAsEvents` replay-options seam so legacy inline tool-result
 * images become bounded `pi-asset:` references instead of inline bodies.
 * Inline image bytes are hashed through the existing asset machinery
 * (`hashBytes`: sha256 → 16 hex chars) and each deduped `asset_register` is
 * emitted BEFORE the referencing `event_forward`, matching the live
 * `maybeInlineAssistantImages` ordering contract. The per-replay dedup set
 * guarantees one `asset_register` per unique hash even when the same image
 * appears across multiple tool results. Malformed content is recovered (the
 * seam is non-throwing) and never aborts the whole session.
 */
export function replaySessionEntries(bc: BridgeContext): void {
  try {
    const entries = bc.cachedCtx?.sessionManager?.getBranch?.();
    if (!entries || entries.length === 0) return;
    const sessionId = bc.sessionId;
    const emittedHashes = new Set<string>();
    const registerInlineAsset = (asset: {
      data: string;
      mimeType: string;
    }): string | undefined => {
      const bytes = decodeReplayAsset(asset.data);
      if (!bytes) return undefined;

      // Hash validated, bounded decoded image bytes (sha256 → 16 hex chars),
      // matching the live bridge asset machinery. Dedup identical bytes.
      const hash = hashBytes(bytes);
      if (!emittedHashes.has(hash)) {
        bc.connection.send({
          type: "asset_register",
          sessionId,
          hash,
          mimeType: asset.mimeType,
          data: asset.data,
        });
        emittedHashes.add(hash);
      }
      return hash;
    };
    const events = replayEntriesAsEvents(sessionId, entries, undefined, {
      registerInlineAsset,
    });
    for (const msg of events) {
      if (msg.type === "event_forward") {
        const event = msg.event as { data: unknown };
        event.data = replaceUnregisteredReplayAssets(event.data, emittedHashes);
      }
      bc.connection.send(msg);
    }
  } catch { /* ignore */ }
}

/**
 * Handle session change (new/fork/resume): unregister old, register new, replay, sync.
 * Called from session_start when event.reason indicates a session switch.
 */
export function handleSessionChange(
  bc: BridgeContext,
  ctx: any,
  getFlowsList: () => FlowInfo[],
): void {
  bc.connection.send({ type: "session_unregister", sessionId: bc.sessionId });

  bc.sessionId = ctx.sessionManager.getSessionId();
  bc.lastSessionFile = ctx.sessionManager.getSessionFile?.() ?? undefined;
  bc.lastSessionDir = ctx.sessionManager.getSessionDir?.() ?? undefined;
  const firstMessage = extractFirstMessage(ctx);

  bc.lastFirstMessage = firstMessage;
  bc.lastGitBranch = undefined;
  bc.lastGitPrNumber = undefined;
  bc.lastGitWorktreeJson = undefined;
  bc.lastSessionName = bc.pi.getSessionName() ?? "";
  bc.lastModel = getCurrentModelString(bc);
  bc.lastThinkingLevel = (bc.pi as any).getThinkingLevel?.() ?? undefined;

  // Include eventCount for consistency (session switch/fork changes sessionId,
  // so the server will wipe regardless, but include for completeness)
  let eventCount: number | undefined;
  try {
    const entries = ctx.sessionManager?.getBranch?.();
    if (entries) eventCount = entries.length;
  } catch { /* ignore */ }

  // handleSessionChange always mints a fresh sessionId (new/fork/resume),
  // so registerReason is unconditionally "spawn" — even after the bridge
  // has previously reattached. See change: reattach-move-to-front.
  // dashboardSpawned from the capture-once boolean (token already scrubbed).
  // See change: fix-spawn-token-env-leak.
  const dashboardSpawned = bc.dashboardSpawned;
  bc.connection.send({
    type: "session_register",
    sessionId: bc.sessionId,
    cwd: ctx.cwd,
    name: bc.lastSessionName || undefined,
    source: detectSessionSource(bc.cachedHasUI, bc.lastSessionFile),
    model: bc.lastModel,
    thinkingLevel: bc.lastThinkingLevel,
    sessionFile: bc.lastSessionFile,
    sessionDir: bc.lastSessionDir,
    ...(dashboardSpawned ? { dashboardSpawned: true } : {}),
    firstMessage,
    eventCount,
    pid: process.pid,
    registerReason: "spawn",
    // See change: gate-session-worktree-button-on-git.
    isGitRepo: detectIsGitRepo(ctx.cwd),
  });

  replaySessionEntries(bc);
  bc.connection.send({ type: "replay_complete", sessionId: bc.sessionId });

  // Send git info
  const gitInfo = gatherGitInfo(ctx.cwd);
  if (gitInfo) {
    bc.lastGitBranch = gitInfo.gitBranch;
    bc.lastGitPrNumber = gitInfo.gitPrNumber;
    bc.lastGitWorktreeJson = gitInfo.gitWorktree ? JSON.stringify(gitInfo.gitWorktree) : "null";
    bc.connection.send({
      type: "git_info_update",
      sessionId: bc.sessionId,
      ...gitInfo,
      gitWorktree: gitInfo.gitWorktree ?? null,
    });
  }

  const commands = filterHiddenCommands(bc.pi.getCommands());
  bc.connection.send({ type: "commands_list", sessionId: bc.sessionId, commands });

  const flows = getFlowsList();
  bc.connection.send({ type: "flows_list", sessionId: bc.sessionId, flows });

  if (bc.cachedModelRegistry) {
    try {
      const models = bc.cachedModelRegistry.getAvailable().map(toModelInfo);
      bc.connection.send({ type: "models_list", sessionId: bc.sessionId, models });
      // See change: replace-hardcoded-provider-lists.
      bc.connection.send({ type: "providers_list", sessionId: bc.sessionId, providers: buildProviderCatalogue() });
    } catch { /* ignore */ }
  }
}
