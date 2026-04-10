import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useMainSpecsReader } from "../useMainSpecsReader.js";

function mockFetch(responses: [string, any][]) {
  return vi.fn(async (url: string) => {
    for (const [pattern, body] of responses) {
      if (url.includes(pattern)) {
        return { json: async () => body };
      }
    }
    return { json: async () => ({ success: false, error: "Not found" }) };
  });
}

describe("useMainSpecsReader", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("returns sorted spec names and concatenated content", async () => {
    global.fetch = mockFetch([
      ["auth%2Fspec.md", {
        success: true,
        data: { type: "file", content: "Auth spec content" },
      }],
      ["billing%2Fspec.md", {
        success: true,
        data: { type: "file", content: "Billing spec content" },
      }],
      ["chat%2Fspec.md", {
        success: true,
        data: { type: "file", content: "Chat spec content" },
      }],
      ["path=openspec%2Fspecs", {
        success: true,
        data: { type: "directory", entries: ["chat", "auth", "billing"] },
      }],
    ]) as any;

    const { result } = renderHook(() => useMainSpecsReader("/project"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.specNames).toEqual(["auth", "billing", "chat"]);
    expect(result.current.content).toContain("# auth");
    expect(result.current.content).toContain("# billing");
    expect(result.current.content).toContain("# chat");
    expect(result.current.content).toContain("Auth spec content");
    expect(result.current.error).toBeUndefined();
  });

  it("sets loading state during fetch", async () => {
    let resolveDir: (v: any) => void;
    global.fetch = vi.fn(() => new Promise((r) => { resolveDir = r; })) as any;

    const { result } = renderHook(() => useMainSpecsReader("/project"));
    expect(result.current.isLoading).toBe(true);

    resolveDir!({
      json: async () => ({ success: true, data: { type: "directory", entries: [] } }),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("handles directory fetch error", async () => {
    global.fetch = mockFetch([
      ["path=openspec%2Fspecs", {
        success: false,
        error: "Directory not found",
      }],
    ]) as any;

    const { result } = renderHook(() => useMainSpecsReader("/project"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe("Directory not found");
    expect(result.current.specNames).toEqual([]);
    expect(result.current.content).toBeUndefined();
  });

  it("skips failed spec fetches gracefully", async () => {
    global.fetch = mockFetch([
      ["auth%2Fspec.md", {
        success: true,
        data: { type: "file", content: "Auth works" },
      }],
      ["broken%2Fspec.md", {
        success: false,
        error: "File not found",
      }],
      ["path=openspec%2Fspecs", {
        success: true,
        data: { type: "directory", entries: ["auth", "broken"] },
      }],
    ]) as any;

    const { result } = renderHook(() => useMainSpecsReader("/project"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toContain("# auth");
    expect(result.current.content).toContain("Auth works");
    expect(result.current.content).not.toContain("broken");
  });

  it("shows no specs message for empty directory", async () => {
    global.fetch = mockFetch([
      ["path=openspec%2Fspecs", {
        success: true,
        data: { type: "directory", entries: [] },
      }],
    ]) as any;

    const { result } = renderHook(() => useMainSpecsReader("/project"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.content).toBe("*No specs found.*");
    expect(result.current.specNames).toEqual([]);
  });
});
