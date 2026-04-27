/**
 * Detects OpenSpec activity from tool execution events.
 * Returns partial activity info (phase and/or changeName) or null if not openspec-related.
 */
import type { OpenSpecPhase } from "./types.js";

export interface DetectedActivity {
  phase?: OpenSpecPhase;
  changeName?: string;
  /** True for write/CLI operations (active work), false for reads (passive browsing) */
  isActive?: boolean;
}

/** Map from skill directory name suffix to phase */
const SKILL_PHASE_MAP: Record<string, OpenSpecPhase> = {
  "apply-change": "apply",
  "archive-change": "archive",
  "bulk-archive-change": "archive",
  "continue-change": "continue",
  "explore": "explore",
  "ff-change": "ff",
  "new-change": "new",
  "onboard": "onboard",
  "sync-specs": "sync-specs",
  "verify-change": "verify",
};

/** Regex to match openspec skill SKILL.md reads */
const SKILL_PATH_RE = /\.pi\/skills\/openspec-([^/]+)\/SKILL\.md$/;

/** Regex to match openspec change file reads */
const CHANGE_PATH_RE = /openspec\/changes\/([^/]+)\//;

/** Regex to match --change "name" or --change name in CLI commands */
const CLI_CHANGE_FLAG_RE = /openspec\s+\S+.*--change\s+["']?([^\s"']+)["']?/;

/** Regex to match openspec archive <name> */
const CLI_ARCHIVE_RE = /openspec\s+archive\s+["']?([^\s"']+)["']?/;

/** Regex to match openspec new change "name" (positional arg) */
const CLI_NEW_CHANGE_RE = /openspec\s+new\s+change\s+["']?([^\s"']+)["']?/;

export function detectOpenSpecActivity(
  toolName: string,
  args: Record<string, unknown> | undefined,
): DetectedActivity | null {
  if (!args) return null;

  const tool = toolName.toLowerCase();

  if (tool === "read") {
    const path = args.path as string | undefined;
    if (!path) return null;

    // Check for skill file read → phase detection
    const skillMatch = path.match(SKILL_PATH_RE);
    if (skillMatch) {
      const suffix = skillMatch[1];
      const phase = SKILL_PHASE_MAP[suffix];
      if (phase) return { phase };
      return null;
    }

    // Check for openspec change file read → change name detection (passive)
    const changeMatch = path.match(CHANGE_PATH_RE);
    if (changeMatch) {
      return { changeName: changeMatch[1], isActive: false };
    }

    return null;
  }

  if (tool === "write") {
    const path = args.path as string | undefined;
    if (!path) return null;

    const changeMatch = path.match(CHANGE_PATH_RE);
    if (changeMatch) {
      return { changeName: changeMatch[1], isActive: true };
    }

    return null;
  }

  if (tool === "bash") {
      const command = args.command as string | undefined;
      if (!command || !command.includes("openspec")) return null;

      // Try each CLI regex in order; first match wins.
      const match =
        command.match(CLI_CHANGE_FLAG_RE) ??
        command.match(CLI_ARCHIVE_RE) ??
        command.match(CLI_NEW_CHANGE_RE);
      if (!match) return null;

      const name = match[1];
      // Reject flag-shaped tokens (e.g. `--help`, `-h`). The CLI regex capture
      // groups use `[^\s"']+` which would otherwise treat `--help` as a change
      // name and trigger downstream auto-attach + auto-rename.
      // See change: fix-openspec-flag-rename-bug.
      if (name.startsWith("-")) return null;

      return { changeName: name, isActive: true };
    }

  return null;
}
