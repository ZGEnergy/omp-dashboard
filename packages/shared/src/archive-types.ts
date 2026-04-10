/**
 * Type for OpenSpec archive entries. Shared between server and client.
 */
export interface ArchiveEntry {
  /** Full directory name, e.g. "2026-03-27-openspec-artifact-reader" */
  name: string;
  /** Date extracted from the prefix, e.g. "2026-03-27" */
  date: string;
  /** Detected artifacts with status "done" */
  artifacts: { id: string; status: "done" }[];
}
