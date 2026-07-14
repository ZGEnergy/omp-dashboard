# packages-api.ts — index

Fetch helpers for package endpoints not owned by `package-queue`. Exports `PackageScope`, `PackageEntry`, `MoveArgs`, `MoveSuccessResponse`, `MoveErrorResponse`, `MoveResponse` (discriminated union), `movePackage(args)` — POST `/api/packages/move`, never throws on HTTP-error (network errors still throw); partial-success delivered later via WS `partialSuccess` field. See change: unify-package-management-ui.
