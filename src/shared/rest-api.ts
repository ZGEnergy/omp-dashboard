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
