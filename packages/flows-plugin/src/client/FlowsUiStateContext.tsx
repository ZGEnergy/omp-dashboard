/**
 * Plugin-internal UI selection state shared across flow components.
 *
 * Today these flags live in `App.tsx` as `useState` declarations
 * threaded down as props (lines 232, 233, 244, 243 in pre-deletion
 * App.tsx). After Part F's component refactor + Part H's shell
 * deletions, this context becomes the sole owner of these flags.
 *
 * Scope: per dashboard mount (NOT per session). Selecting an agent in
 * one flow detail view doesn't affect another session's selection
 * because the user can only view one session at a time — the slot
 * consumer's `session` prop tells each component which session it's
 * rendering for, but the selection flags themselves are global to the
 * "currently focused content view." This matches the shell's current
 * behavior; no per-session state is needed.
 *
 * The provider lives at the root of the flows-plugin contribution
 * tree. Per the proposal Decision 5 alternative (rejected the
 * `PluginRoot` runtime convention), the provider is mounted by
 * wrapping each top-level claim's exported component. A single shared
 * provider is acceptable because React contexts mount once and then
 * any descendant consumer reads from that one instance — multiple
 * mount points only cost a few extra Provider wrappers, not duplicate
 * state.
 *
 * Actually, Decision 5 was DROPPED. Without `PluginRoot`, multiple
 * mount points would create multiple providers with independent state.
 * Solution: hoist into a module-level store (the pattern used by
 * `session-events-store.ts` in plugin-runtime). React `useSyncExternalStore`
 * subscribes; setters mutate the module-level state and notify
 * subscribers.
 *
 * See change: pluginize-flows-via-registry.
 */
import { useSyncExternalStore } from "react";

/** UI selection state shared across the plugin's content-view contributions. */
export interface FlowsUiState {
  /** When non-null, the user is viewing this agent's detail view. */
  flowDetailAgent: string | null;
  /** When true, the user is viewing the architect detail view. */
  architectDetailOpen: boolean;
  /**
   * When non-null, the user has clicked an agent's "view source"
   * action; the agent's source is displayed in the YAML preview.
   */
  sourceOpenAgent: string | null;
  /**
   * When non-null, the YAML preview is showing the supplied content
   * with the supplied title. Used for both flow YAML and architect
   * agent source previews.
   */
  flowYamlPreview: { content: string; title: string } | null;
}

const INITIAL_STATE: FlowsUiState = Object.freeze({
  flowDetailAgent: null,
  architectDetailOpen: false,
  sourceOpenAgent: null,
  flowYamlPreview: null,
});

let state: FlowsUiState = INITIAL_STATE;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function getSnapshot(): FlowsUiState {
  return state;
}

/**
 * Apply a partial update to the UI state. The new snapshot reference
 * changes only when at least one field actually differs (`Object.is`),
 * so consumers that read a single field via `useFlowsUiStateSelector`
 * don't re-render on no-op updates to other fields.
 */
function setState(patch: Partial<FlowsUiState>): void {
  let mutated = false;
  const next: FlowsUiState = { ...state };
  for (const key of Object.keys(patch) as Array<keyof FlowsUiState>) {
    if (!Object.is((next as Record<string, unknown>)[key], (patch as Record<string, unknown>)[key])) {
      (next as Record<string, unknown>)[key] = (patch as Record<string, unknown>)[key];
      mutated = true;
    }
  }
  if (mutated) {
    state = Object.freeze(next);
    notify();
  }
}

/** Setters API exposed via the hook. Stable function references — never re-created. */
export interface FlowsUiActions {
  /** Set the agent currently displayed in the flow agent detail view. */
  setFlowDetailAgent(agent: string | null): void;
  /** Toggle or set whether the architect detail view is open. */
  setArchitectDetailOpen(open: boolean | ((prev: boolean) => boolean)): void;
  /** Set the agent whose source is currently open in the YAML preview. */
  setSourceOpenAgent(agent: string | null): void;
  /** Set the YAML preview content (or close it with null). */
  setFlowYamlPreview(value: { content: string; title: string } | null): void;
  /**
   * Unified dismiss called by the shared FlowArchitect dismiss path.
   * Closes architect detail, clears flow detail agent, clears source
   * open agent, clears YAML preview. The shell's previous `onDismiss`
   * had subtly different cleanup at three different call sites
   * (App.tsx lines 1023, 1043, 1084 + 1057, 1098); this unifies them
   * per the proposal's Decision 4 (FC-1 in the validation report).
   */
  dismissAll(): void;
}

const ACTIONS: FlowsUiActions = Object.freeze({
  setFlowDetailAgent: (agent) => setState({ flowDetailAgent: agent }),
  setArchitectDetailOpen: (open) => {
    if (typeof open === "function") {
      setState({ architectDetailOpen: open(state.architectDetailOpen) });
    } else {
      setState({ architectDetailOpen: open });
    }
  },
  setSourceOpenAgent: (agent) => setState({ sourceOpenAgent: agent }),
  setFlowYamlPreview: (value) => setState({ flowYamlPreview: value }),
  dismissAll: () =>
    setState({
      flowDetailAgent: null,
      architectDetailOpen: false,
      sourceOpenAgent: null,
      flowYamlPreview: null,
    }),
});

/**
 * Hook — read the entire UI selection state. Most components only
 * need one or two fields; selector hooks (e.g. via `useMemo` over the
 * returned object) can narrow down. The state reference is stable
 * across no-op updates so React.memo bails on stable cases.
 */
export function useFlowsUiState(): FlowsUiState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook — get the actions API. Returns the same frozen object on every
 * call — no React hooks involved, just a constant. Exported as a hook
 * (rather than a constant) for symmetry with `useFlowsUiState` and so
 * future versions can swap the implementation without breaking
 * consumers.
 */
export function useFlowsUiActions(): FlowsUiActions {
  return ACTIONS;
}

/**
 * Test-only helper to reset the module-level state between tests.
 *
 * @internal
 */
export function __resetFlowsUiStateForTests(): void {
  state = INITIAL_STATE;
  subscribers.clear();
}
