/**
 * REST routes for pi core version check and update.
 *
 *   GET  /api/pi-core/versions[?refresh=true]
 *   POST /api/pi-core/update                 { packages?: string[] }
 *
 * Complements /api/packages/* (extension management): this endpoint covers
 * globally-installed pi CLI packages like @mariozechner/pi-coding-agent,
 * pi-dashboard itself, pi-model-proxy, etc.
 */
import type { FastifyInstance } from "fastify";
import type {
	ApiResponse,
	PiCoreStatus,
	PiCoreUpdateRequest,
	PiCoreUpdateResponse,
} from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";
import type { PiCoreChecker } from "../pi-core-checker.js";
import type { PiCoreUpdater } from "../pi-core-updater.js";
import { PackageOperationBusyError } from "../package-manager-wrapper.js";
import type { BootstrapStateStore } from "../bootstrap-state.js";

export interface PiCoreRouteDeps {
	piCoreChecker: PiCoreChecker;
	piCoreUpdater: PiCoreUpdater;
	/**
	 * When provided, pi-core endpoints return 503 unless bootstrap
	 * status is "ready". See change: unified-bootstrap-install §5.5.
	 */
	bootstrapState?: BootstrapStateStore;
	/**
	 * Called after the updater finishes a batch (success or per-package failure).
	 * The server wires this to broadcast a `pi_core_update_complete` WS message
	 * so listeners (PiUpdateBadge, PiCoreVersionsSection, usePiCoreVersions
	 * hook instances in other open tabs) refetch their state.
	 */
	onUpdateComplete?: (payload: {
		results: Array<{ name: string; success: boolean; error?: string }>;
		sessionsReloaded: number;
	}) => void;
}

export function registerPiCoreRoutes(
	fastify: FastifyInstance,
	deps: PiCoreRouteDeps,
): void {
	const { piCoreChecker, piCoreUpdater, bootstrapState } = deps;

	/** Gate: 503 unless bootstrap is ready. Returns undefined when OK to proceed. */
	const bootstrapGate = async (
		_req: unknown,
		reply: { code: (n: number) => { send: (body: unknown) => unknown } },
	): Promise<unknown> => {
		if (!bootstrapState) return undefined;
		const status = bootstrapState.get().status;
		if (status === "ready") return undefined;
		return reply.code(503).send({
			success: false,
			error: `pi not yet installed (bootstrap status: ${status})`,
			bootstrap: status,
		});
	};

	// ── GET /api/pi-core/versions ──────────────────────────────────

	fastify.get<{ Querystring: { refresh?: string } }>(
		"/api/pi-core/versions",
		{ preHandler: bootstrapGate as any },
		async (request) => {
			const refresh = request.query.refresh === "true";
			try {
				const status = await piCoreChecker.getStatus(refresh);
				return { success: true, data: status } satisfies ApiResponse<PiCoreStatus>;
			} catch (err: any) {
				return { success: false, error: err?.message ?? String(err) } satisfies ApiResponse;
			}
		},
	);

	// ── POST /api/pi-core/update ───────────────────────────────────

	fastify.post<{ Body: PiCoreUpdateRequest }>(
		"/api/pi-core/update",
		{ preHandler: bootstrapGate as any },
		async (request, reply) => {
			const requested = request.body?.packages ?? [];

			// Load current status to determine install source and eligibility.
			const status = await piCoreChecker.getStatus();
			const allByName = new Map(status.packages.map((p) => [p.name, p]));

			const targetNames =
				requested.length > 0
					? requested
					: status.packages.filter((p) => p.updateAvailable).map((p) => p.name);

			const resolved = [];
			const unknown: string[] = [];
			for (const name of targetNames) {
				const pkg = allByName.get(name);
				if (!pkg) {
					unknown.push(name);
					continue;
				}
				resolved.push(pkg);
			}

			if (unknown.length > 0) {
				reply.code(400);
				return {
					success: false,
					error: `Unknown package(s): ${unknown.join(", ")}`,
				} satisfies ApiResponse;
			}

			if (resolved.length === 0) {
				return {
					success: true,
					data: { results: [], sessionsReloaded: 0 },
				} satisfies ApiResponse<PiCoreUpdateResponse>;
			}

			try {
				const out = await piCoreUpdater.update(resolved);
				// Invalidate cache so next version check reflects new versions.
				piCoreChecker.invalidate();
				// Notify other browser tabs / the header badge hook instance so
				// their independent usePiCoreVersions state refetches.
				deps.onUpdateComplete?.(out);
				return { success: true, data: out } satisfies ApiResponse<PiCoreUpdateResponse>;
			} catch (err: any) {
				if (err instanceof PackageOperationBusyError) {
					reply.code(409);
					return { success: false, error: err.message } satisfies ApiResponse;
				}
				return { success: false, error: err?.message ?? String(err) } satisfies ApiResponse;
			}
		},
	);
}
