import { describe, it, expect } from "vitest";
import { groupByDate, filterEntries } from "../useArchiveListing.js";
import type { ArchiveEntry } from "../useArchiveListing.js";

const ENTRIES: ArchiveEntry[] = [
  { name: "2026-04-02-git-branch-selector", date: "2026-04-02", artifacts: [{ id: "proposal", status: "done" }] },
  { name: "2026-04-02-theme-aware-code-rendering", date: "2026-04-02", artifacts: [{ id: "proposal", status: "done" }, { id: "design", status: "done" }] },
  { name: "2026-04-01-flow-dashboard-integration", date: "2026-04-01", artifacts: [{ id: "proposal", status: "done" }] },
  { name: "2026-03-29-oauth-authentication", date: "2026-03-29", artifacts: [{ id: "proposal", status: "done" }] },
];

describe("groupByDate", () => {
  it("groups entries by date, newest-first", () => {
    const groups = groupByDate(ENTRIES);
    expect(groups).toHaveLength(3);
    expect(groups[0].date).toBe("2026-04-02");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[1].date).toBe("2026-04-01");
    expect(groups[1].entries).toHaveLength(1);
    expect(groups[2].date).toBe("2026-03-29");
  });

  it("returns empty array for empty input", () => {
    expect(groupByDate([])).toEqual([]);
  });
});

describe("filterEntries", () => {
  it("filters by slug name (case-insensitive)", () => {
    const result = filterEntries(ENTRIES, "auth");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("2026-03-29-oauth-authentication");
  });

  it("returns all entries for empty query", () => {
    expect(filterEntries(ENTRIES, "")).toHaveLength(4);
    expect(filterEntries(ENTRIES, "  ")).toHaveLength(4);
  });

  it("returns empty array when no match", () => {
    expect(filterEntries(ENTRIES, "nonexistent")).toHaveLength(0);
  });

  it("matches partial slug", () => {
    const result = filterEntries(ENTRIES, "flow");
    expect(result).toHaveLength(1);
    expect(result[0].name).toContain("flow");
  });
});
