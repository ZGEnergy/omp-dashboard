/**
 * Reducer barrel for the flows plugin.
 *
 * Re-exports the flow reducer so that
 * `packages/client/src/lib/event-reducer.ts` can import it via
 * `@blackbelt-technology/pi-dashboard-flows-plugin/reducer`.
 * Architect reducer removed (flow-architect deleted upstream).
 * See change: rework-flows-plugin-for-new-pi-flows.
 */
export { isFlowEvent, reduceFlowEvent } from "./flow-reducer.js";
