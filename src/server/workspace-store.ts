/**
 * Workspace management - CRUD operations backed by JSON file.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG_DIR } from "../shared/config.js";
import { readJsonFile, writeJsonFile } from "./json-store.js";
import type { Workspace } from "../shared/types.js";

export const WORKSPACES_FILE = path.join(CONFIG_DIR, "workspaces.json");

export interface CreateWorkspaceParams {
  path: string;
  name?: string;
}

export interface UpdateWorkspaceParams {
  name?: string;
  sortOrder?: number;
}

export interface DiscoveredWorkspace {
  name: string;
  path: string;
}

export interface WorkspaceStore {
  create(params: CreateWorkspaceParams): Workspace;
  get(id: string): Workspace | undefined;
  update(id: string, params: UpdateWorkspaceParams): Workspace;
  delete(id: string): void;
  list(): Workspace[];
  discover(baseDirs: string[]): DiscoveredWorkspace[];
}

export function createWorkspaceStore(filePath: string = WORKSPACES_FILE): WorkspaceStore {
  let workspaces: Workspace[] = readJsonFile<Workspace[]>(filePath, []);

  function save(): void {
    writeJsonFile(filePath, workspaces);
  }

  return {
    create(params: CreateWorkspaceParams): Workspace {
      if (!fs.existsSync(params.path)) {
        throw new Error(`Path does not exist: ${params.path}`);
      }
      if (workspaces.some((w) => w.path === params.path)) {
        throw new Error(`Workspace already exists for path: ${params.path}`);
      }

      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name: params.name ?? path.basename(params.path),
        path: params.path,
        sortOrder: 0,
        createdAt: Date.now(),
      };
      workspaces.push(workspace);
      save();
      return workspace;
    },

    get(id: string): Workspace | undefined {
      return workspaces.find((w) => w.id === id);
    },

    update(id: string, params: UpdateWorkspaceParams): Workspace {
      const idx = workspaces.findIndex((w) => w.id === id);
      if (idx === -1) throw new Error(`Workspace not found: ${id}`);

      if (params.name !== undefined) workspaces[idx].name = params.name;
      if (params.sortOrder !== undefined) workspaces[idx].sortOrder = params.sortOrder;
      save();
      return { ...workspaces[idx] };
    },

    delete(id: string): void {
      workspaces = workspaces.filter((w) => w.id !== id);
      save();
    },

    list(): Workspace[] {
      return [...workspaces].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },

    discover(baseDirs: string[]): DiscoveredWorkspace[] {
      const existingPaths = new Set(workspaces.map((w) => w.path));
      const discovered: DiscoveredWorkspace[] = [];

      for (const baseDir of baseDirs) {
        if (!fs.existsSync(baseDir)) continue;
        try {
          const entries = fs.readdirSync(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const fullPath = path.join(baseDir, entry.name);
            if (existingPaths.has(fullPath)) continue;
            const hasGit = fs.existsSync(path.join(fullPath, ".git"));
            const hasPi = fs.existsSync(path.join(fullPath, ".pi"));
            if (hasGit || hasPi) {
              discovered.push({ name: entry.name, path: fullPath });
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }
      return discovered;
    },
  };
}
