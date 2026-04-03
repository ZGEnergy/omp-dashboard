import { describe, it, expect, vi, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { EditToolRenderer } from "../tool-renderers/EditToolRenderer.js";
import type { ToolContext } from "../tool-renderers/types.js";

const ctx: ToolContext = { editors: [] };

describe("EditToolRenderer", () => {
  it("renders a single DiffView for oldText/newText args", () => {
    const { container } = render(
      <EditToolRenderer
        toolName="edit"
        args={{ path: "file.ts", oldText: "const a = 1;", newText: "const a = 2;" }}
        status="complete"
        context={ctx}
      />,
    );

    // Should show diff lines (green for additions, red for deletions)
    const lines = container.querySelectorAll("div.font-mono > div");
    const greenLines = Array.from(lines).filter((el) => el.className.includes("text-[var(--accent-green)]"));
    const redLines = Array.from(lines).filter((el) => el.className.includes("text-[var(--accent-red)]"));
    expect(greenLines.length).toBeGreaterThan(0);
    expect(redLines.length).toBeGreaterThan(0);
  });

  it("renders stacked DiffViews for edits[] array", () => {
    const { container } = render(
      <EditToolRenderer
        toolName="edit"
        args={{
          path: "file.ts",
          edits: [
            { oldText: "const a = 1;", newText: "const a = 2;" },
            { oldText: "const b = 3;", newText: "const b = 4;" },
          ],
        }}
        status="complete"
        context={ctx}
      />,
    );

    // Should have two diff blocks (two .font-mono containers)
    const diffBlocks = container.querySelectorAll("div.font-mono");
    expect(diffBlocks.length).toBe(2);

    // Each should have green and red lines
    for (const block of diffBlocks) {
      const greenLines = Array.from(block.querySelectorAll("div")).filter((el) =>
        el.className.includes("text-[var(--accent-green)]"),
      );
      const redLines = Array.from(block.querySelectorAll("div")).filter((el) =>
        el.className.includes("text-[var(--accent-red)]"),
      );
      expect(greenLines.length).toBeGreaterThan(0);
      expect(redLines.length).toBeGreaterThan(0);
    }
  });

  it("falls back to raw JSON when neither format is present", () => {
    const { container } = render(
      <EditToolRenderer
        toolName="edit"
        args={{ path: "file.ts" }}
        status="complete"
        context={ctx}
      />,
    );

    // Should render a <pre> with JSON content, no diff blocks
    const pre = container.querySelector("pre");
    expect(pre).toBeTruthy();
    expect(pre!.textContent).toContain('"path"');
    const diffBlocks = container.querySelectorAll("div.font-mono");
    expect(diffBlocks.length).toBe(0);
  });
});
