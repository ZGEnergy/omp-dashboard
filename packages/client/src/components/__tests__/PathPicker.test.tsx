import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, screen, cleanup } from "@testing-library/react";
import React from "react";
import { PathPicker } from "../PathPicker.js";

// Mock browse-api
const mockBrowse = vi.fn();
vi.mock("../../lib/browse-api.js", () => ({
  browseDirectory: (...args: unknown[]) => mockBrowse(...args),
}));

function makeBrowseResult(
  current: string,
  entries: Array<{ name: string; isGit?: boolean; isPi?: boolean }>,
  parent: string | null = "/parent"
) {
  return {
    current,
    parent,
    entries: entries.map((e) => ({
      name: e.name,
      path: `${current}/${e.name}`,
      isGit: e.isGit ?? false,
      isPi: e.isPi ?? false,
    })),
  };
}

const homeEntries = makeBrowseResult("/Users/robson", [
  { name: "Desktop" },
  { name: "Documents" },
  { name: "Downloads" },
  { name: "Project", isGit: false, isPi: false },
]);

const projectEntries = makeBrowseResult("/Users/robson/Project", [
  { name: "pi-agent-dashboard", isGit: true, isPi: true },
  { name: "pi-coding-agent", isGit: true, isPi: true },
  { name: "pi-tools", isGit: true },
], "/Users/robson");

afterEach(() => cleanup());

describe("PathPicker", () => {
  const onSelect = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowse.mockResolvedValue(homeEntries);
  });

  function renderPicker(props: Partial<React.ComponentProps<typeof PathPicker>> = {}) {
    return render(
      <PathPicker
        initialPath="/Users/robson/"
        onSelect={onSelect}
        onCancel={onCancel}
        {...props}
      />
    );
  }

  function getInput(): HTMLInputElement {
    return screen.getByRole("textbox") as HTMLInputElement;
  }

  it("should render input with initial path and fetch entries", async () => {
    renderPicker();
    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith("/Users/robson");
    });
    expect(getInput().value).toBe("/Users/robson/");

    await waitFor(() => {
      expect(screen.getByText("Desktop")).toBeTruthy();
      expect(screen.getByText("Documents")).toBeTruthy();
    });
  });

  it("should show loading state while fetching", async () => {
    let resolve!: (v: unknown) => void;
    mockBrowse.mockReturnValue(new Promise((r) => (resolve = r)));
    renderPicker();
    expect(screen.getByText(/loading/i)).toBeTruthy();
    resolve(homeEntries);
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).toBeNull();
    });
  });

  it("should show .. entry for non-root directories", async () => {
    renderPicker();
    await waitFor(() => {
      expect(screen.getByText("Desktop")).toBeTruthy();
    });
    // ".." is rendered as text in an option role
    const options = screen.getAllByRole("option");
    const parentOption = options.find((o) => o.textContent?.includes(".."));
    expect(parentOption).toBeTruthy();
  });

  it("should filter entries when typing partial text", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    fireEvent.change(getInput(), { target: { value: "/Users/robson/Do" } });

    expect(screen.getByText("Documents")).toBeTruthy();
    expect(screen.getByText("Downloads")).toBeTruthy();
    expect(screen.queryByText("Desktop")).toBeNull();
    expect(screen.queryByText("Project")).toBeNull();
  });

  it("should descend into directory on click", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());

    mockBrowse.mockResolvedValue(projectEntries);
    fireEvent.click(screen.getByText("Project"));

    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith("/Users/robson/Project");
    });
    expect(getInput().value).toBe("/Users/robson/Project/");

    await waitFor(() => {
      expect(screen.getByText("pi-agent-dashboard")).toBeTruthy();
    });
  });

  it("should navigate to parent on .. click", async () => {
    mockBrowse.mockResolvedValue(projectEntries);
    renderPicker({ initialPath: "/Users/robson/Project/" });
    await waitFor(() => {
      const options = screen.getAllByRole("option");
      expect(options.find((o) => o.textContent?.includes(".."))).toBeTruthy();
    });

    mockBrowse.mockResolvedValue(homeEntries);
    const parentOption = screen.getAllByRole("option").find((o) => o.textContent?.includes(".."))!;
    fireEvent.click(parentOption);

    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith("/Users/robson");
    });
  });

  it("should move highlight with arrow keys", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    const input = getInput();

    // Arrow down twice — first highlights ".." (index 0), then "Desktop" (index 1)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const options = screen.getAllByRole("option");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
  });

  it("should descend on Tab with highlighted entry", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Project")).toBeTruthy());

    const input = getInput();

    // Navigate to "Project" (index 4: .., Desktop, Documents, Downloads, Project)
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }

    mockBrowse.mockResolvedValue(projectEntries);
    fireEvent.keyDown(input, { key: "Tab" });

    await waitFor(() => {
      expect(getInput().value).toBe("/Users/robson/Project/");
      expect(mockBrowse).toHaveBeenCalledWith("/Users/robson/Project");
    });
  });

  it("should auto-complete single match on Tab", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    fireEvent.change(getInput(), { target: { value: "/Users/robson/Pr" } });

    // Only "Project" matches — Tab should auto-complete
    mockBrowse.mockResolvedValue(projectEntries);
    fireEvent.keyDown(getInput(), { key: "Tab" });

    await waitFor(() => {
      expect(getInput().value).toBe("/Users/robson/Project/");
    });
  });

  it("should call onSelect on Enter", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    fireEvent.keyDown(getInput(), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("/Users/robson/");
  });

  it("should call onSelect when Select button clicked", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    fireEvent.click(screen.getByText("Select"));
    expect(onSelect).toHaveBeenCalledWith("/Users/robson/");
  });

  it("should disable Select button when input is empty", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    const input = getInput();
    fireEvent.change(input, { target: { value: "" } });

    const selectBtn = screen.getByText("Select");
    expect(selectBtn.hasAttribute("disabled")).toBe(true);
  });

  it("should call onCancel when Cancel button clicked", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("should call onCancel on Escape", async () => {
    renderPicker();
    fireEvent.keyDown(getInput(), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("should show git and pi indicators", async () => {
    mockBrowse.mockResolvedValue(projectEntries);
    renderPicker({ initialPath: "/Users/robson/Project/" });

    await waitFor(() => {
      expect(screen.getByText("pi-agent-dashboard")).toBeTruthy();
    });

    const dashboardRow = screen.getByText("pi-agent-dashboard").closest("[role='option']");
    expect(dashboardRow?.textContent).toMatch(/git/i);
    expect(dashboardRow?.textContent).toMatch(/pi/i);
  });

  it("should show 'No subdirectories' for empty directory", async () => {
    mockBrowse.mockResolvedValue(makeBrowseResult("/empty", [], "/"));
    renderPicker({ initialPath: "/empty/" });

    await waitFor(() => {
      expect(screen.getByText(/no subdirectories/i)).toBeTruthy();
    });
  });

  it("should show 'No matches' when filter matches nothing", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    fireEvent.change(getInput(), { target: { value: "/Users/robson/zzzzz" } });

    expect(screen.getByText(/no matches/i)).toBeTruthy();
  });

  it("should re-fetch parent on backspace past slash", async () => {
    mockBrowse.mockResolvedValue(projectEntries);
    renderPicker({ initialPath: "/Users/robson/Project/" });
    await waitFor(() => expect(screen.getByText("pi-agent-dashboard")).toBeTruthy());

    // Simulate changing input back to parent
    mockBrowse.mockResolvedValue(homeEntries);
    fireEvent.change(getInput(), { target: { value: "/Users/robson/" } });

    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith("/Users/robson");
    });
  });

  it("should default to home directory when no initialPath", async () => {
    const homeResult = {
      current: "/Users/robson",
      parent: "/Users",
      entries: [{ name: "Desktop", path: "/Users/robson/Desktop", isGit: false, isPi: false }],
    };
    mockBrowse.mockResolvedValue(homeResult);
    render(<PathPicker onSelect={onSelect} onCancel={onCancel} />);

    // Should call browseDirectory with no arg (server defaults to homedir)
    await waitFor(() => {
      expect(mockBrowse).toHaveBeenCalledWith(undefined);
    });

    // Input should be populated from server response
    await waitFor(() => {
      expect(getInput().value).toBe("/Users/robson/");
    });
  });

  it("should reset highlight when typing", async () => {
    renderPicker();
    await waitFor(() => expect(screen.getByText("Desktop")).toBeTruthy());

    const input = getInput();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    // Type — should reset highlight to -1
    fireEvent.change(input, { target: { value: "/Users/robson/D" } });

    const options = screen.getAllByRole("option");
    const selected = options.filter((r) => r.getAttribute("aria-selected") === "true");
    expect(selected.length).toBe(0);
  });
});
