/**
 * VAPID keypair lifecycle.
 *
 * Generates a keypair on first call and persists it to
 * `~/.pi/dashboard/push-vapid.json` (atomic write). Reused across restarts so
 * existing browser subscriptions stay valid. Not derived from `config.secret`
 * (design Decision 2) — separate persistence keeps the rotation lifecycle
 * explicit.
 * See change: add-server-push-notifications.
 */
import webpush from "web-push";
import { readJsonFile, writeJsonFile } from "../persistence/json-store.js";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Load the persisted VAPID keypair, or generate + persist one on first call. */
export function loadOrGenerateVapidKeys(filePath: string): VapidKeys {
  const existing = readJsonFile<Partial<VapidKeys>>(filePath, {});
  if (typeof existing.publicKey === "string" && typeof existing.privateKey === "string") {
    return { publicKey: existing.publicKey, privateKey: existing.privateKey };
  }
  const keys = webpush.generateVAPIDKeys();
  const vapid: VapidKeys = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  writeJsonFile(filePath, vapid, { mode: 0o600 });
  return vapid;
}

/** Public key advertised to clients only when Web Push can actually send. */
export function publicKeyForLivePush(
  enabled: boolean,
  contactEmail: string | undefined,
  keys: { publicKey: string } | undefined,
): string {
  if (!enabled || !contactEmail || !keys?.publicKey) return "";
  return keys.publicKey;
}
