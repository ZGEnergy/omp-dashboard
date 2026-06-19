/**
 * SubagentsSettings unit tests — initial render reads from usePluginConfig,
 * toggle click POSTs to /api/config/plugins/subagents, error path reverts.
 * See change: add-subagent-inspector §16.3.3.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import {
	createSlotRegistry,
	SettingsDraftProvider,
	type RegisteredSource,
} from "@blackbelt-technology/dashboard-plugin-runtime";
import {
	applyPluginConfigUpdate,
	CurrentPluginLayer,
	PluginContextProvider,
} from "@blackbelt-technology/dashboard-plugin-runtime/context";
import { SubagentsSettings } from "../SubagentsSettings.js";

function renderInPluginContext(sources?: Map<string, RegisteredSource>) {
	const registry = createSlotRegistry();
	const draft = {
		upsert: (id: string, s: RegisteredSource) => { sources?.set(id, s); },
		remove: (id: string) => { sources?.delete(id); },
	};
	return render(
		<PluginContextProvider registry={registry}>
			<SettingsDraftProvider registry={draft}>
				<CurrentPluginLayer pluginId="subagents">
					<SubagentsSettings />
				</CurrentPluginLayer>
			</SettingsDraftProvider>
		</PluginContextProvider>,
	);
}

describe("SubagentsSettings", () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		originalFetch = global.fetch;
		// Seed config to a known state before each test
		act(() => {
			applyPluginConfigUpdate({
				type: "plugin_config_update",
				id: "subagents",
				config: { inheritContext: true },
			});
		});
	});

	afterEach(() => {
		global.fetch = originalFetch;
		cleanup();
	});

	it("renders the toggle checked when inheritContext is true", () => {
		renderInPluginContext();
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
	});

	it("renders the toggle unchecked when inheritContext is false", () => {
		act(() => {
			applyPluginConfigUpdate({
				type: "plugin_config_update",
				id: "subagents",
				config: { inheritContext: false },
			});
		});
		renderInPluginContext();
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(false);
	});

	it("defaults to checked when inheritContext is missing from config", () => {
		act(() => {
			applyPluginConfigUpdate({
				type: "plugin_config_update",
				id: "subagents",
				config: {}, // empty
			});
		});
		renderInPluginContext();
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		expect(checkbox.checked).toBe(true);
	});

	it("buffers the toggle (no POST on click); commit() POSTs the new value", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		const sources = new Map<string, RegisteredSource>();
		renderInPluginContext(sources);
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		fireEvent.click(checkbox);

		// Buffered — toggling does NOT autosave.
		expect(fetchMock).not.toHaveBeenCalled();
		await waitFor(() => expect(sources.get("plugin:subagents")?.isDirty).toBe(true));
		await sources.get("plugin:subagents")!.commit();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("/api/config/plugins/subagents");
		expect((init as RequestInit).method).toBe("POST");
		expect(JSON.parse((init as RequestInit).body as string)).toEqual({ inheritContext: false });
	});

	it("commit() rejects on non-200 so the host keeps the source dirty", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue(new Response("validation failed", { status: 400 }));
		global.fetch = fetchMock as unknown as typeof fetch;

		const sources = new Map<string, RegisteredSource>();
		renderInPluginContext(sources);
		const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
		fireEvent.click(checkbox);

		await waitFor(() => expect(sources.get("plugin:subagents")?.isDirty).toBe(true));
		await expect(sources.get("plugin:subagents")!.commit()).rejects.toThrow();
		// Draft retains the user's choice for retry.
		expect(checkbox.checked).toBe(false);
	});
});
