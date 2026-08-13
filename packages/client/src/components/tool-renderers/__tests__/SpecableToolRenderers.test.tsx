import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AstToolRenderer } from "../AstToolRenderer.js";
import { BrowserToolRenderer } from "../BrowserToolRenderer.js";
import { EditToolRenderer } from "../EditToolRenderer.js";
import { EvalToolRenderer } from "../EvalToolRenderer.js";
import { GithubToolRenderer } from "../GithubToolRenderer.js";
import { GoalToolRenderer } from "../GoalToolRenderer.js";
import { HubToolRenderer } from "../HubToolRenderer.js";
import { ImageToolRenderer } from "../ImageToolRenderer.js";
import { KnowledgeToolRenderer } from "../KnowledgeToolRenderer.js";
import { LspToolRenderer } from "../LspToolRenderer.js";
import { ReadToolRenderer } from "../ReadToolRenderer.js";
import { ResolveRejectToolRenderer } from "../ResolveRejectToolRenderer.js";
import { getToolRenderer } from "../registry.js";
import { SearchToolRenderer } from "../SearchToolRenderer.js";
import { TaskToolRenderer } from "../TaskToolRenderer.js";
import { ThinkToolRenderer } from "../ThinkToolRenderer.js";
import { TodoToolRenderer } from "../TodoToolRenderer.js";
import type { ToolContext } from "../types.js";

const ctx: ToolContext = { cwd: "/root" };

describe("SpecableToolRenderers", () => {
  it("renders resolve banner with green check and reason", () => {
    const { container } = render(
      <ResolveRejectToolRenderer
        toolName="resolve"
        status="complete"
        args={{ reason: "All tests passing" }}
        context={ctx}
      />,
    );
    expect(screen.getByTestId("resolve-banner")).toBeDefined();
    expect(container.textContent).toContain("Task Resolved");
    expect(container.textContent).toContain("All tests passing");
  });

  it("renders reject banner with alert icon and reason", () => {
    const { container } = render(
      <ResolveRejectToolRenderer
        toolName="reject"
        status="error"
        args={{ reason: "Build failed" }}
        context={ctx}
      />,
    );
    expect(screen.getByTestId("reject-banner")).toBeDefined();
    expect(container.textContent).toContain("Task Rejected");
    expect(container.textContent).toContain("Build failed");
  });

  it("renders eval card with language badge and code snippet", () => {
    const { container } = render(
      <EvalToolRenderer
        toolName="eval"
        status="complete"
        args={{ language: "py", code: "print('hello')" }}
        result="hello\n"
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("py");
    expect(container.textContent).toContain("print('hello')");
    expect(container.textContent).toContain("hello");
  });

  it("renders browser card with action badge and url", () => {
    const { container } = render(
      <BrowserToolRenderer
        toolName="browser"
        status="complete"
        args={{ action: "navigate", url: "https://example.com" }}
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("navigate");
    expect(container.textContent).toContain("https://example.com");
  });

  it("renders task card with agent type and description", () => {
    const { container } = render(
      <TaskToolRenderer
        toolName="task"
        status="complete"
        args={{ agent: "reviewer", name: "PR Check", task: "Audit code" }}
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("reviewer");
    expect(container.textContent).toContain("PR Check");
    expect(container.textContent).toContain("Audit code");
  });

  it("renders hub card with operation badge and target", () => {
    const { container } = render(
      <HubToolRenderer
        toolName="hub"
        status="complete"
        args={{ op: "send", to: "worker1", message: "Ping" }}
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("send");
    expect(container.textContent).toContain("worker1");
    expect(container.textContent).toContain("Ping");
  });

  it("renders todo card with checkbox list", () => {
    const { container } = render(
      <TodoToolRenderer
        toolName="todo"
        status="complete"
        args={{ action: "list", todos: [{ title: "First task", completed: true }, { title: "Second task", completed: false }] }}
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("list");
    expect(container.textContent).toContain("First task");
    expect(container.textContent).toContain("Second task");
  });

  it("renders goal card with objective and status", () => {
    const { container } = render(
      <GoalToolRenderer
        toolName="goal"
        status="complete"
        args={{ objective: "Finish feature", status: "accomplished" }}
        context={ctx}
      />,
    );
    expect(container.textContent?.toLowerCase()).toContain("accomplished");
    expect(container.textContent).toContain("Finish feature");
  });

  it("renders think card with reasoning block", () => {
    const { container } = render(
      <ThinkToolRenderer
        toolName="think"
        status="complete"
        args={{ thought: "I should analyze the codebase first" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("Reasoning / Thought");
    expect(container.textContent).toContain("I should analyze the codebase first");
  });

  it("renders ast card with pattern and path", () => {
    const { container } = render(
      <AstToolRenderer
        toolName="ast_grep"
        status="complete"
        args={{ path: "src/index.ts", pattern: "function foo($A)" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("ast_grep");
    expect(container.textContent).toContain("src/index.ts");
    expect(container.textContent).toContain("function foo($A)");
  });

  it("renders lsp card with command and file", () => {
    const { container } = render(
      <LspToolRenderer
        toolName="lsp"
        status="complete"
        args={{ command: "definition", path: "src/main.ts" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("LSP definition");
    expect(container.textContent).toContain("src/main.ts");
  });

  it("renders search card for web_search/grep/glob/find", () => {
    const { container } = render(
      <SearchToolRenderer
        toolName="web_search"
        status="complete"
        args={{ query: "vitest react" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("web_search");
    expect(container.textContent).toContain("vitest react");
  });

  it("renders github card with operation and issue number", () => {
    const { container } = render(
      <GithubToolRenderer
        toolName="github"
        status="complete"
        args={{ op: "pr_view", repo: "ZGEnergy/omp-dashboard", pr: 120 }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("github pr_view");
    expect(container.textContent).toContain("ZGEnergy/omp-dashboard");
    expect(container.textContent).toContain("#120");
  });

  it("renders knowledge card with key and memory text", () => {
    const { container } = render(
      <KnowledgeToolRenderer
        toolName="retain"
        status="complete"
        args={{ key: "user_pref", value: "dark mode" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("retain");
    expect(container.textContent).toContain("user_pref");
    expect(container.textContent).toContain("dark mode");
  });

  it("renders image card with prompt and images", () => {
    const { container } = render(
      <ImageToolRenderer
        toolName="generate_image"
        status="complete"
        args={{ prompt: "A glowing red cube" }}
        context={ctx}
      />,
    );
    expect(container.textContent).toContain("generate_image");
    expect(container.textContent).toContain("A glowing red cube");
  });

  it("maps registry aliases correctly", () => {
    expect(getToolRenderer("fetch")).toBe(ReadToolRenderer);
    expect(getToolRenderer("apply_patch")).toBe(EditToolRenderer);
    expect(getToolRenderer("resolve")).toBe(ResolveRejectToolRenderer);
    expect(getToolRenderer("reject")).toBe(ResolveRejectToolRenderer);
    expect(getToolRenderer("eval")).toBe(EvalToolRenderer);
    expect(getToolRenderer("browser")).toBe(BrowserToolRenderer);
  });
});
