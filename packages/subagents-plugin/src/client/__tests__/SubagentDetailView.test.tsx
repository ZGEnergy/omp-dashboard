/**
 * SubagentDetailView — four-tier rendering test.
 *
 * Tier 1: entries present → renders entry rows.
 * Tier 2: running, no entries → activity + counters + footnote.
 * Tier 3: completed, no entries → result block.
 * Tier 4: no useful data → "No detail available yet."
 * Row mode: single-line summary, no body.
 *
 * See change: add-subagent-inspector.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { SubagentDetailView, type SessionStateLike } from "../SubagentDetailView.js";
import type { SubagentState } from "../types.js";
import { withUiPrimitiveProvider } from "@blackbelt-technology/dashboard-plugin-runtime/test-support";

// Mock markdown renderer — just pass-through the content so we can assert on it.
const MockMarkdown: React.FC<{ content: string }> = ({ content }) => <div data-testid="md">{content}</div>;

function makeSession(sub: SubagentState): SessionStateLike {
  return { subagents: new Map([[sub.id, sub]]) };
}

function emptySession(): SessionStateLike {
  return { subagents: new Map() };
}

function renderWithPrimitives(ui: React.ReactElement) {
  return render(withUiPrimitiveProvider({ "ui:markdown-content": MockMarkdown }, ui));
}

describe("SubagentDetailView", () => {
  afterEach(() => cleanup());

  it("renders 'not found' when agentId is missing from session", () => {
    renderWithPrimitives(<SubagentDetailView session={emptySession()} agentId="missing" />);
    expect(screen.getByText(/not found/i)).toBeTruthy();
  });

  it("Tier 1 — renders entries when present", () => {
    const session = makeSession({
      id: "a1",
      type: "Explore",
      description: "search",
      status: "running",
      displayName: "explorer",
      entries: [
        { kind: "tool", toolName: "Read", input: { file_path: "/foo.ts" }, output: "abc", ts: 1 },
        { kind: "text", text: "Hello world", ts: 2 },
        { kind: "thinking", text: "I should look here", ts: 3 },
      ],
    });
    renderWithPrimitives(<SubagentDetailView session={session} agentId="a1" />);
    expect(screen.getByText("Read")).toBeTruthy();
    expect(screen.getByText("/foo.ts")).toBeTruthy();
    expect(screen.getByText(/Hello world/)).toBeTruthy();
    expect(screen.getByText("Thinking")).toBeTruthy();
    // Tier 2 footnote must NOT be rendered
    expect(screen.queryByText(/Live timeline requires/i)).toBeNull();
  });

  it("Tier 2 — running, no entries: shows activity + counters + footnote", () => {
    const session = makeSession({
      id: "a1",
      type: "Explore",
      description: "search",
      status: "running",
      activity: "Reading src/foo.ts",
      toolUses: 5,
      tokens: { input: 100, output: 50, total: 150 },
    });
    renderWithPrimitives(<SubagentDetailView session={session} agentId="a1" />);
    expect(screen.getByText(/Reading src\/foo\.ts/)).toBeTruthy();
    expect(screen.getByText(/5 tool uses/)).toBeTruthy();
    expect(screen.getByText(/Live timeline requires/i)).toBeTruthy();
  });

  it("Tier 3 — completed, no entries: shows result block, no footnote", () => {
    const session = makeSession({
      id: "a1",
      type: "Explore",
      description: "search",
      status: "completed",
      result: "Found 3 issues.",
      durationMs: 1234,
      tokens: { input: 100, output: 50, total: 150 },
    });
    renderWithPrimitives(<SubagentDetailView session={session} agentId="a1" />);
    expect(screen.getByText(/Found 3 issues/)).toBeTruthy();
    // Tier 2 footnote must NOT render for completed agents
    expect(screen.queryByText(/Live timeline requires/i)).toBeNull();
  });

  it("Tier 4 — nothing useful yet: placeholder", () => {
    const session = makeSession({
      id: "a1",
      type: "Explore",
      description: "",
      status: "created",
    });
    renderWithPrimitives(<SubagentDetailView session={session} agentId="a1" />);
    expect(screen.getByText(/No detail available yet/i)).toBeTruthy();
  });

  it("row mode — single-line summary, no body", () => {
    const session = makeSession({
      id: "a1",
      type: "Explore",
      description: "search",
      status: "running",
      displayName: "deep-research",
      activity: "Reading docs",
      entries: [{ kind: "text", text: "should not render in row mode", ts: 1 }],
    });
    renderWithPrimitives(<SubagentDetailView session={session} agentId="a1" mode="row" />);
    expect(screen.getByText("deep-research")).toBeTruthy();
    expect(screen.getByText(/Reading docs/)).toBeTruthy();
    // Body content from entries must NOT render in row mode
    expect(screen.queryByText(/should not render in row mode/)).toBeNull();
  });
});
