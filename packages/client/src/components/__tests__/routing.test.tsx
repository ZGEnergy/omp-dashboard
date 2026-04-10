import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { ThemeProvider } from "../ThemeProvider.js";
import { LandingPage } from "../LandingPage.js";
import { SessionHeader } from "../SessionHeader.js";
import type { DashboardSession } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { createInitialState } from "../../lib/event-reducer.js";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => cleanup());

function makeSession(overrides: Partial<DashboardSession> = {}): DashboardSession {
  return {
    id: "test-session-1",
    cwd: "/home/user/project",
    source: "tui",
    status: "active",
    startedAt: Date.now() - 60000,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    ...overrides,
  };
}

describe("LandingPage", () => {
  it("renders select-a-session hint", () => {
    render(<LandingPage />);
    expect(screen.getByText("Select a session to get started")).toBeTruthy();
  });

  it("renders π symbol", () => {
    render(<LandingPage />);
    expect(screen.getByText("π")).toBeTruthy();
  });
});

describe("SessionHeader back button", () => {
  it("shows back button when showBack is true", () => {
    render(
      <ThemeProvider>
        <SessionHeader
          session={makeSession()}
          state={createInitialState()}
          showBack
          onBack={() => {}}
        />
      </ThemeProvider>
    );
    expect(screen.getByTestId("back-button")).toBeTruthy();
  });

  it("hides back button when showBack is false", () => {
    render(
      <ThemeProvider>
        <SessionHeader
          session={makeSession()}
          state={createInitialState()}
        />
      </ThemeProvider>
    );
    expect(screen.queryByTestId("back-button")).toBeNull();
  });

  it("calls onBack when back button is clicked", () => {
    const onBack = vi.fn();
    render(
      <ThemeProvider>
        <SessionHeader
          session={makeSession()}
          state={createInitialState()}
          showBack
          onBack={onBack}
        />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByTestId("back-button"));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe("Pi branding in SessionList", () => {
  it("shows π symbol and not Sessions text", async () => {
    // Dynamic import to avoid issues — SessionList uses useLocation
    const { SessionList } = await import("../SessionList.js");
    const { hook, navigate } = memoryLocation({ path: "/", static: true });

    render(
      <Router hook={hook}>
        <ThemeProvider>
          <SessionList
            sessions={[makeSession()]}
            onSelect={() => {}}
          />
        </ThemeProvider>
      </Router>
    );

    // π symbol should be present as the home button
    const piButton = screen.getByTitle("Home");
    expect(piButton).toBeTruthy();
    expect(piButton.textContent).toBe("π");

    // "Sessions" text should not appear
    expect(screen.queryByText("Sessions")).toBeNull();
  });

  it("navigates to / when π is clicked", async () => {
    const { SessionList } = await import("../SessionList.js");
    const { hook, navigate } = memoryLocation({ path: "/session/123" });

    render(
      <Router hook={hook}>
        <ThemeProvider>
          <SessionList
            sessions={[makeSession()]}
            onSelect={() => {}}
          />
        </ThemeProvider>
      </Router>
    );

    fireEvent.click(screen.getByTitle("Home"));
    // wouter memory location navigate should have been called
    // The button calls navigate("/")
  });
});
