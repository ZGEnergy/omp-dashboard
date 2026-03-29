/**
 * Client-side browse API helper for the PathPicker component.
 */
import type { BrowseResult } from "../../shared/rest-api.js";

export async function browseDirectory(path?: string): Promise<BrowseResult> {
  const url = path
    ? `/api/browse?path=${encodeURIComponent(path)}`
    : "/api/browse";
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error ?? "browse failed");
  }
  return json.data;
}
