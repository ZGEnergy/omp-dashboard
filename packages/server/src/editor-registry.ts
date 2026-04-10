/**
 * Static editor registry and detection logic.
 * Detects available editors by checking for running processes + CLI on PATH.
 */
import { execSync } from "node:child_process";

export interface EditorEntry {
  id: string;
  name: string;
  cli: string;
  processPattern: { darwin: string; linux: string };
}

export interface DetectedEditor {
  id: string;
  name: string;
}

export const EDITORS: EditorEntry[] = [
  {
    id: "zed",
    name: "Zed",
    cli: "zed",
    processPattern: { darwin: "/Applications/Zed.app", linux: "zed" },
  },
  {
    id: "vscode",
    name: "VS Code",
    cli: "code",
    processPattern: { darwin: "/Applications/Visual Studio Code.app", linux: "code" },
  },
  {
    id: "idea",
    name: "IntelliJ",
    cli: "idea",
    processPattern: { darwin: "/Applications/IntelliJ IDEA", linux: "idea" },
  },
];

export function isProcessRunning(pattern: string): boolean {
  try {
    execSync(`pgrep -f "${pattern}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function isCliAvailable(cli: string): boolean {
  try {
    execSync(`which ${cli}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function detectEditors(_cwd: string): DetectedEditor[] {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const results: DetectedEditor[] = [];
  for (const editor of EDITORS) {
    const pattern = editor.processPattern[platform];
    if (isProcessRunning(pattern) && isCliAvailable(editor.cli)) {
      results.push({ id: editor.id, name: editor.name });
    }
  }
  return results;
}
