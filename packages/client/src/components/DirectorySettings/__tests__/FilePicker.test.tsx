import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilePicker } from "../FilePicker.js";

const CANDIDATES = [
  { path: "/repo/AGENTS.md", relPath: "AGENTS.md" },
  { path: "/repo/.omp/agents/Explore.md", relPath: ".omp/agents/Explore.md" },
  { path: "/repo/.omp/agents/react-expert.md", relPath: ".omp/agents/react-expert.md" },
  { path: "/repo/.omp/skills/autofix/SKILL.md", relPath: ".omp/skills/autofix/SKILL.md" },
];

function mockFetchOk(candidates = CANDIDATES) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: { candidates } }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("FilePicker tree", () => {
  it("folds flat candidates into directory rows and basename file rows", async () => {
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    await screen.findByText(".omp");
    // Directory rows appear as folded segments.
    expect(screen.getByText(".omp")).toBeDefined();
    expect(screen.getByText("agents")).toBeDefined();
    // File rows display only the basename, not the full relPath.
    expect(screen.getByText("Explore.md")).toBeDefined();
    expect(screen.getByText("react-expert.md")).toBeDefined();
    expect(screen.queryByText(".omp/agents/Explore.md")).toBeNull();
  });

  it("does not merge a single-child directory into its child", async () => {
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    await screen.findByText("skills");
    expect(screen.getByText("skills")).toBeDefined();
    expect(screen.getByText("autofix")).toBeDefined();
    expect(screen.getByText("SKILL.md")).toBeDefined();
  });

  it("calls onSelect with the clicked file candidate", async () => {
    mockFetchOk();
    const onSelect = vi.fn();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={onSelect} />);
    const agents = await screen.findByText("AGENTS.md");
    fireEvent.click(agents);
    expect(onSelect).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it("directory scope hits md-candidates with a cwd query", async () => {
    const fetchMock = mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/file/md-candidates");
    expect(url).toContain("cwd=%2Frepo");
  });

  it("global scope omits the cwd query", async () => {
    const fetchMock = mockFetchOk();
    render(<FilePicker selectedPath={null} onSelect={vi.fn()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/api/file/md-candidates");
    expect(url).not.toContain("cwd=");
  });
});

describe("FilePicker filter", () => {
  it("keeps a directory visible when a descendant matches and force-expands it", async () => {
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    await screen.findByText(".omp");
    fireEvent.change(screen.getByPlaceholderText("Filter…"), { target: { value: "Explore" } });
    // Matching branch stays visible & expanded.
    expect(screen.getByText(".omp")).toBeDefined();
    expect(screen.getByText("agents")).toBeDefined();
    expect(screen.getByText("Explore.md")).toBeDefined();
    // Non-matching leaves are filtered out.
    expect(screen.queryByText("react-expert.md")).toBeNull();
    expect(screen.queryByText("SKILL.md")).toBeNull();
  });
});

describe("FilePicker collapse persistence", () => {
  it("defaults every directory expanded with no persisted state", async () => {
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    await screen.findByText("agents");
    // Descendants visible ⇒ folders expanded.
    expect(screen.getByText("Explore.md")).toBeDefined();
    expect(screen.getByText("SKILL.md")).toBeDefined();
  });

  it("collapsing a directory hides its descendants and persists only that path", async () => {
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    const pi = await screen.findByText(".omp");
    fireEvent.click(pi);
    // `.omp` collapsed → its descendants gone.
    expect(screen.queryByText("agents")).toBeNull();
    expect(screen.queryByText("Explore.md")).toBeNull();
    const stored = JSON.parse(localStorage.getItem("dashboard:dirset-collapsed") ?? "[]");
    expect(stored).toEqual([".omp"]);
  });

  it("hydrates the collapsed set from localStorage on mount", async () => {
    localStorage.setItem("dashboard:dirset-collapsed", JSON.stringify([".omp"]));
    mockFetchOk();
    render(<FilePicker cwd="/repo" selectedPath={null} onSelect={vi.fn()} />);
    // `.omp` row renders but its children are hidden (collapsed on mount).
    await screen.findByText(".omp");
    expect(screen.queryByText("agents")).toBeNull();
    expect(screen.queryByText("Explore.md")).toBeNull();
    // Sibling top-level file unaffected.
    expect(screen.getByText("AGENTS.md")).toBeDefined();
  });
});
