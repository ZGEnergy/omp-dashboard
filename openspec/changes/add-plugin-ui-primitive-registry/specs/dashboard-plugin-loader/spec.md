## ADDED Requirements

### Requirement: Plugin runtime exposes UI primitive registry context

The dashboard's React root SHALL be wrapped in a `<UiPrimitiveProvider>` (defined by `plugin-ui-primitive-registry`) so that all plugin slot contributions are descendants of the provider. This SHALL be in addition to the existing `<PluginContextProvider>` already required by `dashboard-plugin-loader`.

The relative ordering SHALL place `<UiPrimitiveProvider>` OUTSIDE `<PluginContextProvider>`. (Both end up wrapping `<App>`; the order matters only in that hooks from one cannot influence the other's setup.)

#### Scenario: Both providers wrap App

- **WHEN** `<App>` is mounted from `packages/client/src/main.tsx`
- **THEN** the React tree SHALL include `<UiPrimitiveProvider value={primitiveRegistry}>` at or above `<PluginContextProvider>`
- **AND** every slot consumer in the tree SHALL be a descendant of both providers

#### Scenario: Plugin contribution can use both registries

- **WHEN** a plugin slot contribution renders inside both providers
- **THEN** it SHALL be able to call `usePluginConfig()` (from PluginContext) AND `useUiPrimitive()` (from UiPrimitiveProvider) in the same component without either failing
