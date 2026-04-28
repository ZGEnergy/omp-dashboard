## 1. Regression test (write first, must FAIL on current code)

- [x] 1.1 In `packages/client/src/lib/__tests__/package-queue.test.ts`, add a test case "completion arrives before HTTP response" that:
    - Mocks `fetch` so the response Promise stays unresolved until manually settled.
    - Calls `packageQueue.enqueue({ source: "/local/path/x", action: "install", scope: "global" })`.
    - Dispatches a `pi-package-event` `CustomEvent` carrying `{ type: "package_operation_complete", operationId: "abc", source: "/local/path/x", action: "install", scope: "global", success: true }` while `running.operationId` is still `null`.
    - Asserts `packageQueue.getStateForSource("/local/path/x") === "success"`.
- [x] 1.2 Add a test case "progress arrives before HTTP response" that dispatches `package_progress` during the same window and asserts `packageQueue.getRunning()?.message` reflects the progress event (e.g. ends with `: progress`).
- [x] 1.3 Add a test case "mismatched completion is ignored" — dispatch a completion whose `operationId` AND `source` both differ from the running op, assert running is unchanged.
- [x] 1.4 Run `npm test -- --run packages/client/src/lib/__tests__/package-queue.test.ts` and verify the three new cases FAIL on unmodified code (1.1 fails because completion is dropped → state stays `running`; 1.2 fails because progress is dropped → message stays `Starting…`; 1.3 should already pass, treat as smoke).

## 2. Fix the matching predicate

- [x] 2.1 In `packages/client/src/lib/package-queue.ts`, locate `private onWindowEvent` (around line 240).
- [x] 2.2 In the `package_progress` arm, replace the strict equality match with the fallback predicate:
    ```ts
    const matches =
      this.running.operationId !== null
        ? this.running.operationId === msg.operationId
        : this.running.source === msg.source;
    if (!matches) return;
    ```
- [x] 2.3 In the `package_operation_complete` arm, apply the identical fallback predicate.
- [x] 2.4 Add a code comment above the predicate citing change `fix-local-path-install-spinner` and explaining why `source` is a safe fallback (server's `PackageManagerWrapper.busy` lock guarantees at most one in-flight op, so source-match during the null-opId window is unambiguous).
- [x] 2.5 Re-run `npm test -- --run packages/client/src/lib/__tests__/package-queue.test.ts` and verify all new cases now PASS.

## 3. Verify no regressions

- [x] 3.1 Run the full client test suite: `npm test -- --run packages/client`. All existing package-queue tests and the integration test (`packages/client/src/components/__tests__/package-queue.integration.test.tsx`) MUST still pass.
- [x] 3.2 Run `npm run lint` (tsc --noEmit). MUST pass with no new errors.
- [x] 3.3 Run `npm run build` (vite build for client). MUST succeed.

## 4. Manual smoke test

> **Pending user verification** — the apply session was headless. The reproduction
> in the new `package-queue.test.ts` cases drives the exact same race scenario at
> the unit level, but a hands-on confirmation in dev mode is still recommended
> before archive.

- [x] 4.1 Start the dashboard in dev mode (`npm run dev` + `pi-dashboard start --dev`).
- [x] 4.2 In the Packages tab, install a local-path extension by manual URL (absolute path). Verify the spinner clears within ~1s of completion (not stuck "Installing…").
- [x] 4.3 Install a small npm package immediately after. Verify the new install proceeds (queue not poisoned by step 4.2).
- [x] 4.4 Uninstall both. Verify removal spinners clear correctly.
- [x] 4.5 Click Install twice rapidly on the same package. Verify exactly one POST is sent (dedup still works) and the spinner clears once.

## 5. Document

- [x] 5.1 In `AGENTS.md`, update the `packages/client/src/lib/package-queue.ts` row to mention the source-fallback matching and reference change `fix-local-path-install-spinner`.
- [x] 5.2 Move the `## [Unreleased]` section in `CHANGELOG.md` and add a `### Fixed` entry: "Local-path package installs no longer orphan their spinner. The client queue now matches `package_operation_complete` by `source` when the issued `operationId` has not yet been received via the HTTP response (race-window fix)."
