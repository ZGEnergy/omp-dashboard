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
  /** Run standalone install */
  installStandalone: () => Promise<void>;
  /** Install dashboard package globally (power user) */
  installDashboardGlobal: () => Promise<void>;
  /** Save API key */
  saveApiKey: (provider: string, key: string) => Promise<void>;
  /** Complete wizard and persist mode */
  completeWizard: (mode: "standalone" | "power-user") => Promise<void>;
  /** Listen for install progress events */
  onInstallProgress: (callback: (progress: { step: string; status: string; error?: string; output?: string }) => void) => void;
}

const api: WizardApi = {
  detectDependencies: () => ipcRenderer.invoke("wizard:detect"),
  installStandalone: () => ipcRenderer.invoke("wizard:install-standalone"),
  installDashboardGlobal: () => ipcRenderer.invoke("wizard:install-dashboard-global"),
  saveApiKey: (provider, key) => ipcRenderer.invoke("wizard:save-api-key", provider, key),
  completeWizard: (mode) => ipcRenderer.invoke("wizard:complete", mode),
  onInstallProgress: (callback) => {
    ipcRenderer.on("wizard:progress", (_event, progress) => callback(progress));
  },
};

contextBridge.exposeInMainWorld("wizardApi", api);
