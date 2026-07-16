import { describe, it, expect, afterEach, beforeAll, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { AskUserToolRenderer } from "../AskUserToolRenderer.js";
import { getToolRenderer } from "../registry.js";
import { ThemeProvider } from "../../ThemeProvider.js";
import type { ToolContext } from "../types.js";

afterEach(cleanup);

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((q: string) => ({
      matches: q === "(prefers-color-scheme: dark)",
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const ctx: ToolContext = { cwd: "/r", editors: [] };

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const questions = [
  { method: "input", title: "Project name" },
  { method: "select", title: "Language", options: ["TypeScript", "Go"] },
  { method: "confirm", title: "Init git?" },
  { method: "multiselect", title: "Tooling", options: ["ESLint", "Prettier", "Vitest"] },
];

describe("AskUserToolRenderer — batch", () => {
  it("renders every sub-question title and answer on reload (from toolDetails.results)", () => {
    renderWithTheme(
      <AskUserToolRenderer
        toolName="ask_user"
        args={{ method: "batch", title: "Project setup", questions }}
        status="complete"
        result={'User completed batch (4 answers).'}
        toolDetails={{
          method: "batch",
          cancelled: false,
          results: ["pi-plugin", "TypeScript", true, ["ESLint", "Vitest"]],
        }}
        context={ctx}
      />,
    );

    // All sub-question titles render.
    expect(screen.getByText("Project name")).toBeTruthy();
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Init git?")).toBeTruthy();
    expect(screen.getByText("Tooling")).toBeTruthy();

    // All answers render.
    expect(screen.getByText("pi-plugin")).toBeTruthy();
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("ESLint")).toBeTruthy();
    expect(screen.getByText("Vitest")).toBeTruthy();
  });

  it("shows a cancelled marker when the batch was cancelled", () => {
    renderWithTheme(
      <AskUserToolRenderer
        toolName="ask_user"
        args={{ method: "batch", title: "Project setup", questions }}
        status="complete"
        result={'User cancelled batch (0 of 4 answers submitted).'}
        toolDetails={{ method: "batch", cancelled: true, results: [] }}
        context={ctx}
      />,
    );
    expect(screen.getByText(/cancelled/i)).toBeTruthy();
  });
  it("maps core ask to the shared rich renderer", () => {
    expect(getToolRenderer("ask")).toBe(AskUserToolRenderer);
  });
});
describe("core ask renderer", () => {
  it("normalizes object options and renders selected results", async () => {
    const { normalizeAskToolView } = await import("../AskUserToolRenderer.js");
    const view = normalizeAskToolView(
      "ask",
      {
        questions: [{ id: "color", question: "Pick a color", options: [{ label: "Red", description: "warm" }, { label: "Blue" }] }],
      },
      {
        results: [{ id: "color", selectedOptions: ["Blue"] }],
        cancelled: false,
      },
    );
    expect(view.questions[0]).toMatchObject({ id: "color", question: "Pick a color", multi: false });
    expect(view.questions[0]?.options).toEqual([
      { label: "Red", description: "warm" },
      { label: "Blue" },
    ]);
    renderWithTheme(
      <AskUserToolRenderer
        toolName="ask"
        args={{ questions: [{ id: "color", question: "Pick a color", options: [{ label: "Red" }, { label: "Blue" }] }] }}
        status="complete"
        result={'User answered ask.\ncolor: ["Blue"]'}
        toolDetails={{ results: [{ id: "color", selectedOptions: ["Blue"] }], cancelled: false }}
        context={ctx}
      />,
    );
    expect(screen.getByText("Pick a color")).toBeTruthy();
    expect(screen.getByText("Red")).toBeTruthy();
    expect(screen.getByText("Blue")).toBeTruthy();
  });

  it("does not crash or render raw objects for malformed and empty options", async () => {
    const { normalizeAskToolView } = await import("../AskUserToolRenderer.js");
    const view = normalizeAskToolView("ask", {
      questions: [
        { id: "empty", question: "Free text", options: [] },
        { id: "bad", question: "Bad options", options: [null, 7, {}, { label: "" }] },
      ],
    });
    expect(view.questions.map((q) => q.options)).toEqual([[], []]);
    expect(() => renderWithTheme(
      <AskUserToolRenderer
        toolName="ask"
        args={{ questions: [{ id: "bad", question: "Bad options", options: [null, 7, {}, { label: "" }] }] }}
        status="running"
        context={ctx}
      />,
    )).not.toThrow();
    expect(screen.getByText("Bad options")).toBeTruthy();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

  it("renders cancelled core ask details", () => {
    renderWithTheme(
      <AskUserToolRenderer
        toolName="ask"
        args={{ questions: [{ id: "q", question: "Continue?", options: [{ label: "Yes" }] }] }}
        status="complete"
        result="User cancelled ask."
        toolDetails={{ results: [], cancelled: true }}
        context={ctx}
      />,
    );
    expect(screen.getByText(/cancelled/i)).toBeTruthy();
  });
});
