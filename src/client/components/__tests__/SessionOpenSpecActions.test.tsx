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

// PLANNING: not all artifacts done
const planningChange: OpenSpecChange = {
  name: "add-auth",
  status: "in-progress",
  completedTasks: 2,
  totalTasks: 5,
  artifacts: [
    { id: "proposal", status: "done" },
    { id: "design", status: "ready" },
  ],
};

// READY: all artifacts done, status no-tasks
const readyChange: OpenSpecChange = {
  name: "ready-change",
  status: "no-tasks",
  completedTasks: 0,
  totalTasks: 0,
  artifacts: [
    { id: "proposal", status: "done" },
    { id: "design", status: "done" },
    { id: "specs", status: "done" },
    { id: "tasks", status: "done" },
  ],
};

// IMPLEMENTING: all artifacts done, status in-progress
const implementingChange: OpenSpecChange = {
  name: "impl-change",
  status: "in-progress",
  completedTasks: 2,
  totalTasks: 5,
  artifacts: [
    { id: "proposal", status: "done" },
    { id: "design", status: "done" },
    { id: "specs", status: "done" },
    { id: "tasks", status: "done" },
  ],
};

// COMPLETE: all artifacts done, status complete
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
        changes={[planningChange, completeChange]}
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
        changes={[completeChange, planningChange]}
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
        changes={[planningChange]}
        {...defaultProps}
        onAttach={onAttach}
      />,
    );
    fireEvent.change(screen.getByTestId("attach-combo"), { target: { value: "add-auth" } });
    expect(onAttach).toHaveBeenCalledWith("add-auth");
  });

  // --- Unattached active state: + Change, Explore ---

  it("shows + Change and Explore buttons when active and unattached", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession()}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("new-change-btn")).toBeTruthy();
    expect(screen.getByTestId("explore-unattached-btn")).toBeTruthy();
  });

  it("hides + Change and Explore when ended and unattached", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ status: "ended" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.queryByTestId("new-change-btn")).toBeNull();
    expect(screen.queryByTestId("explore-unattached-btn")).toBeNull();
  });

  it("does not show + Change when a change is attached", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.queryByTestId("new-change-btn")).toBeNull();
  });

  // --- PDST single button ---

  it("shows PDST as a single button in attached state", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    const btn = screen.getByTestId("artifact-letters-btn");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toBe("PD");
  });

  // --- PLANNING state: Continue, FF, Explore ---

  it("shows Explore, Continue, FF for PLANNING state", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "active" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("attached-badge").textContent).toContain("add-auth");
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("continue-btn")).toBeTruthy();
    expect(screen.getByTestId("ff-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("read-btn")).toBeNull();
    expect(screen.queryByTestId("apply-btn")).toBeNull();
    expect(screen.queryByTestId("verify-btn")).toBeNull();
    expect(screen.queryByTestId("archive-btn")).toBeNull();
  });

  // --- READY state: Apply, Explore, Read ---

  it("shows Explore, Apply for READY state", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "ready-change", status: "active" })}
        changes={[readyChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("apply-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("read-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
    expect(screen.queryByTestId("verify-btn")).toBeNull();
    expect(screen.queryByTestId("archive-btn")).toBeNull();
  });

  // --- IMPLEMENTING state: Apply, Explore, Read ---

  it("shows Explore, Apply for IMPLEMENTING state", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "impl-change", status: "active" })}
        changes={[implementingChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("apply-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("read-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
    expect(screen.queryByTestId("verify-btn")).toBeNull();
    expect(screen.queryByTestId("archive-btn")).toBeNull();
  });

  // --- COMPLETE state: Verify, Archive, Explore, Read ---

  it("shows Explore, Verify, Archive for COMPLETE state", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "fix-bug", status: "active" })}
        changes={[completeChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByTestId("explore-btn")).toBeTruthy();
    expect(screen.getByTestId("verify-btn")).toBeTruthy();
    expect(screen.getByTestId("archive-btn")).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("read-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
    expect(screen.queryByTestId("apply-btn")).toBeNull();
  });

  // --- Blue badge color ---

  it("renders attached proposal name with text-blue-400", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    const badge = screen.getByTestId("attached-badge");
    const nameSpan = badge.querySelector(".text-blue-400");
    expect(nameSpan).toBeTruthy();
    expect(nameSpan!.textContent).toBe("add-auth");
  });

  // --- Action callbacks ---

  it("Continue sends correct prompt", () => {
    const onSendPrompt = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "active" })}
        changes={[planningChange]}
        {...defaultProps}
        onSendPrompt={onSendPrompt}
      />,
    );
    fireEvent.click(screen.getByTestId("continue-btn"));
    expect(onSendPrompt).toHaveBeenCalledWith("/opsx:continue add-auth");
  });

  it("Verify sends correct prompt", () => {
    const onSendPrompt = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "fix-bug", status: "active" })}
        changes={[completeChange]}
        {...defaultProps}
        onSendPrompt={onSendPrompt}
      />,
    );
    fireEvent.click(screen.getByTestId("verify-btn"));
    expect(onSendPrompt).toHaveBeenCalledWith("/opsx:verify fix-bug");
  });

  it("Apply sends correct prompt", () => {
    const onSendPrompt = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "ready-change", status: "active" })}
        changes={[readyChange]}
        {...defaultProps}
        onSendPrompt={onSendPrompt}
      />,
    );
    fireEvent.click(screen.getByTestId("apply-btn"));
    expect(onSendPrompt).toHaveBeenCalledWith("/opsx:apply ready-change");
  });

  it("Detach calls onDetach", () => {
    const onDetach = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "active" })}
        changes={[planningChange]}
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
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByText(/add-auth/)).toBeTruthy();
    expect(screen.queryByTestId("explore-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
    expect(screen.queryByTestId("ff-btn")).toBeNull();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
  });

  // --- PDST button calls onReadArtifact ---

  it("calls onReadArtifact with proposal when PDST button clicked", () => {
    const onReadArtifact = vi.fn();
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth" })}
        changes={[planningChange]}
        {...defaultProps}
        onReadArtifact={onReadArtifact}
      />,
    );
    fireEvent.click(screen.getByTestId("artifact-letters-btn"));
    expect(onReadArtifact).toHaveBeenCalledWith("add-auth", "proposal");
  });

  // --- Disabled when not active ---

  it("enables action buttons when session is idle", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "idle" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect((screen.getByTestId("explore-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("continue-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("ff-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables action buttons when session is streaming", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "streaming" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect((screen.getByTestId("explore-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("continue-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables action buttons when session is active", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "active" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect((screen.getByTestId("explore-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("continue-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables action buttons when session is streaming", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "add-auth", status: "streaming" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect((screen.getByTestId("explore-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("continue-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  // --- Attached change not found ---

  it("shows badge + Detach only when attached change not in data", () => {
    render(
      <SessionOpenSpecActions
        session={makeSession({ attachedProposal: "archived-change" })}
        changes={[planningChange]}
        {...defaultProps}
      />,
    );
    expect(screen.getByText(/archived-change/)).toBeTruthy();
    expect(screen.getByTestId("detach-btn")).toBeTruthy();
    expect(screen.queryByTestId("explore-btn")).toBeNull();
    expect(screen.queryByTestId("continue-btn")).toBeNull();
  });
});
