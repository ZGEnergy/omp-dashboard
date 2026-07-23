/**
 * Regression guard for #79: an auto-detected canvas file target carries the
 * ABSOLUTE `args.path` pi Write/Edit record, but the editor-pane viewer +
 * /api/file backend key tabs by a cwd-relative path. CanvasDriver must
 * normalize the target path under `target.cwd` before `openInSplit`, else the
 * read resolves against the wrong string → "not found".
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasState } from "../../lib/canvas-gate.js";
import { CanvasDriver } from "../CanvasDriver.js";
import { SplitWorkspaceProvider, useSplitWorkspace } from "../SplitWorkspaceContext.js";

/** Probe: surfaces the first opened tab path + split mode into the DOM. */
function Probe() {
  const { paneState, split } = useSplitWorkspace();
  return (
    <>
      <span data-testid="open-path">{paneState.openFiles[0]?.path ?? ""}</span>
      <span data-testid="split-mode">{split.mode}</span>
    </>
  );
}

function renderDriver(state: CanvasState, cwd = "/proj") {
  return render(
    <SplitWorkspaceProvider sessionId="s1" cwd={cwd} orientation="h">
      <CanvasDriver state={state} />
      <Probe />
    </SplitWorkspaceProvider>,
  );
}

function fileState(path: string, cwd = "/proj"): CanvasState {
  return {
    target: { kind: "file", cwd, path },
    mode: "replace",
    phase: "settle",
    version: 1,
    chip: null,
  };
}

describe("CanvasDriver auto-open", () => {
  beforeEach(() => localStorage.clear());

  it("opens an absolute agent write path as its cwd-relative key", () => {
    renderDriver(fileState("/proj/report.md"));
    // #79 regression: the opened tab is the cwd-relative key, NOT the raw abs path.
    expect(screen.getByTestId("open-path").textContent).toBe("report.md");
    expect(screen.getByTestId("split-mode").textContent).toBe("split");
  });

  it("leaves an already-relative declare target path unchanged", () => {
    renderDriver(fileState("notes.md"));
    expect(screen.getByTestId("open-path").textContent).toBe("notes.md");
    expect(screen.getByTestId("split-mode").textContent).toBe("split");
  });
});
