---
title: Cross-Protocol Position Migration
impact: MEDIUM
impactDescription: Correct connector/direction usage and authorization signing for position migrations
tags: migration, aave, morpho, metamorpho, connector, authorization
---

## Cross-Protocol Position Migration

Use `positionMigrationService` to move a position between an external protocol
(Aave V3, Morpho Blue, MetaMorpho) and Euler in one EVC batch, without closing
the user's borrow. (Same-asset, intra-Euler migration is instead
`executionService.planMigrateSameAssetCollateral` / `planMigrateSameAssetDebt`.)

Flow:

1. Read the source position: `getPosition({ connectorId, chainId, owner, positionRef })`
   (`listPositions` / `listTargets` for discovery).
2. Resolve the authorization: `getAuthorization({ direction, connectorId, owner, position, target | source, deadline })`.
   It returns `undefined` when already authorized — guard for it, otherwise sign
   `request.typedData` and pass `{ request, signature }` as `authorization`.
3. Build and execute: `planMigration({ ...args, authorization })` → `TransactionPlan`
   → `executionService.executeTransactionPlan(...)`.

Rules:

1. `direction` is `"external-to-euler"` (supply an `EulerMigrationTarget`) or
   `"euler-to-external"` (supply an `EulerMigrationSource`, optionally
   `ExternalMigrationTarget`). Connector `id`s: `aave`, `morpho`, `metamorpho`.
2. MetaMorpho is supply-only and inbound only; Aave/Morpho outbound flows reject
   swap quotes. Only enabled `connectorId:direction` pairs work — a disabled pair
   throws "temporarily disabled".
3. Change collateral/debt assets on inbound migrations with `collateralSwapQuote`
   / `debtSwapQuote` from `swapService` (quotes must target the Euler Swapper);
   set `collateralSwapVerification: "deposit"` for ERC-4626/EulerEarn targets.
4. For a pre-trade dry run use `planMigrationSimulation(...)` → `{ plan,
   stateOverrides, previewPlan, authorizationRequest }`; simulate `plan` with
   `stateOverrides` (the permit is replaced by a storage override, so no
   signature is needed), then gate on `canExecute`.

Reference: `packages/euler-v2-sdk/docs/position-migration-service.md`,
`examples/execution/aave-to-euler-position-migration-example.ts`,
`examples/execution/euler-to-morpho-position-migration-example.ts`
</content>
