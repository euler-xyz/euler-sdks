---
title: Transaction Planning, Approvals, and EVC Batch Execution
impact: CRITICAL
impactDescription: Prevents reverted transactions and broken wallet UX
tags: execution, planX, approvals, permit2, evc
---

## Transaction Planning, Approvals, and EVC Batch Execution

Prefer `planX` over `encodeX` for app flows. `planX` includes required approvals and context-driven execution decisions.
For reward claims, use `rewardsService.buildClaimPlan(s)` instead of adding provider-specific claim logic to `executionService`.

**Incorrect (encoding raw calls but skipping approvals):**

```typescript
const batchItems = sdk.executionService.encodeDeposit({ ...args });
// WRONG: no approval resolution; tx may revert on allowance
```

**Correct (plan + resolve + execute):**

```typescript
const plan = sdk.executionService.planDeposit({
  account,
  vault,
  asset,
  amount,
  receiver,
  enableCollateral: true,
});

const resolved = await sdk.executionService.resolveRequiredApprovals({
  chainId,
  account: owner,
  plan,
});

// Execute required approvals first, then handle each executable item:
// - contractCall: send directly
// - evcBatch: send through EVC.batch
```

Execution checklist:

1. Build plan with `planX`.
2. Pass the plan to `sdk.executionService.executeTransactionPlan(...)`; it applies configured plugins before resolving approvals and sending transactions.
3. Use `onProgress` to surface approval, Permit2 signature, direct call, EVC batch, CoW signing/submission, and completion states.
4. Wait for the returned receipts and refetch dependent queries.
5. Decode contract errors for user-facing diagnostics.

CoW swap plans are built with `planOpenPositionWithCoW`, `planClosePositionWithCow`, or `planSwapCollateralWithCoW`. They are executed through `executeCowSwapTransactionPlan`, return `orderUids`, and settle asynchronously through CoW Protocol. Track order state with `fetchCowSwapOrderStatus` or `pollCowSwapOrderStatus`. Cancel open-position and collateral-swap orders with `cancelCowSwapOrder`; cancel close-position orders with `planCancelClosePositionWithCow`, which invalidates the signed EVC permit nonce. Use `formatCowSwapExecutionErrorMessage` for short UI-safe errors. Do not pass CoW plans to simulation, gas estimation, `mergePlans`, or `describeBatch`.

`executeTransactionPlan`, `simulateTransactionPlan`, and `estimateGasForTransactionPlan` accept `AddressOrAccount` (`Address | Account`) for the account argument. Pass an `Account` when the caller already has account state that plugins can reuse; pass an address when plugin-side minimal fetching is preferable.

When the same plan is both simulated (for a Review preview) and then executed (on Confirm), call `prepareTransactionPlan({ plan, chainId, account, usePermit2?, unlimitedApproval? })` once and pass the returned `TransactionPlanPrepared` envelope to `simulatePreparedTransactionPlan(prepared, options?)` and `executePreparedTransactionPlan({ prepared, sendTransaction, signTypedData, onProgress })`. The prepared variants skip the internal plugin pipeline (and approval re-resolution for execute), so plugin reads — TOS, Keyring, Pyth — run once per Review instead of three times. Use `isPreparedTransactionPlan` to discriminate envelope vs raw plan. CoW plans are not supported by `prepareTransactionPlan`.

Borrow and leverage planners (`planBorrow`, `planSwapAndBorrowFromWallet`, `planMultiplyWithSwap`, `planMultiplySameAsset`) automatically prepend cleanup that disables stale enabled collaterals/controllers on the target sub-account before borrowing; pass `skipCleanup: true` to opt out when you manage EVC state yourself. `planCleanup` builds that batch standalone. Full-repay `cleanupOnMax` only sweeps collateral shares for EVK vaults (non-EVK collaterals like Securitize RWA are disabled but not transferred, since they lack `transferFromMax`).

Use `mergePlans` to atomically combine multiple intents and `describeBatch` for previews/logging. `mergePlans` collapses redundant EVC state transitions across merged batches (e.g. a cleanup `disableCollateral` cancels a borrow `enableCollateral`), so merging a `planCleanup` plan with a borrow plan yields a minimal batch.
Planner-created `evcBatch` entries contain named operations (`{ type: "operation", name, items }`). Keep those groups intact in previews and merge flows. Raw `EVCBatchItem` entries are still valid for low-level utilities and plugin-inserted setup calls. Use `convertBatchItemsToPlan(items, operationName)` when a raw encoded batch should be named as one operation; omit `operationName` to preserve the raw item array.

Reference: `packages/euler-v2-sdk/docs/execution-service.md`, `packages/euler-v2-sdk/docs/cow-swaps.md`, `packages/euler-v2-sdk/src/services/executionService/executionService.ts`, `examples/react-sdk-example/src/utils/txProgress.ts`
