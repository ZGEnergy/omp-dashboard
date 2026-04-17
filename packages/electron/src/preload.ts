/**
 * Preload script for Electron renderer (wizard window).
 * Exposes IPC APIs to the renderer via contextBridge.
 */
import { contextBridge, ipcRenderer } from "electron";

export interface WizardApi {
  /** Detect installed tools */
  detectDependencies: () => Promise<{
    pi: { found: boolean; source?: string };
    openspec: { found: boolean; source?: string };
    dashboard: { found: boolean; source?: string };
    node: { found: boolean; source?: string };
    apiKeyConfigured: boolean;
  }>;
  /** Run standalone install (optionally skip already-installed packages) */
  installStandalone: (skipPackages?: string[]) => Promise<void>;
  /** Install dashboard package globally (power user) */
  installDashboardGlobal: () => Promise<void>;
  /** Register the bundled bridge extension in pi's settings */
  registerBundledBridge: () => Promise<void>;
  /** Save API key */
  saveApiKey: (provider: string, key: string) => Promise<void>;
  /** Complete wizard and persist mode */
  completeWizard: (mode: "standalone" | "power-user") => Promise<void>;
  /** Listen for install progress events */
  onInstallProgress: (callback: (progress: { step: string; status: string; error?: string; output?: string }) => void) => void;
  /** Get the static recommended-extensions manifest + persisted skipped ids */
  getRecommendedExtensions: () => Promise<{
    recommended: Array<{
      id: string;
      source: string;
      displayName: string;
      fallbackDescription: string;
      status: "required" | "strongly-suggested" | "optional";
      unlocks: string[];
      toolsRegistered?: string[];
      autowired?: boolean;
    }>;
    skipped: string[];
  }>;
  /** Install the selected recommended extensions by id */
  installRecommendedExtensions: (ids: string[]) => Promise<{ installed: number }>;
  /** Persist the list of skipped recommended ids */
  persistRecommendedSkipped: (skippedIds: string[]) => Promise<void>;
}

const api: WizardApi = {
  detectDependencies: () => ipcRenderer.invoke("wizard:detect"),
  installStandalone: (skipPackages) => ipcRenderer.invoke("wizard:install-standalone", skipPackages),
  installDashboardGlobal: () => ipcRenderer.invoke("wizard:install-dashboard-global"),
  registerBundledBridge: () => ipcRenderer.invoke("wizard:register-bundled-bridge"),
  saveApiKey: (provider, key) => ipcRenderer.invoke("wizard:save-api-key", provider, key),
  completeWizard: (mode) => ipcRenderer.invoke("wizard:complete", mode),
  onInstallProgress: (callback) => {
    ipcRenderer.on("wizard:progress", (_event, progress) => callback(progress));
  },
  getRecommendedExtensions: () => ipcRenderer.invoke("wizard:get-recommended"),
  installRecommendedExtensions: (ids) => ipcRenderer.invoke("wizard:install-recommended", ids),
  persistRecommendedSkipped: (skippedIds) => ipcRenderer.invoke("wizard:persist-recommended-skipped", skippedIds),
};

contextBridge.exposeInMainWorld("wizardApi", api);
