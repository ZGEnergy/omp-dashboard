import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useOpenSpecReader } from "../useOpenSpecReader.js";
import type { OpenSpecArtifact } from "@blackbelt-technology/pi-dashboard-shared/types.js";

const CWD = "/test/project";
const CHANGE = "my-change";

const ARTIFACTS: OpenSpecArtifact[] = [
  { id: "proposal", status: "done" },
  { id: "specs", status: "done" },
  { id: "design", status: "ready" },
  { id: "tasks", status: "blocked" },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFileResponse(content: string) {
  return Promise.resolve({
    json: () => Promise.resolve({ success: true, data: { type: "file", content } }),
  });
}

function mockDirResponse(entries: string[]) {
  return Promise.resolve({
    json: () => Promise.resolve({ success: true, data: { type: "directory", entries } }),
  });
}

function mockErrorResponse(error: string) {
  return Promise.resolve({
    json: () => Promise.resolve({ success: false, error }),
  });
}

describe("useOpenSpecReader", () => {
  it("fetches single file artifact on mount", async () => {
    fetchMock.mockReturnValue(mockFileResponse("# Proposal content"));

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "proposal", ARTIFACTS)
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toBe("# Proposal content");
    expect(result.current.error).toBeUndefined();
    expect(result.current.activeTab).toBe("proposal");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("path=openspec%2Fchanges%2Fmy-change%2Fproposal.md")
    );
  });

  it("fetches and concatenates specs from directory", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("path=openspec%2Fchanges%2Fmy-change%2Fspecs")) {
        if (url.includes("auth%2Fspec.md")) return mockFileResponse("Auth spec");
        if (url.includes("data%2Fspec.md")) return mockFileResponse("Data spec");
        return mockDirResponse(["auth", "data"]);
      }
      return mockErrorResponse("unexpected");
    });

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "specs", ARTIFACTS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toContain("# auth");
    expect(result.current.content).toContain("Auth spec");
    expect(result.current.content).toContain("# data");
    expect(result.current.content).toContain("Data spec");
    expect(result.current.content).toContain("---");
  });

  it("sets error on fetch failure", async () => {
    fetchMock.mockReturnValue(mockErrorResponse("not found"));

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "proposal", ARTIFACTS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("not found");
    expect(result.current.content).toBeUndefined();
  });

  it("builds correct tabs from artifacts", () => {
    fetchMock.mockReturnValue(mockFileResponse("content"));

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "proposal", ARTIFACTS)
    );

    expect(result.current.tabs).toEqual([
      { id: "proposal", label: "Proposal", colorClass: "text-green-500" },
      { id: "specs", label: "Specs", colorClass: "text-green-500" },
      { id: "design", label: "Design", colorClass: "text-yellow-500" },
      { id: "tasks", label: "Tasks", colorClass: "text-[var(--text-muted)]" },
    ]);
  });

  it("uses archive path when archive flag is true", async () => {
    fetchMock.mockReturnValue(mockFileResponse("# Archived proposal"));

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "proposal", ARTIFACTS, true)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toBe("# Archived proposal");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("path=openspec%2Fchanges%2Farchive%2Fmy-change%2Fproposal.md")
    );
  });

  it("uses archive path for specs directory when archive flag is true", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("path=openspec%2Fchanges%2Farchive%2Fmy-change%2Fspecs")) {
        if (url.includes("auth%2Fspec.md")) return mockFileResponse("Auth spec");
        return mockDirResponse(["auth"]);
      }
      return mockErrorResponse("unexpected");
    });

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "specs", ARTIFACTS, true)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toContain("# auth");
    expect(result.current.content).toContain("Auth spec");
  });

  it("refetches when tab changes", async () => {
    fetchMock.mockReturnValue(mockFileResponse("proposal content"));

    const { result } = renderHook(() =>
      useOpenSpecReader(CWD, CHANGE, "proposal", ARTIFACTS)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetchMock.mockReturnValue(mockFileResponse("design content"));

    act(() => result.current.setActiveTab("design"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toBe("design content");
    expect(result.current.activeTab).toBe("design");
  });
});
