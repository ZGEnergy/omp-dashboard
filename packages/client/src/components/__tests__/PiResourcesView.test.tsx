import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { PiResourcesView } from "../PiResourcesView.js";
import type { PiResourcesResult } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

afterEach(() => cleanup());

const mockData: PiResourcesResult = {
  local: {
    extensions: [],
    skills: [
      { name: "code-review", description: "Review code quality.", filePath: "/project/.pi/skills/code-review/SKILL.md", type: "skill" },
    ],
    prompts: [
      { name: "opsx-apply", description: "Apply changes.", filePath: "/project/.pi/prompts/opsx-apply.md", type: "prompt" },
    ],
  },
  global: {
    extensions: [],
    skills: [],
    prompts: [],
  },
  packages: [
    {
      name: "pi-web-access",
      description: "Web search and fetch",
      source: "npm:pi-web-access",
      resources: {
        extensions: [{ name: "index", filePath: "/global/node_modules/pi-web-access/index.ts", type: "extension" }],
        skills: [],
        prompts: [],
      },
    },
  ],
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    json: () => Promise.resolve({ success: true, data: mockData }),
  } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PiResourcesView", () => {
  it("renders header with folder name and back button", async () => {
    render(<PiResourcesView cwd="/path/to/project" onBack={vi.fn()} onViewFile={vi.fn()} />);
    expect(await screen.findByText(/Pi Resources: project/)).toBeTruthy();
    expect(screen.getByTestId("pi-resources-back")).toBeTruthy();
  });

  it("shows local skills and prompts", async () => {
    render(<PiResourcesView cwd="/path/to/project" onBack={vi.fn()} onViewFile={vi.fn()} />);
    expect(await screen.findByText("code-review")).toBeTruthy();
    expect(screen.getByText("Review code quality.")).toBeTruthy();
    expect(screen.getByText("opsx-apply")).toBeTruthy();
  });

  it("shows global section as empty", async () => {
    render(<PiResourcesView cwd="/path/to/project" onBack={vi.fn()} onViewFile={vi.fn()} />);
    await screen.findByText("code-review");
    const globalSection = screen.getByTestId("scope-global");
    expect(globalSection.textContent).toContain("(none)");
  });

  it("shows packages", async () => {
    render(<PiResourcesView cwd="/path/to/project" onBack={vi.fn()} onViewFile={vi.fn()} />);
    // Package name and source both rendered
    const pkgSection = await screen.findByTestId("scope-packages");
    expect(pkgSection.textContent).toContain("pi-web-access");
    expect(pkgSection.textContent).toContain("npm:pi-web-access");
  });

  it("calls onViewFile when resource item is clicked", async () => {
    const onViewFile = vi.fn();
    render(<PiResourcesView cwd="/path/to/project" onBack={vi.fn()} onViewFile={onViewFile} />);
    await screen.findByText("code-review");
    const items = screen.getAllByTestId("resource-item");
    items[0].click();
    expect(onViewFile).toHaveBeenCalledWith("/project/.pi/skills/code-review/SKILL.md", "code-review");
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    render(<PiResourcesView cwd="/path/to/project" onBack={onBack} onViewFile={vi.fn()} />);
    await screen.findByText("code-review");
    screen.getByTestId("pi-resources-back").click();
    expect(onBack).toHaveBeenCalled();
  });
});
