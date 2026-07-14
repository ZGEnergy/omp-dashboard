/**
 * Client fetch helpers for OMP agent settings (`/api/omp-config`).
 *
 * Writes go through the server's `omp config` CLI wrapper — never raw YAML.
 */
import { getApiBase } from "./api-context.js";

export type OmpConfigValueType =
  | "boolean"
  | "number"
  | "string"
  | "enum"
  | "array"
  | "record";

export type OmpConfigEntry = {
  key: string;
  value: unknown;
  type: OmpConfigValueType;
  description: string;
};

export type OmpConfigSnapshot = {
  agentDir: string;
  settings: Record<string, OmpConfigEntry>;
};

export class OmpConfigApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "OmpConfigApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

function throwFromResponse(res: Response, body: Record<string, unknown>): never {
  const error =
    typeof body.error === "string" && body.error.trim()
      ? body.error
      : `HTTP ${res.status}`;
  const code = typeof body.code === "string" ? body.code : undefined;
  throw new OmpConfigApiError(error, res.status, code);
}

export async function fetchOmpConfig(signal?: AbortSignal): Promise<OmpConfigSnapshot> {
  const res = await fetch(`${getApiBase()}/api/omp-config`, { signal });
  const body = await parseJson(res);
  if (!res.ok || body.success !== true) throwFromResponse(res, body);
  const data = body.data;
  if (!data || typeof data !== "object") {
    throw new OmpConfigApiError("Invalid omp-config response", res.status);
  }
  const record = data as Record<string, unknown>;
  const agentDir = typeof record.agentDir === "string" ? record.agentDir : "";
  const settings =
    record.settings && typeof record.settings === "object"
      ? (record.settings as Record<string, OmpConfigEntry>)
      : {};
  return { agentDir, settings };
}

export async function setOmpConfig(
  key: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const res = await fetch(`${getApiBase()}/api/omp-config`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
    signal,
  });
  const body = await parseJson(res);
  if (!res.ok || body.success !== true) throwFromResponse(res, body);
  return body.data as OmpConfigEntry;
}

export async function resetOmpConfig(
  key: string,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const res = await fetch(`${getApiBase()}/api/omp-config/reset`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
    signal,
  });
  const body = await parseJson(res);
  if (!res.ok || body.success !== true) throwFromResponse(res, body);
  return body.data as OmpConfigEntry;
}

/**
 * Atomically patch OMP `modelRoles` on the server. The server serializes its
 * read-merge-write so concurrent Roles and Sessions default-model editors do
 * not lose one another's changes.
 */
export async function patchOmpModelRoles(
  patch: Record<string, string | null | undefined>,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const normalized: Record<string, string | null> = {};
  for (const [role, modelId] of Object.entries(patch)) {
    normalized[role] = modelId == null || modelId.trim() === "" ? null : modelId.trim();
  }
  const res = await fetch(`${getApiBase()}/api/omp-config/model-roles`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patch: normalized }),
    signal,
  });
  const body = await parseJson(res);
  if (!res.ok || body.success !== true) throwFromResponse(res, body);
  return body.data as OmpConfigEntry;
}

/** Backward-compatible local name for callers; uses the atomic patch route. */
export const mergeOmpModelRoles = patchOmpModelRoles;
