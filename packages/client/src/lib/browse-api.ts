/**
 * Client-side browse API helper for the PathPicker component.
 */
import type { BrowseResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import { getApiBase } from "./api-context.js";

export async function browseDirectory(path?: string): Promise<BrowseResult> {
  const url = path
    ? `${getApiBase()}/api/browse?path=${encodeURIComponent(path)}`
    : `${getApiBase()}/api/browse`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? "browse failed");
  }
  return json.data;
}
