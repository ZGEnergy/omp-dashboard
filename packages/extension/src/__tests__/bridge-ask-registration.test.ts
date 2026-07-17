/**
 * The bridge must register core `ask` synchronously from its extension factory.
 * Pi snapshots extension tools while creating a session; session_start is too
 * late for a headless (`hasUI=false`) session to acquire the tool.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../provider-register.js", () => ({
  activate: vi.fn(),
  onProviderChanged: vi.fn(),
  reloadProviders: vi.fn(),
  buildProviderCatalogue: vi.fn(),
  toModelInfo: vi.fn(),
}));
vi.mock("../role-manager.js", () => ({ activate: vi.fn() }));

describe("bridge ask registration timing", () => {
  const bridgeKey = "__pi_dashboard_bridge__";
  const priorBridgeState = (process as unknown as Record<string, unknown>)[bridgeKey];
  const priorSpawnToken = process.env.PI_DASHBOARD_SPAWN_TOKEN;

  afterEach(() => {
    if (priorBridgeState === undefined) {
      delete (process as unknown as Record<string, unknown>)[bridgeKey];
    } else {
      (process as unknown as Record<string, unknown>)[bridgeKey] = priorBridgeState;
    }
    if (priorSpawnToken === undefined) {
      delete process.env.PI_DASHBOARD_SPAWN_TOKEN;
    } else {
      process.env.PI_DASHBOARD_SPAWN_TOKEN = priorSpawnToken;
    }
  });

  it("registers ask and ask_user during factory load for a dashboard-spawned session", async () => {
    const { default: bridge } = await import("../bridge.js");
    const registerTool = vi.fn();
    const pi = { registerTool };
    process.env.PI_DASHBOARD_SPAWN_TOKEN = "test-spawn-token";

    // Keep initBridge from doing any runtime work: this asserts the synchronous
    // factory boundary before the headless tool registry is snapshotted.
    (process as unknown as Record<string, unknown>)[bridgeKey] = { generation: 1, pi: {} };

    bridge(pi as never);

    const tools = registerTool.mock.calls.map(([tool]) => tool as {
      name: string;
      parameters: { type?: string; properties?: Record<string, unknown> };
    });
    expect(tools.map((tool) => tool.name)).toEqual(["ask", "ask_user"]);
    expect(tools[0]?.parameters.type).toBe("object");
    expect(Object.keys(tools[0]?.parameters.properties ?? {})).toEqual(["questions"]);
    expect(tools[1]?.parameters.type).toBe("object");
    expect(Object.keys(tools[1]?.parameters.properties ?? {})).toContain("method");
  });

  it("keeps ask_user factory registration after the spawn token is scrubbed on reload", async () => {
    const { default: bridge } = await import("../bridge.js");
    const registerTool = vi.fn();
    const pi = {
      registerTool,
      registerCommand: vi.fn(),
      on: vi.fn(),
      events: { emit: vi.fn(), on: vi.fn() },
    };
    process.env.PI_DASHBOARD_SPAWN_TOKEN = "test-spawn-token";

    bridge(pi as never);
    delete process.env.PI_DASHBOARD_SPAWN_TOKEN;
    bridge(pi as never);

    expect(registerTool.mock.calls.map(([tool]) => (tool as { name: string }).name)).toEqual([
      "ask",
      "ask_user",
      "ask",
      "ask_user",
    ]);
    const activeState = (process as unknown as Record<string, { cleanup?: () => void }>)[bridgeKey];
    activeState?.cleanup?.();
  });
});
