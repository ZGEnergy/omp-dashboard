/**
 * REST API endpoint types.
 */
import type {
  DashboardSession,
  DashboardEvent,
  ApiResponse,
} from "./types.js";

// ── Sessions ────────────────────────────────────────────────────────

export interface ListSessionsQuery {
  status?: "active" | "ended";
}

export type ListSessionsResponse = ApiResponse<DashboardSession[]>;

// ── Events ──────────────────────────────────────────────────────────

export type FetchEventContentResponse = ApiResponse<DashboardEvent>;

// ── Session Spawn ───────────────────────────────────────────────────

export interface SpawnSessionRequest {
  cwd: string;
}

export type SpawnSessionResponse = ApiResponse<{ message: string }>;

// ── Aggregate Stats ─────────────────────────────────────────────────

export interface AggregateStats {
  activeSessions: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCost: number;
}

export type AggregateStatsResponse = ApiResponse<AggregateStats>;

// ── File Read ───────────────────────────────────────────────────────

export interface FileContentResult {
  type: "file";
  content: string;
}

export interface DirectoryListResult {
  type: "directory";
  entries: string[];
}

export type FileReadResult = FileContentResult | DirectoryListResult;

export type FileReadResponse = ApiResponse<FileReadResult>;

// ── Browse ──────────────────────────────────────────────────────────

export interface BrowseEntry {
  name: string;
  path: string;
  isGit: boolean;
  isPi: boolean;
}

export interface BrowseResult {
  entries: BrowseEntry[];
  parent: string | null;
  current: string;
}

export type BrowseResponse = ApiResponse<BrowseResult>;

// ── Tunnel Status ───────────────────────────────────────────────────

export type TunnelStatus =
  | { status: "active"; url: string; serverOs: string }
  | { status: "inactive"; serverOs: string }
  | { status: "unavailable"; serverOs: string };

export type TunnelStatusResponse = ApiResponse<TunnelStatus>;

// ── Pi Resources ────────────────────────────────────────────────────

export interface PiResource {
  name: string;
  description?: string;
  filePath: string;
  type: "extension" | "skill" | "prompt";
}

export interface PiResourceScope {
  extensions: PiResource[];
  skills: PiResource[];
  prompts: PiResource[];
}

export interface PiPackageInfo {
  name: string;
  description?: string;
  source: string; // e.g. "npm:pi-web-access", "git:github.com/user/repo", "../relative"
  resources: PiResourceScope;
}

export interface PiResourcesResult {
  local: PiResourceScope;
  global: PiResourceScope;
  packages: PiPackageInfo[];
}

export type PiResourcesResponse = ApiResponse<PiResourcesResult>;

// ── Git Operations ──────────────────────────────────────────────────

export interface GitBranchEntry {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
}

export interface GitBranchesResult {
  current: string;
  detached: boolean;
  branches: GitBranchEntry[];
}

export type GitBranchesResponse = ApiResponse<GitBranchesResult>;

export interface GitCheckoutRequest {
  cwd: string;
  branch: string;
  stash?: boolean;
}

export type GitCheckoutResponse =
  | ApiResponse<{ stashed?: boolean }>
  | ApiResponse<never> & { success: false; dirty: true; files: string[] };

export interface GitInitRequest {
  cwd: string;
}

export type GitInitResponse = ApiResponse<void>;

export interface GitStashPopResult {
  conflicts: boolean;
}

export type GitStashPopResponse = ApiResponse<GitStashPopResult>;

// ── Provider Auth ─────────────────────────────────────────────────────────

export interface ProviderAuthInfo {
  id: string;
  name: string;
  flowType: "auth_code" | "device_code";
}

export interface ProviderAuthStatus {
  id: string;
  name: string;
  flowType: "auth_code" | "device_code" | "api_key";
  authenticated: boolean;
  expires?: number;
  maskedKey?: string;
}

export interface AuthorizeResponse {
  flowId: string;
  authUrl: string;
}

export interface DeviceCodeResponse {
  flowId: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}
