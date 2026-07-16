/**
 * Push token registry — durable list of registered device subscriptions.
 *
 * Persisted as a single JSON file (`~/.pi/dashboard/push-tokens.json`) via the
 * atomic tmp+rename `json-store` helper, matching `session-meta` /
 * `preferences-store`. For the < 1000 tokens any single user has, a full-file
 * rewrite per mutation is negligible (design Decision 4).
 * See change: add-server-push-notifications.
 */
import crypto from "node:crypto";
import { readJsonFile, writeJsonFile } from "../json-store.js";
import type { PushTransportKind } from "./push-transports/types.js";

export interface PushToken {
  id: string;
  /** Opaque transport-specific token (Web Push subscription JSON, FCM token). */
  deviceToken: string;
  transport: PushTransportKind;
  /** Owning user, when auth is enabled. */
  userId?: string;
  /** When present, the token only receives pushes for these sessionIds. */
  sessionFilter?: string[];
  registeredAt: number;
  lastUsedAt: number;
}

/** Fields the caller supplies on register; the rest are server-managed. */
export type PushTokenInput = Pick<PushToken, "deviceToken" | "transport"> &
  Partial<Pick<PushToken, "userId" | "sessionFilter">>;

export interface PushTokenRegistry {
  add(token: PushTokenInput): PushToken;
  remove(id: string): void;
  list(): PushToken[];
  findByDeviceToken(deviceToken: string): PushToken | undefined;
  touch(id: string): void;
}

export function createPushTokenRegistry(opts: { path: string }): PushTokenRegistry {
  const { path: filePath } = opts;

  function load(): PushToken[] {
    return readJsonFile<PushToken[]>(filePath, []);
  }

  function save(tokens: PushToken[]): void {
    // Device tokens + endpoints are secrets — owner-only.
    writeJsonFile(filePath, tokens, { mode: 0o600 });
  }

  return {
    add(input: PushTokenInput): PushToken {
      const tokens = load();
      const now = Date.now();
      const existing = tokens.find((t) => t.deviceToken === input.deviceToken);
      if (existing) {
        // Idempotent: refresh mutable fields, keep the original id.
        existing.transport = input.transport;
        existing.lastUsedAt = now;
        if (input.userId !== undefined) existing.userId = input.userId;
        if (input.sessionFilter !== undefined) existing.sessionFilter = input.sessionFilter;
        save(tokens);
        return existing;
      }
      const token: PushToken = {
        id: crypto.randomUUID(),
        deviceToken: input.deviceToken,
        transport: input.transport,
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        ...(input.sessionFilter !== undefined ? { sessionFilter: input.sessionFilter } : {}),
        registeredAt: now,
        lastUsedAt: now,
      };
      tokens.push(token);
      save(tokens);
      return token;
    },

    remove(id: string): void {
      const tokens = load();
      const next = tokens.filter((t) => t.id !== id);
      if (next.length !== tokens.length) save(next);
    },

    list(): PushToken[] {
      return load();
    },

    findByDeviceToken(deviceToken: string): PushToken | undefined {
      return load().find((t) => t.deviceToken === deviceToken);
    },

    touch(id: string): void {
      const tokens = load();
      const token = tokens.find((t) => t.id === id);
      if (!token) return;
      token.lastUsedAt = Date.now();
      save(tokens);
    },
  };
}
