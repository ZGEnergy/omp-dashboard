/**
 * GoalControl (demoted) — read-only link chip to the owning goal.
 *
 * After add-goals-folder-page (task 2.2) the session-card action-bar no
 * longer hosts the "Set a goal…" input or the set/pause/done/clear controls.
 * It renders nothing without an owning `goalId`, and a single link chip that
 * navigates to the goal's detail route when `goalId` is present.
 *
 * See change: add-goals-folder-page.
 */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { PluginContextProvider } from "@blackbelt-technology/dashboard-plugin-runtime";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { GoalControl } from "../client/GoalControl.js";
import { goalDetailUrl } from "../client/goals-api.js";

afterEach(() => cleanup());

function renderControl(session: DashboardSession, hook?: any) {
  return render(
    <Router hook={hook}>
      <PluginContextProvider>
        <GoalControl session={session} />
      </PluginContextProvider>
    </Router>,
  );
}

describe("GoalControl (demoted link chip)", () => {
  it("renders nothing when the session has no owning goalId", () => {
    const session = { id: "s1", cwd: "/repo", source: "dashboard" } as unknown as DashboardSession;
    const { queryByTestId } = renderControl(session);
    expect(queryByTestId("goal-control-link")).toBeNull();
  });

  it("renders nothing when goalId is present but cwd is missing", () => {
    const session = { id: "s1", source: "dashboard", goalId: "g1" } as unknown as DashboardSession;
    const { queryByTestId } = renderControl(session);
    expect(queryByTestId("goal-control-link")).toBeNull();
  });

  it("has no 'Set a goal…' input even when linked", () => {
    const session = { id: "s1", cwd: "/repo", source: "dashboard", goalId: "g1" } as unknown as DashboardSession;
    const { queryByPlaceholderText } = renderControl(session);
    expect(queryByPlaceholderText("Set a goal…")).toBeNull();
  });

  it("renders a link chip that navigates to the owning goal detail", () => {
    const { hook, history } = memoryLocation({ path: "/", record: true });
    const session = { id: "s1", cwd: "/repo", source: "dashboard", goalId: "g1" } as unknown as DashboardSession;
    const { getByTestId } = renderControl(session, hook);
    fireEvent.click(getByTestId("goal-control-link"));
    expect(history[history.length - 1]).toBe(goalDetailUrl("/repo", "g1"));
  });
});
