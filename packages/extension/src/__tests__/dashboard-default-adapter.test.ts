import { describe, it, expect } from "vitest";
import { DashboardDefaultAdapter } from "../dashboard-default-adapter.js";
import type { PromptRequest } from "../prompt-bus.js";

function makePrompt(overrides: Partial<PromptRequest> = {}): PromptRequest {
  return {
    id: "test-1",
    pipeline: "command",
    type: "select",
    question: "Pick one:",
    options: ["A", "B"],
    ...overrides,
  };
}

describe("DashboardDefaultAdapter", () => {
  it("has name 'dashboard-default'", () => {
    const adapter = new DashboardDefaultAdapter();
    expect(adapter.name).toBe("dashboard-default");
  });

  it("claims all prompts with generic-dialog component", () => {
    const adapter = new DashboardDefaultAdapter();
    const claim = adapter.onRequest(makePrompt());

    expect(claim).toEqual({
      component: {
        type: "generic-dialog",
        props: {
          question: "Pick one:",
          type: "select",
          options: ["A", "B"],
          defaultValue: undefined,
        },
      },
      placement: "inline",
    });
  });

  it("claims input prompts with correct props", () => {
    const adapter = new DashboardDefaultAdapter();
    const claim = adapter.onRequest(makePrompt({
      type: "input",
      question: "Name:",
      options: undefined,
      defaultValue: "default",
    }));

    expect(claim.component!.type).toBe("generic-dialog");
    expect(claim.component!.props.type).toBe("input");
    expect(claim.component!.props.defaultValue).toBe("default");
  });

  it("claims confirm prompts", () => {
    const adapter = new DashboardDefaultAdapter();
    const claim = adapter.onRequest(makePrompt({ type: "confirm", question: "Sure?" }));

    expect(claim.component!.type).toBe("generic-dialog");
    expect(claim.component!.props.type).toBe("confirm");
  });

  it("placement is always inline", () => {
    const adapter = new DashboardDefaultAdapter();
    const claim = adapter.onRequest(makePrompt({ pipeline: "architect-new" }));
    expect(claim.placement).toBe("inline");
  });

  it("onResponse does not throw", () => {
    const adapter = new DashboardDefaultAdapter();
    expect(() => adapter.onResponse({ id: "x", answer: "A", source: "tui" })).not.toThrow();
  });

  it("onCancel does not throw", () => {
    const adapter = new DashboardDefaultAdapter();
    expect(() => adapter.onCancel("x")).not.toThrow();
  });
});
