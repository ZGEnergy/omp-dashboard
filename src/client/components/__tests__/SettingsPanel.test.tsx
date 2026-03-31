import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "../SettingsPanel.js";

// Mock wouter
vi.mock("wouter", () => ({
  useLocation: () => ["/settings", vi.fn()],
}));

const mockConfig = {
  port: 8000,
  piPort: 9999,
  autoStart: true,
  autoShutdown: true,
  shutdownIdleSeconds: 300,
  spawnStrategy: "headless",
  tunnel: { enabled: true },
  devBuildOnReload: false,
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should load and display config on mount", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockConfig }),
    });

    render(<SettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeTruthy();
      expect(screen.getByText("Server")).toBeTruthy();
      expect(screen.getByText("Sessions")).toBeTruthy();
      expect(screen.getByText("Tunnel")).toBeTruthy();
      expect(screen.getByText("Authentication")).toBeTruthy();
      expect(screen.getByText("Developer")).toBeTruthy();
    });
  });

  it("should show loading state initially", () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})); // never resolves
    render(<SettingsPanel />);
    expect(screen.getByText("Loading settings...")).toBeTruthy();
  });

  it("should show 'No changes' when saving without modifications", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: mockConfig }),
    });

    render(<SettingsPanel />);

    await waitFor(() => screen.getAllByTestId("save-btn"));

    fireEvent.click(screen.getAllByTestId("save-btn")[0]);

    await waitFor(() => {
      expect(screen.getByText("No changes to save")).toBeTruthy();
    });
  });

  it("should display bypass URLs from auth config", async () => {
    const configWithAuth = {
      ...mockConfig,
      auth: {
        secret: "***",
        providers: { github: { clientId: "id1", clientSecret: "***" } },
        allowedUsers: ["user@example.com"],
        bypassUrls: ["/webhooks/", "/metrics"],
      },
    };
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: configWithAuth }),
    });

    render(<SettingsPanel />);

    await waitFor(() => screen.getByTestId("bypass-urls-textarea"));

    const textarea = screen.getByTestId("bypass-urls-textarea");
    expect(textarea).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value).toBe("/webhooks/\n/metrics");
  });

  it("should include bypassUrls in save payload when changed", async () => {
    const configWithAuth = {
      ...mockConfig,
      auth: {
        secret: "***",
        providers: { github: { clientId: "id1", clientSecret: "***" } },
        bypassUrls: [],
      },
    };
    let savedBody: any;
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((_url: string, options?: any) => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ json: () => Promise.resolve({ success: true, data: configWithAuth }) });
      }
      savedBody = JSON.parse(options.body);
      return Promise.resolve({ json: () => Promise.resolve({ success: true }) });
    });

    render(<SettingsPanel />);
    await waitFor(() => screen.getByTestId("bypass-urls-textarea"));

    const textarea = screen.getByTestId("bypass-urls-textarea");
    fireEvent.change(textarea, { target: { value: "/webhooks/\n/public" } });
    fireEvent.click(screen.getAllByTestId("save-btn")[0]);

    await waitFor(() => {
      expect(savedBody?.auth?.bypassUrls).toEqual(["/webhooks/", "/public"]);
    });
  });

  it("should show restart required message when port changes", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: mockConfig }),
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, restartRequired: true }),
      });
    });

    render(<SettingsPanel />);

    await waitFor(() => screen.getAllByTestId("save-btn"));

    // Change port (first input with value 8000)
    const portInput = screen.getAllByDisplayValue("8000")[0];
    fireEvent.change(portInput, { target: { value: "9000" } });
    fireEvent.click(screen.getAllByTestId("save-btn")[0]);

    await waitFor(() => {
      expect(screen.getByText(/restart/i)).toBeTruthy();
    });
  });
});
