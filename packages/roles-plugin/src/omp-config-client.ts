/**
 * Minimal same-origin client for `/api/omp-config` used by the roles plugin.
 * Kept local so the plugin does not depend on the dashboard client package.
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
  const res = await fetch("/api/omp-config", { signal });
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
  const res = await fetch("/api/omp-config", {
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

/** Re-read modelRoles then merge patch and write full record. */
export async function mergeOmpModelRoles(
  patch: Record<string, string | null | undefined>,
  signal?: AbortSignal,
): Promise<OmpConfigEntry> {
  const snap = await fetchOmpConfig(signal);
  const currentRaw = snap.settings.modelRoles?.value;
  const current: Record<string, string> = {};
  if (currentRaw && typeof currentRaw === "object" && !Array.isArray(currentRaw)) {
    for (const [k, v] of Object.entries(currentRaw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) current[k] = v.trim();
    }
  }
  const next = { ...current };
  for (const [role, modelId] of Object.entries(patch)) {
    if (modelId == null || modelId.trim() === "") delete next[role];
    else next[role] = modelId.trim();
  }
  return setOmpConfig("modelRoles", next, signal);
}
