/**
 * Tests for the trimmed `FolderActionBar`.
 *
 * After change `elevate-folder-spawn-buttons`, the `+Session` and `+Worktree`
 * buttons are relocated to the elevated `FolderSpawnButtons` stack and SHALL
 * NOT appear in the action bar. This file pins their absence.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FolderActionBar } from "../FolderActionBar.js";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderBar(overrides: Partial<React.ComponentProps<typeof FolderActionBar>> = {}) {
  const props: React.ComponentProps<typeof FolderActionBar> = {
    cwd: "/repo",
    terminalCount: 0,
    nativeEditors: [],
    onOpenTerminals: () => {},
    onOpenEditor: () => {},
    onOpenNativeEditor: () => {},
    onOpenPiResources: () => {},
    ...overrides,
  };
  return render(<FolderActionBar {...props} />);
}

describe("FolderActionBar — spawn buttons relocated", () => {
  it("does NOT render the +Session button in the bar", () => {
    renderBar();
    expect(screen.queryByTestId("spawn-session-btn")).toBeNull();
    expect(screen.queryByTestId("folder-spawn-session-btn")).toBeNull();
  });

  it("does NOT render the +Worktree button in the bar", () => {
    renderBar();
    expect(screen.queryByTestId("spawn-worktree-btn")).toBeNull();
    expect(screen.queryByTestId("folder-spawn-worktree-btn")).toBeNull();
  });

  it("still renders the Terminals button", () => {
    renderBar({ terminalCount: 3 });
    expect(screen.getByText(/Terminals\(3\)/)).toBeTruthy();
  });
});
