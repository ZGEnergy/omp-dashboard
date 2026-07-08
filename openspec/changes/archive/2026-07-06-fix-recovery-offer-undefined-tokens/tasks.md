## 1. Fix undefined tokens

- [x] 1.1 In `packages/client/src/components/RecoveryOfferHost.tsx`, replace `bg-[var(--bg-elevated)]` with `bg-[var(--bg-surface)]` on the offer card.
- [x] 1.2 In the same file, replace `bg-[var(--accent)]` with `bg-[var(--accent-primary)]` on the Reopen button.

## 2. Regression test

- [x] 2.1 Add a test (colocated with the component) asserting `RecoveryOfferHost` renders the Reopen button (`data-testid="recovery-offer-reopen"`) and references `--bg-surface` / `--accent-primary`, NOT `--bg-elevated` / `--accent`. → verify: `npm test` passes and the test fails if either old token is reintroduced.

## 3. Build & verify

- [x] 3.1 `npm test` green. → verify: RecoveryOfferHost suite 7/7 pass.
- [x] 3.2 `npm run build` succeeds (client-change rebuild path). → verify: built in 25.56s, exit 0. Server restart pending deploy.
