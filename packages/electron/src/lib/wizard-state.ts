/**
 * Wizard state persistence (post-slim).
 *
 * The slimmed first-run wizard (change: streamline-electron-bootstrap-and-recovery,
 * Group 8) derives "first run?" from filesystem state — see
 * `isManagedDirPopulated` in `power-user-install.ts` and `cleanupLegacyStateFiles`
 * in `legacy-cleanup.ts`. The pre-slim `mode.json` machinery
 * (`isFirstRun`, `readModeFile`, `writeModeFile`, `ModeConfig`) is gone;
 * legacy `mode.json` files are deleted on launch as a one-shot janitorial
 * pass by `legacy-cleanup.ts`.
 *
 * What remains:
 *   - API-key inspection helpers used by Doctor (`isApiKeyConfigured`,
 *     `writeApiKey`). Wizard no longer collects API keys directly; the
 *     done step deep-links to Settings → Provider Auth instead.
 *   - Recommended-extensions skip-list helpers used by the legacy
 *     `wizard:get-recommended` path elsewhere. Kept for the dashboard's
 *     Packages tab which still respects the skipped list.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";

function getManagedDir() { return path.join(os.homedir(), ".pi-dashboard"); }
function getPiSettings() { return path.join(os.homedir(), ".pi", "agent", "settings.json"); }
function getRecommendedStateFile() { return path.join(getManagedDir(), "recommended.json"); }

export interface RecommendedWizardState {
  /** Recommended-extension ids the user explicitly skipped during the wizard. */
  skippedRecommended: string[];
  completedAt?: string;
}

/** Check if any API key is configured in pi's settings. */
export function isApiKeyConfigured(): boolean {
  try {
    if (!existsSync(getPiSettings())) return false;
    const data = JSON.parse(readFileSync(getPiSettings(), "utf-8"));
    // Check common provider key patterns
    if (data?.anthropicApiKey || data?.openaiApiKey || data?.apiKey) return true;
    // Check providers object
    if (data?.providers && typeof data.providers === "object") {
      for (const provider of Object.values(data.providers) as any[]) {
        if (provider?.apiKey) return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

/** Write an API key to pi's settings file. */
export function writeApiKey(provider: string, key: string): void {
  const settingsDir = path.dirname(getPiSettings());
  mkdirSync(settingsDir, { recursive: true });

  let data: any = {};
  try {
    if (existsSync(getPiSettings())) {
      data = JSON.parse(readFileSync(getPiSettings(), "utf-8"));
    }
  } catch { /* start fresh */ }

  // Write based on provider name
  if (provider === "anthropic") {
    data.anthropicApiKey = key;
  } else if (provider === "openai") {
    data.openaiApiKey = key;
  } else {
    // Generic: store in providers map
    if (!data.providers) data.providers = {};
    if (!data.providers[provider]) data.providers[provider] = {};
    data.providers[provider].apiKey = key;
  }

  writeFileSync(getPiSettings(), JSON.stringify(data, null, 2) + "\n");
}

// ── Recommended extensions wizard state ─────────────────────────

/** Read persisted recommended-extensions wizard state, or defaults. */
export function readRecommendedWizardState(): RecommendedWizardState {
  try {
    if (!existsSync(getRecommendedStateFile())) return { skippedRecommended: [] };
    const data = JSON.parse(readFileSync(getRecommendedStateFile(), "utf-8"));
    const skipped = Array.isArray(data?.skippedRecommended)
      ? (data.skippedRecommended as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    return { skippedRecommended: skipped, completedAt: data?.completedAt };
  } catch { /* corrupt file */ }
  return { skippedRecommended: [] };
}

/**
 * Persist the recommended-extensions wizard state.
 *
 * `skippedRecommended` is the list of manifest ids the user chose NOT to
 * install and which should suppress future wizard nagging. The list is
 * replaced on each write (not merged).
 */
export function writeRecommendedWizardState(state: RecommendedWizardState): void {
  mkdirSync(getManagedDir(), { recursive: true });
  const payload: RecommendedWizardState = {
    skippedRecommended: [...state.skippedRecommended],
    completedAt: state.completedAt ?? new Date().toISOString(),
  };
  writeFileSync(getRecommendedStateFile(), JSON.stringify(payload, null, 2) + "\n");
}

/** True when the wizard has already run its recommended-extensions step. */
export function isRecommendedWizardCompleted(): boolean {
  return existsSync(getRecommendedStateFile());
}
