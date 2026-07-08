/**
 * The `file` trigger type.
 *
 * Watches a configured folder and fires once per new file that arrives,
 * carrying the file's absolute path as the single per-fire value
 * (`FireContext.value`). That value resolves the `${{trigger}}` token in the
 * action payload at dispatch.
 *
 * Settle policy `rename-only` (default): fire only on an atomic rename into
 * the folder (fs.watch `rename` event where the entry now exists as a file),
 * so a file still being written is not fired on. Producers should write to a
 * temp path and rename into place.
 *
 * The watch factory is injectable so tests drive events deterministically;
 * existence checks use the real fs against tmp files.
 *
 * See change: wire-flow-inputs-in-automation.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { TriggerType, Disposable, ArmDeps, FireContext } from "./trigger-registry.js";

export type FileEvent = "created" | "changed" | "deleted";
const VALID_EVENTS: readonly FileEvent[] = ["created", "changed", "deleted"];

export interface FileConfig {
  /** Absolute folder to watch. */
  path: string;
  /** Selected events. Defaults to `["created"]`. */
  events: FileEvent[];
  /** Settle policy. Only `rename-only` is supported (default). */
  settle: "rename-only";
}

/** Minimal watcher surface (fs.FSWatcher is compatible). fs.FSWatcher emits a
 *  single `change` EventEmitter event carrying `(eventType, filename)` where
 *  `eventType` is `"rename" | "change"`. */
export interface DirWatcher {
  on(event: "change" | "error", cb: (...args: unknown[]) => void): void;
  close(): void;
}
export type WatchFactory = (dir: string) => DirWatcher;

const defaultWatch: WatchFactory = (dir) =>
  fs.watch(dir, { persistent: false }) as unknown as DirWatcher;

function parseFileConfig(rawOn: unknown): FileConfig {
  const on = rawOn as Record<string, unknown> | null;
  const p = on?.path;
  if (typeof p !== "string" || p.trim().length === 0) {
    throw new Error(`file trigger requires a non-empty \`path\` (got: ${JSON.stringify(p)})`);
  }
  let events: FileEvent[] = ["created"];
  if (Array.isArray(on?.events)) {
    const picked = (on!.events as unknown[]).filter(
      (e): e is FileEvent => typeof e === "string" && (VALID_EVENTS as readonly string[]).includes(e),
    );
    if (picked.length > 0) events = picked;
  }
  const settle = on?.settle === "rename-only" || on?.settle === undefined ? "rename-only" : "rename-only";
  return { path: p, events, settle };
}

/** Build a `file` TriggerType with an injectable watch factory (for tests). */
export function makeFileTrigger(watch: WatchFactory = defaultWatch): TriggerType<FileConfig> {
  return {
    kind: "file",

    parse: parseFileConfig,

    arm(cfg: FileConfig, fire: (ctx: FireContext) => void, deps: ArmDeps): Disposable {
      let disposed = false;
      // Track files already fired as `created` so a duplicate `rename` event
      // (some platforms emit twice) does not double-fire.
      const seen = new Set<string>();
      let watcher: DirWatcher | null = null;

      const isFile = (full: string): boolean => {
        try {
          return fs.statSync(full).isFile();
        } catch {
          return false;
        }
      };

      const onEvent = (eventType: unknown, filename: unknown): void => {
        if (disposed) return;
        const name = filename == null ? "" : String(filename);
        if (!name) return;
        const full = path.join(cfg.path, name);

        if (eventType === "rename") {
          const exists = isFile(full);
          if (exists && cfg.events.includes("created")) {
            if (seen.has(full)) return;
            seen.add(full);
            fire({ firedAt: deps.now(), value: full });
          } else if (!exists && cfg.events.includes("deleted")) {
            seen.delete(full);
            fire({ firedAt: deps.now(), value: full });
          }
        } else if (eventType === "change" && cfg.events.includes("changed")) {
          // `rename-only` settle governs `created`; `changed` is an explicit
          // opt-in and fires per change event.
          if (isFile(full)) fire({ firedAt: deps.now(), value: full });
        }
      };

      try {
        watcher = watch(cfg.path);
        // The `change` EventEmitter event fires for BOTH fs rename and change;
        // `eventType` (first arg) distinguishes them.
        watcher.on("change", (...a: unknown[]) => onEvent(a[0], a[1]));
        watcher.on("error", () => {
          /* degrade: stop watching on error */
          try {
            watcher?.close();
          } catch {
            /* ignore */
          }
          watcher = null;
        });
      } catch {
        // fs.watch throw → degrade to "not attached" (dormant).
        watcher = null;
      }

      return {
        dispose(): void {
          disposed = true;
          try {
            watcher?.close();
          } catch {
            /* ignore */
          }
          watcher = null;
        },
      };
    },
  };
}

/** The default `file` trigger (real fs.watch). */
export const fileTrigger: TriggerType<FileConfig> = makeFileTrigger();
