/**
 * Minimal REST client for `/api/omp-config` used by the roles plugin.
 * Kept local so the plugin does not depend on the dashboard client package.
 *
 * API base: prefer `globalThis.__PI_DASHBOARD_API_BASE__` (set by App via
 * setGlobalApiBase) so remote/tunnel dashboards hit the correct origin;
 * fall back to same-origin relative paths (empty base).
 */

export type OmpConfigEntry = {
  key: string;
  value: unknown;
  type: string;
  description: string;
};

export type OmpConfigSnapshot = {
  agentDir: string;
  settings: Record<string, OmpConfigEntry>;
};

function apiBase(): string {
  const g = globalThis as { __PI_DASHBOARD_API_BASE__?: string };
  return typeof g.__PI_DASHBOARD_API_BASE__ === "string" ? g.__PI_DASHBOARD_API_BASE__ : "";
}

function url(path: string): string {
  return `${apiBase()}${path}`;
}

async function parseBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export async function fetchOmpConfig(signal?: AbortSignal): Promise<OmpConfigSnapshot> {
  const res = await fetch(url("/api/omp-config"), { signal });
  const body = await parseBody(res);
  if (!res.ok || body.success !== true) {
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(error);
  }
  const data = body.data;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid omp-config response");
  }
  const record = data as Record<string, unknown>;
  return {
    agentDir: typeof record.agentDir === "string" ? record.agentDir : "",
    settings:
      record.settings && typeof record.settings === "object"
        ? (record.settings as Record<string, OmpConfigEntry>)
        : {},
  };
}

export async function setOmpConfig(
  key: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const res = await fetch(url("/api/omp-config"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
    signal,
  });
  const body = await parseBody(res);
  if (!res.ok || body.success !== true) {
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(error);
  }
  return body.data as OmpConfigEntry;
}

/** Patch `modelRoles` through the server's serialized read-merge-write route. */
export async function mergeOmpModelRoles(
  patch: Record<string, string | null | undefined>,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const normalized: Record<string, string | null> = {};
  for (const [role, modelId] of Object.entries(patch)) {
    normalized[role] = modelId == null || modelId.trim() === "" ? null : modelId.trim();
  }
  const res = await fetch(url("/api/omp-config/model-roles"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ patch: normalized }),
    signal,
  });
  const body = await parseBody(res);
  if (!res.ok || body.success !== true) {
    const error =
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(error);
  }
  return body.data as OmpConfigEntry;
}
