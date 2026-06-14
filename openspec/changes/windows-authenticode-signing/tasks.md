# Tasks — windows-authenticode-signing

## Prerequisites (manual, off-CI)

- [ ] Create Azure subscription under the Black Belt Technology Kft. tenant (or reuse existing)
- [ ] Provision an **Azure Trusted Signing** account + certificate profile in the `eastus` region
- [ ] Submit **Identity Validation** for publisher (`Black Belt Technology Kft.`) — wait 3–5 business days
- [ ] Create an Azure AD app registration with a **federated identity credential** scoped to `repo:BlackBeltTechnology/pi-agent-dashboard:ref:refs/tags/v*` (so only tag-triggered runs can sign) and a second one for `repo:BlackBeltTechnology/pi-agent-dashboard:environment:github-pages` if signing is ever needed from the deploy pipeline (defer until needed)
- [ ] Grant the app the `Trusted Signing Certificate Profile Signer` RBAC role on the certificate profile
- [ ] Add the five workflow secrets to repo settings (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_TRUSTED_SIGNING_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE`)

## Implementation

- [ ] Create `.github/actions/sign-windows-binaries/action.yml` (composite action) — see proposal §2
- [ ] Add `permissions: id-token: write` to the electron job in `.github/workflows/publish.yml` (required for OIDC token mint)
- [ ] Wire signing + re-zip + verify steps into `publish.yml` (Windows-only matrix legs, gated on `env.AZURE_CLIENT_ID != ''` per D4)
- [ ] Create `packages/electron/scripts/rezip-signed.ps1` — re-archives `PI-Dashboard-win32-{x64,arm64}.zip` after their inner `.exe`s have been signed
- [ ] Create `packages/electron/scripts/verify-signed.ps1` — fail-closed verification of every Windows `.exe` (in `out/make/` and inside ZIPs)

## Tests / regression locks

- [ ] Add `packages/shared/src/__tests__/publish-workflow-windows-signing.test.ts` — parses `publish.yml`, asserts the Windows matrix legs declare the sign / re-zip / verify steps in correct order, gated on the `AZURE_CLIENT_ID` env var
- [ ] Add a follow-up smoke step that downloads one signed artifact in a post-publish job and runs `signtool verify /pa /v` against it (catches "signing succeeded but the artifact uploaded to the Release was the unsigned one")

## Documentation

- [ ] Update `docs/architecture.md` "Build & Release" section with the signing flow
- [ ] Update `AGENTS.md` `publish.yml` row in the file map to document the signing contract
- [ ] Once a successful signed release ships: remove the **Windows half** of the `UnsignedBinaryNote` component in `site/src/components/InstallTabs.tsx` and the SmartScreen section from future release notes. The macOS half stays until `macos-notarization` ships; once both ship, drop the entire `UnsignedBinaryNote` component and the `unsignedNote` flag on the `electron` tab.
- [ ] Add a 1-paragraph summary to `CHANGELOG.md` `[Unreleased] → Changed` describing the new signing pipeline

## Validation (post-merge, post-cert-issuance)

- [ ] Cut a `0.x.y-rc.0` prerelease tag — confirm signing step runs green
- [ ] Download the rc Setup.exe on a fresh Windows VM (no prior install of pi-dashboard) — confirm SmartScreen passes silently
- [ ] Confirm `signtool verify /pa /v pi-dashboard-Setup-<rc>.exe` reports `Successfully verified` with `Microsoft ID Verified CS EOC CA 01` (or current ATS root) in the chain
- [ ] Promote rc to stable release
