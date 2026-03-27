import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { SessionOpenSpecActions } from "../SessionOpenSpecActions.js";
import type { DashboardSession, OpenSpecChange } from "../../../shared/types.js";

afterEach(() => cleanup());

function makeSession(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id: "s1",
    cwd: "/project/foo",
    source: "tui",
    status: "idle",
    startedAt: Date.now(),
    ...overrides,
  };
}

const inProgressChange: OpenSpecChange = {
  name: "add-auth",
  status: "in-progress",
  completedTasks: 2,
  totalTasks: 5,
  artifacts: [
    { id: "proposal", status: "done" },
    { id: "design", status: "ready" },
  ],
};

const completeChange: OpenSpecChange = {
  name: "fix-bug",
  status: "complete",
  completedTasks: 3,
  totalTasks: 3,
  artifacts: [
    { id: "proposal", status: "done" },
    { id: "design", status: "done" },
    { id: "specs", status: "done" },
    { id: "tasks", status: "done" },
  ],
};

const defaultProps = {
  onAttach: vi.fn(),
  onDetach: vi.fn(),
  onSendPrompt: vi.fn(),
};

describe("SessionOpenSpecActions", () => {
  // --- Combo box ---

  it("shows combo box when no proposal attached", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession()}
        changes={[inProgressChange, completeChange]}
        {...defaultProps}
      />,
    );
    const combo = screen.getByTestId("attach-combo") as HTMLSelectElement;
    expect(combo).toBeTruthy();
    expect(combo.options.length).toBe(3); // placeholder + 2 changes
  });

  it("combo box is disabled when no changes", () => {
    render(
      <SessionOpenSpecActions session={makeSession()} changes={[]} {...defaultProps} />,
    );
    const combo = screen.getByTestId("attach-combo") as HTMLSelectElement;
    expect(combo.disabled).toBe(true);
    expect(combo.options[0].text).toBe("No changes");
  });

  it("sorts in-progress before complete in combo", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession()}
        changes={[completeChange, inProgressChange]}
        {...defaultProps}
      />,
    );
    const combo = screen.getByTestId("attach-combo") as HTMLSelectElement;
    expect(combo.options[1].value).toBe("add-auth");
    expect(combo.options[2].value).toBe("fix-bug");
  });

  it("calls onAttach when change selected", () => {
    const onAttach = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession()}
        changes={[inProgressChange]}
        {...defaultProps}
        onAttach={onAttach}
      />,
    );
    fireEvent.change(screen.getByTestId("attach-combo"), { target: { value: "add-auth" } });
    expect(onAttach).toHaveBeenCalledWith("add-auth");
  });

  // --- Attached state: in-progress ---

  it("shows badge and action buttons for in-progress change", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[inProgressChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("attached-badge").textContent).toContain("add-auth");
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("continue-btn")).toBeTruthy();
    expect(screen.getByTestId("ff-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("apply-btn")).toBeNull(); // not all artifacts done
    expect(screen.queryByTestId("archive-btn")).toBeNull(); // not complete
  });

  // --- Attached state: complete ---

  it("shows Explore, Archive, Detach for complete change", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "fix-bug" })}
        changes={[completeChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("archive-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
  });

  it("shows Apply button when all artifacts done", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "fix-bug" })}
        changes={[completeChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("apply-btn")).toBeTruthy();
  });

  // --- Action callbacks ---

  it("Continue sends correct prompt", () => {
    const onSendPrompt = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[inProgressChange]}
        {...defaultProps}
        onSendPrompt={onSendPrompt}
      />,
    );
    fireEvent.click(screen.getByTestId("continue-btn"));
    expect(onSendPrompt).toHaveBeenCalledWith("/opsx:continue add-auth");
  });

  it("Detach calls onDetach", () => {
    const onDetach = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[inProgressChange]}
        {...defaultProps}
        onDetach={onDetach}
      />,
    );
    fireEvent.click(screen.getByTestId("detach-btn"));
    expect(onDetach).toHaveBeenCalledOnce();
  });

  // --- Ended session ---

  it("hides LLM action buttons when session is ended", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "ended" })}
        changes={[inProgressChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByText(/add-auth/)).toBeTruthy();
    expect(screen.queryByTestId("explore-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
  });

  // --- Read button ---

  it("shows Read button when attached change has artifacts", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[inProgressChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("read-btn")).toBeTruthy();
  });

  it("calls onReadArtifact with first artifact when Read clicked", () => {
    const onReadArtifact = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[inProgressChange]}
        {...defaultProps}
        onReadArtifact={onReadArtifact}
      />,
    );
    fireEvent.click(screen.getByTestId("read-btn"));
    expect(onReadArtifact).toHaveBeenCalledWith("add-auth", "proposal");
  });

  // --- Attached change not found ---

  it("shows badge + Detach only when attached change not in data", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "archived-change" })}
        changes={[inProgressChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByText(/archived-change/)).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("explore-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
  });
});
