## 1. Implementation

- [x] 1.1 In `src/extension/bridge.ts`, add a re-probe `isPortOpen(config.piPort)` call after `launchServer` returns failure, suppressing the warning if the port is now open

## 2. Tests

- [x] 2.1 Add test: when `launchServer` fails but port is open on re-probe, no warning is shown
- [x] 2.2 Add test: when `launchServer` fails and port is still closed on re-probe, warning is shown
- [x] 2.3 Add test: when `launchServer` succeeds, success notification is shown (existing behavior preserved)
