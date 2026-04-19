import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import React from "react";
import { PiCoreVersionsSection } from "../PiCoreVersionsSection.js";

function makeStatus(overrides: Partial<{ updatesAvailable: number; packages: any[] }> = {}) {
	return {
		packages: [
			{
				name: "@mariozechner/pi-coding-agent",
				displayName: "pi (core agent)",
				currentVersion: "0.67.1",
				latestVersion: "0.67.6",
				updateAvailable: true,
				installSource: "global" as const,
			},
			{
				name: "pi-web-access",
				displayName: "pi-web-access",
				currentVersion: "0.10.6",
				latestVersion: "0.10.6",
				updateAvailable: false,
				installSource: "global" as const,
			},
		],
		updatesAvailable: 1,
		lastChecked: new Date().toISOString(),
		...overrides,
	};
}

function mockFetch(status: any, updateResponse?: any) {
	return vi.fn().mockImplementation((url: string, opts?: any) => {
		if (url.includes("/api/pi-core/versions")) {
			return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: status }) });
		}
		if (url.includes("/api/pi-core/update")) {
			return Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve(
						updateResponse ?? { success: true, data: { results: [], sessionsReloaded: 0 } },
					),
			});
		}
		return Promise.reject(new Error(`Unexpected fetch: ${url}`));
	});
}

describe("PiCoreVersionsSection", () => {
	beforeEach(() => {
		(globalThis as any).fetch = mockFetch(makeStatus());
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("renders package list with versions", async () => {
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			expect(screen.getByTestId("pi-core-row-@mariozechner/pi-coding-agent")).toBeTruthy();
			expect(screen.getByTestId("pi-core-row-pi-web-access")).toBeTruthy();
			expect(screen.getByText("pi (core agent)")).toBeTruthy();
		});
	});

	it("shows current → latest version for updatable packages", async () => {
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			const row = screen.getByTestId("pi-core-row-@mariozechner/pi-coding-agent");
			expect(row.textContent).toContain("0.67.1");
			expect(row.textContent).toContain("0.67.6");
		});
	});

	it("shows Update button only for updatable packages", async () => {
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			expect(screen.queryByTestId("pi-core-update-@mariozechner/pi-coding-agent")).toBeTruthy();
			expect(screen.queryByTestId("pi-core-update-pi-web-access")).toBeNull();
		});
	});

	it("shows Check Now button that triggers refresh", async () => {
		const fetchMock = mockFetch(makeStatus());
		(globalThis as any).fetch = fetchMock;
		render(<PiCoreVersionsSection />);
		await waitFor(() => screen.getByTestId("pi-core-check-now"));
		fetchMock.mockClear();
		fireEvent.click(screen.getByTestId("pi-core-check-now"));
		await waitFor(() => {
			const calls = fetchMock.mock.calls.map((c: any[]) => c[0]);
			expect(calls.some((u: string) => u.includes("refresh=true"))).toBe(true);
		});
	});

	it("shows 'Update All (N)' only when more than one update available", async () => {
		(globalThis as any).fetch = mockFetch(
			makeStatus({
				packages: [
					{
						name: "@mariozechner/pi-coding-agent",
						displayName: "pi (core agent)",
						currentVersion: "0.67.1",
						latestVersion: "0.67.6",
						updateAvailable: true,
						installSource: "global" as const,
					},
					{
						name: "pi-web-access",
						displayName: "pi-web-access",
						currentVersion: "0.10.5",
						latestVersion: "0.10.6",
						updateAvailable: true,
						installSource: "global" as const,
					},
				],
				updatesAvailable: 2,
			}),
		);
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			expect(screen.getByTestId("pi-core-update-all")).toBeTruthy();
			expect(screen.getByTestId("pi-core-update-all").textContent).toContain("Update All (2)");
		});
	});

	it("renders error state from the API", async () => {
		(globalThis as any).fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ success: false, error: "boom" }),
		});
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			expect(screen.getByText("boom")).toBeTruthy();
		});
	});

	it("shows 'registry unreachable' when latestVersion is null", async () => {
		(globalThis as any).fetch = mockFetch(
			makeStatus({
				packages: [
					{
						name: "pi-web-access",
						displayName: "pi-web-access",
						currentVersion: "0.10.6",
						latestVersion: null,
						updateAvailable: false,
						installSource: "global" as const,
					},
				],
				updatesAvailable: 0,
			}),
		);
		render(<PiCoreVersionsSection />);
		await waitFor(() => {
			expect(screen.getByText(/registry unreachable/)).toBeTruthy();
		});
	});

	it("POSTs to /api/pi-core/update on Update click", async () => {
		const fetchMock = mockFetch(makeStatus(), {
			success: true,
			data: { results: [{ name: "@mariozechner/pi-coding-agent", success: true }], sessionsReloaded: 1 },
		});
		(globalThis as any).fetch = fetchMock;

		render(<PiCoreVersionsSection />);
		await waitFor(() => screen.getByTestId("pi-core-update-@mariozechner/pi-coding-agent"));
		fireEvent.click(screen.getByTestId("pi-core-update-@mariozechner/pi-coding-agent"));

		await waitFor(() => {
			const posted = fetchMock.mock.calls.find(
				(c: any[]) => c[0].includes("/api/pi-core/update") && c[1]?.method === "POST",
			);
			expect(posted).toBeTruthy();
			const body = JSON.parse(posted![1].body);
			expect(body.packages).toEqual(["@mariozechner/pi-coding-agent"]);
		});
	});

	it("displays per-package error from WS complete event", async () => {
		render(<PiCoreVersionsSection />);
		await waitFor(() => screen.getByTestId("pi-core-row-@mariozechner/pi-coding-agent"));

		act(() => {
			window.dispatchEvent(
				new CustomEvent("pi-core-event", {
					detail: {
						type: "pi_core_update_complete",
						results: [{ name: "@mariozechner/pi-coding-agent", success: false, error: "EACCES" }],
						sessionsReloaded: 0,
					},
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText("EACCES")).toBeTruthy();
		});
	});

	it("displays live progress message from WS progress event", async () => {
		render(<PiCoreVersionsSection />);
		await waitFor(() => screen.getByTestId("pi-core-row-@mariozechner/pi-coding-agent"));

		// Start an update first to set busy state
		fireEvent.click(screen.getByTestId("pi-core-update-@mariozechner/pi-coding-agent"));

		act(() => {
			window.dispatchEvent(
				new CustomEvent("pi-core-event", {
					detail: {
						type: "pi_core_update_progress",
						name: "@mariozechner/pi-coding-agent",
						phase: "output",
						message: "added 1 package in 3s",
					},
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText("added 1 package in 3s")).toBeTruthy();
		});
	});
});
