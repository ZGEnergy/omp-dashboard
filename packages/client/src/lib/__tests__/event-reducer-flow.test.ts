import { describe, it, expect } from "vitest";
import { createInitialState, reduceEvent, addInteractiveRequest } from "../event-reducer.js";
import { reduceArchitectEvent } from "../architect-reducer.js";
import type { DashboardEvent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

function makeEvent(eventType: string, data: Record<string, unknown> = {}): DashboardEvent {
  return { eventType, timestamp: Date.now(), data };
}

describe("event-reducer flow events", () => {
  it("flow_started creates flow state with agents", () => {
    const state = createInitialState();
    const next = reduceEvent(state, makeEvent("flow_started", {
      flowName: "research",
      task: "Find bugs",
      autonomousMode: false,
      steps: [
        { id: "r", stepType: "agent", agent: "researcher", blockedBy: [] },
        { id: "d", stepType: "agent", agent: "developer", blockedBy: ["r"] },
        { id: "f1", stepType: "fork", question: "which?" },
      ],
    }));
    expect(next.flowState).not.toBeNull();
    expect(next.flowState!.flowName).toBe("research");
    expect(next.flowState!.task).toBe("Find bugs");
    expect(next.flowState!.status).toBe("running");
    expect(next.flowState!.agents.size).toBe(2); // fork step excluded
    expect(next.flowState!.agents.get("researcher")!.status).toBe("pending");
    expect(next.flowState!.agents.get("developer")!.blockedBy).toEqual(["r"]);
  });

  it("flow_agent_started sets agent to running with config", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_agent_started", {
      agentName: "researcher",
      stepId: "r",
      config: { name: "researcher", model: "@research", card: { label: "Research", role: "@research" } },
    }));
    const agent = state.flowState!.agents.get("researcher")!;
    expect(agent.status).toBe("running");
    expect(agent.label).toBe("Research");
    expect(agent.model).toBe("@research");
  });

  it("flow_agent_complete sets agent status and tokens", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_agent_complete", {
      agentName: "researcher",
      stepId: "r",
      result: { success: true, status: "complete", tokens: { input: 3000, output: 1000 }, duration: 12000, files: ["a.ts"] },
    }));
    const agent = state.flowState!.agents.get("researcher")!;
    expect(agent.status).toBe("complete");
    expect(agent.tokens).toEqual({ input: 3000, output: 1000 });
    expect(agent.duration).toBe(12000);
    expect(agent.files).toEqual(["a.ts"]);
  });

  it("flow_agent_complete with error sets error status", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_agent_complete", {
      agentName: "researcher",
      result: { success: false, status: "error", tokens: { input: 100, output: 50 }, duration: 1000 },
    }));
    expect(state.flowState!.agents.get("researcher")!.status).toBe("error");
  });

  it("flow_tool_call adds to recentTools and detailHistory", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_tool_call", {
      agentName: "researcher", toolName: "read", input: { path: "src/foo.ts" },
    }));
    const agent = state.flowState!.agents.get("researcher")!;
    expect(agent.recentTools).toHaveLength(1);
    expect(agent.recentTools[0].toolName).toBe("read");
    expect(agent.recentTools[0].inputPreview).toBe("foo.ts");
    expect(agent.detailHistory).toHaveLength(1);
    expect(agent.detailHistory[0].kind).toBe("tool");
  });

  it("flow_tool_result updates last tool entry", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_tool_call", {
      agentName: "researcher", toolName: "read", input: { path: "x.ts" },
    }));
    state = reduceEvent(state, makeEvent("flow_tool_result", {
      agentName: "researcher", toolName: "read", output: "file contents", isError: false,
    }));
    const entry = state.flowState!.agents.get("researcher")!.detailHistory[0];
    expect(entry.kind).toBe("tool");
    if (entry.kind === "tool") {
      expect(entry.output).toBe("file contents");
      expect(entry.isError).toBe(false);
    }
  });

  it("flow_assistant_text and flow_thinking_text append to detailHistory", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_assistant_text", { agentName: "researcher", text: "I found..." }));
    state = reduceEvent(state, makeEvent("flow_thinking_text", { agentName: "researcher", text: "Let me think..." }));
    const history = state.flowState!.agents.get("researcher")!.detailHistory;
    expect(history).toHaveLength(2);
    expect(history[0].kind).toBe("text");
    expect(history[1].kind).toBe("thinking");
  });

  it("flow_loop_iteration updates target agent", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "d", stepType: "agent", agent: "developer", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_loop_iteration", {
      stepId: "verify", loopTarget: "developer", iteration: 2, maxIterations: 3,
    }));
    const agent = state.flowState!.agents.get("developer")!;
    expect(agent.loopIteration).toBe(2);
    expect(agent.loopMax).toBe(3);
  });

  it("flow_complete sets final status and result", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    state = reduceEvent(state, makeEvent("flow_complete", {
      status: "success", flowName: "test", results: { researcher: { status: "complete" } },
    }));
    expect(state.flowState!.status).toBe("success");
    expect(state.flowState!.flowResult).toBeDefined();
  });

  it("recentTools keeps only last 3", () => {
    let state = createInitialState();
    state = reduceEvent(state, makeEvent("flow_started", {
      flowName: "test", task: "", steps: [{ id: "r", stepType: "agent", agent: "researcher", blockedBy: [] }],
    }));
    for (let i = 0; i < 5; i++) {
      state = reduceEvent(state, makeEvent("flow_tool_call", {
        agentName: "researcher", toolName: `tool${i}`, input: {},
      }));
    }
    expect(state.flowState!.agents.get("researcher")!.recentTools).toHaveLength(3);
    expect(state.flowState!.agents.get("researcher")!.recentTools[2].toolName).toBe("tool4");
  });

  it("flow events without flow_started are ignored", () => {
    const state = createInitialState();
    const next = reduceEvent(state, makeEvent("flow_agent_started", { agentName: "x" }));
    expect(next.flowState).toBeNull();
  });
});

describe("architect prompt suppression", () => {
  it("suppresses extension_ui_request when architectState has matching pendingPrompt", () => {
    let state = createInitialState();
    // Set up architect state with pending prompt
    let archState = reduceArchitectEvent(null, makeEvent("architect_started", { mode: "new", iteration: 1 }));
    archState = reduceArchitectEvent(archState, makeEvent("architect_prompt_request", {
      id: "prompt-1",
      promptType: "select",
      question: "What would you like to do?",
      options: ["Save", "Replan", "Cancel"],
    }));
    state = { ...state, architectState: archState };

    // Try to add an interactive request with the same title
    const next = addInteractiveRequest(state, "req-1", "select", {
      title: "What would you like to do?",
      options: ["Save", "Replan", "Cancel"],
    });
    // Should be suppressed — no new interactive request added
    expect(next.interactiveRequests).toHaveLength(0);
  });

  it("suppresses select prompts during architect preview phase (phase-based)", () => {
    let state = createInitialState();
    // Architect in preview phase, no pendingPrompt set yet (old wiring)
    let archState = reduceArchitectEvent(null, makeEvent("architect_started", { mode: "new", iteration: 1 }));
    archState = reduceArchitectEvent(archState, makeEvent("architect_preview", {
      parsedFlows: [{ name: "test", steps: [] }],
    }));
    state = { ...state, architectState: archState };
    expect(state.architectState!.phase).toBe("preview");
    expect(state.architectState!.pendingPrompt).toBeNull();

    // Select prompt arrives via ui-proxy — should be suppressed by phase
    const next = addInteractiveRequest(state, "req-2", "select", {
      title: "Save this flow?",
      options: ["Save", "Cancel"],
    });
    expect(next.interactiveRequests).toHaveLength(0);
  });

  it("does NOT suppress input prompts during architect designing phase", () => {
    let state = createInitialState();
    let archState = reduceArchitectEvent(null, makeEvent("architect_started", { mode: "new", iteration: 1 }));
    state = { ...state, architectState: archState };

    // Input prompts during designing are NOT suppressed (only select/confirm)
    const next = addInteractiveRequest(state, "req-3", "input", {
      title: "Enter description",
    });
    expect(next.interactiveRequests).toHaveLength(1);
  });

  it("does NOT suppress when no architectState or no pendingPrompt", () => {
    const state = createInitialState();
    const next = addInteractiveRequest(state, "req-3", "select", {
      title: "What would you like to do?",
      options: ["Save", "Cancel"],
    });
    expect(next.interactiveRequests).toHaveLength(1);
  });
});
