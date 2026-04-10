/**
 * Base64url encode/decode for folder paths in URL routes.
 * Encodes cwd paths to URL-safe strings for use in /folder/:encodedCwd/* routes.
 */

export function encodeFolderPath(cwd: string): string {
  return btoa(cwd)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeFolderPath(encoded: string): string | null {
  try {
    // Restore base64 padding and characters
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (padded.length % 4)) % 4;
    return atob(padded + "=".repeat(pad));
  } catch {
    return null;
  }
}
