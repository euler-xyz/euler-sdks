# Execution Service

`executionService` is split into two layers:

- `encodeX(...)` functions: low-level calldata/batch encoders
- `planX(...)` functions: higher-level planners that use account context and include approval requirements
- `executeTransactionPlan(...)`: service-owned execution for approval resolution, Permit2 signing, direct calls, and EVC batches

This separation lets you either work with raw payloads directly or use opinionated planning helpers and the bundled executor.

## `encodeX` Functions (Raw Encoders)

`encodeX` functions produce raw EVC batch items (`EVCBatchItem[]`) for protocol operations like deposit, borrow, repay, swap, liquidation, and debt transfer.

Examples:

- `encodeDeposit`
- `encodeBorrow`
- `encodeRepayWithSwap`
- `encodeSwapCollateral`
- `encodeTransfer`

These are building blocks. They do not perform wallet allowance checks and do not resolve approval requirements for you.

## `planX` Functions (Planner Layer)

`planX` functions build `TransactionPlan` objects that are ready to be consumed by an app execution pipeline.

A plan typically contains:

- `requiredApproval` items (what approvals/signatures are needed)
- one or more `evcBatch` items (the encoded protocol calls)
- optional `contractCall` items (direct non-EVC calls, used by reward claim planners and similar extensions)

The planner layer uses the account/vault context you pass in to drive the right encoder path and include approval requirements.

Common plan functions include:

- `planDeposit`, `planMint`, `planWithdraw`, `planRedeem`
- `planBorrow`, `planPullDebt`, `planLiquidation`
- `planRepayFromWallet`, `planRepayFromDeposit`, `planRepayWithSwap`
- `planDepositWithSwapFromWallet`, `planSwapFromWallet`, `planSwapCollateral`, `planSwapDebt`
- `planMigrateSameAssetCollateral`, `planMigrateSameAssetDebt`
- `planTransfer`, `planMultiplyWithSwap`, `planMultiplySameAsset`

Repay planners accept `cleanupOnMax`. When set on a full repay, the planner appends cleanup calls that disable active collaterals on the repaid sub-account and transfer those collateral shares back to the owner. Source-deposit repay and swap repay also transfer any remaining source-vault shares to the owner. For same-asset different-vault repay, pre-existing liability-vault deposits are preserved.

After planning, use:

- `resolveRequiredApprovals(...)` or `resolveRequiredApprovalsWithWallet(...)` to resolve approval requirements into concrete `approve` calls or Permit2 signatures metadata.
- `executeTransactionPlan(...)` to resolve any unresolved approvals, request Permit2 signatures, send direct contract calls and EVC batches, and report `onProgress` updates.

## Consuming a Plan

Plans are standard data, so apps can still implement their own wallet UX, relayers, transaction queueing, or batching policy. For the default wallet-client flow, use the service executor:

```typescript
const result = await sdk.executionService.executeTransactionPlan({
  plan,
  chainId,
  account,
  sendTransaction: walletClient.sendTransaction,
  signTypedData: walletClient.signTypedData,
  onProgress: (progress) => {
    console.log(progress.status, progress.completed, progress.total)
  },
})
```

The bundled executor:

1. Process `requiredApproval` items (approve or Permit2 path)
2. Collect/append Permit2 calls when needed
3. Execute `contractCall` items directly
4. Send the final EVC batch transaction

## Embedding Payloads in Higher-Level Flows

`encodeX` and `planX` outputs are composable and can be embedded into larger workflows:

- prepend setup actions
- merge multiple plans
- append extra operations before final submission

Use `convertBatchItemsToPlan(...)` when you already have raw batch items and want to integrate them into a plan-based pipeline.

Reward claim planning is intentionally kept out of `executionService`. Provider-specific claim payloads for Merkl, Brevis, and Fuul are built in [`rewardsService`](./rewards-service.md), which returns standard `TransactionPlan` items that your executor can run alongside core Euler plans.

## `mergePlans` and `describeBatch`

- `mergePlans(plans)`: merges multiple plans into one plan. Required approvals for the same `(token, owner, spender)` are summed, executable items keep their order, and adjacent EVC batch items are concatenated.
- `describeBatch(batch, extraAbis?)`: decodes batch item calldata into human-readable function names and arguments. Useful for logs, debugging, previews, and safety checks.

`describeBatch` is a decoder/inspector only; it does not execute anything.

## Runnable Examples (Fork)

Execution examples are in:

- `examples/execution`

They are designed to run against a fork (Anvil + `examples/.env` with `FORK_RPC_URL`) and demonstrate plan creation + execution end-to-end.

Useful entry points:

- [`examples/execution/deposit-example.ts`](../examples/execution/deposit-example.ts)
- [`examples/execution/repay-with-swap-example.ts`](../examples/execution/repay-with-swap-example.ts)
- [`examples/execution/swap-from-wallet-example.ts`](../examples/execution/swap-from-wallet-example.ts)
- [`examples/execution/same-asset-position-migration-example.ts`](../examples/execution/same-asset-position-migration-example.ts)
- [`examples/execution/merge-plans-example.ts`](../examples/execution/merge-plans-example.ts)
- [`run-examples.sh`](../examples/run-examples.sh)
