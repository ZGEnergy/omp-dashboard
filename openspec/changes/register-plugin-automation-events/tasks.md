## 1. Cross-plugin service seam

- [ ] 1.1 Add `provide(name, value)` + `consume<T>(name)` to `ServerPluginContext` interface + `ServerContextDeps` in `dashboard-plugin-runtime/src/server/server-context.ts`
- [ ] 1.2 Back the seam with one host-owned `Map` constructed in `server.ts` and injected into `createServerPluginContext`
- [ ] 1.3 Unit test: provider value observed by consumer; absent name returns `undefined` (no throw)
- [ ] 1.4 Verify loader topological order guarantees provider `registerPlugin` before a `dependsOn` consumer (test with a stub provider/consumer pair)

## 2. Action registry (automation plugin, server)

- [ ] 2.1 Add `ActionRegistry` + `ActionDescriptor` (`id`, `source`, `label`, `description`, `available(cwd)`, `payloadSchema`, `dispatch`) in `packages/automation-plugin/src/server/`
- [ ] 2.2 Register built-ins `core.prompt` + `core.skill`; map their `dispatch` to the existing seed-prompt path
- [ ] 2.3 Enforce per-source cap (≤12): reject + log warning beyond cap, keep first 12
- [ ] 2.4 `provide("automation.action-registry", registry)` from automation `registerPlugin`
- [ ] 2.5 Unit tests: registration, namespacing, cap enforcement, built-ins present

## 3. automation.yaml schema generalization

- [ ] 3.1 Widen `AutomationAction` (shared types) to `{ kind: string; payload?: Record<string, unknown> }`; add action-descriptor client types
- [ ] 3.2 Generalize `validateAction` in `automation-schema.ts`: accept any registered id, normalize bare `prompt`/`skill` → `core.*`, validate `kind` against the live registry, isolate unknown-id failures
- [ ] 3.3 Parse optional `action.payload` map; carry through `AutomationConfig`
- [ ] 3.4 Unit tests: built-in normalization, plugin action + payload, unknown-id isolation, sibling-still-loads

## 4. Registry unification (route + engine)

- [ ] 4.1 Replace throwaway-registry pattern in `routes.ts`: serve action descriptors from the live registry filtered by `available(cwd)`; mark unavailable sources disabled-with-reason; resolve `enum.options(cwd)`
- [ ] 4.2 Route engine `startRunFor` dispatch through the resolved `ActionDescriptor.dispatch(payload, runCtx)` keyed by `action.kind`
- [ ] 4.3 Unit tests: route returns descriptors gated by cwd; engine dispatches to the correct handler

## 5. Dialog — inline accordion picker (Direction A)

- [ ] 5.1 Add `listActions(cwd)` to `packages/automation-plugin/src/client/api.ts`
- [ ] 5.2 Replace the `prompt|skill` segmented control in `CreateAutomationDialog.tsx` with the grouped accordion picker (group-by-source, search filter, disabled-with-reason, zero-results)
- [ ] 5.3 Render the schema-driven payload form from the selected action's `payloadSchema` (string/multiline/text/enum); empty schema → no form
- [ ] 5.4 Accessibility: combobox/listbox roles, visible focus, 44px targets, ≥4.5:1 contrast, reduced-motion (reference `mock-ux.html`)
- [ ] 5.5 Persist selected `kind` + `payload` into the create/update POST body

## 6. Flows plugin registers actions

- [ ] 6.1 Add `dependsOn: ["automation"]` to flows `package.json` manifest
- [ ] 6.2 In flows `registerPlugin`, `consume("automation.action-registry")`; no-op + log when absent
- [ ] 6.3 Register `flows.run` (flow enum from `flows_list` + task multiline), `flows.resume`, `flows.cancel` with `available(cwd) = hasFlows(cwd)`
- [ ] 6.4 Wire `flows.run.dispatch` into the existing flow-run path
- [ ] 6.5 Unit tests: availability gating by cwd, enum options resolution, dispatch invocation, registry-absent graceful path

## 7. Integration + docs

- [ ] 7.1 End-to-end: create an automation with `flows.run` in a cwd with flows → arm → fire → flow runs with the task
- [ ] 7.2 Backward-compat: existing `prompt`/`skill` automation still parses, arms, and runs
- [ ] 7.3 Add file-index rows for new/changed files in the matching `docs/file-index-*.md` splits (delegate per Documentation Update Protocol)
