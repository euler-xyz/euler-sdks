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
   Typed-data requests may be `undefined` when already authorized — guard for
   that, otherwise sign `request.typedData` and pass `{ request, signature }` as
   `authorization`.
   For wallets that cannot sign, request the transaction form instead (rule 5).
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
   `stateOverrides` (when a permit or transaction grant is required it is
   represented by a storage override, so no signature or mined grant is needed),
   then gate on
   `canExecute`. Pass `authorizationKind: "transaction"` to dry-run the
   contract-wallet flow; its grant remains outside `previewPlan` and the EVC
   batch.
5. Contract wallets cannot sign the typed-data form — Aave, Morpho, and
   MetaMorpho verify permits/delegations/authorizations without an ERC-1271
   fallback. Pass `authorizationKind: "transaction"` to `getAuthorization` for a
   `msg.sender` flow instead: `{ kind: "transaction", call?, revocation }`.
   When `call` is present, send it and **wait for it to be mined** before
   `planMigration` — the
   connectors read the live allowance to decide whether the batch still needs an
   authorization item, so a grant that has not landed yet makes the build throw
   "… is required". Then omit `authorization` and pass
   `removeAuthorizationAfterMigration: false` (its in-batch disable needs a
   signature), and send `revocation` only after the migration has a known
   terminal outcome or is known not to have been dispatched. If core dispatch or
   receipt status is unknown, persist the pending cleanup and reconcile the core
   transaction first because it may still need the authorization. Morpho omits
   `call` when authorization already stands but still returns the disable call
   as `revocation`. Use the owner-controlled wallet path for both calls, reject
   reverted cleanup receipts, and preserve migration and cleanup errors
   separately. The grant cannot be a batch item: the EVC forwards batch items as
   itself, so it would grant from the EVC.

Reference: `packages/euler-v2-sdk/docs/position-migration-service.md`,
`examples/execution/aave-to-euler-position-migration-example.ts`,
`examples/execution/euler-to-morpho-position-migration-example.ts`
</content>
