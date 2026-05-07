# Execution Service

`executionService` is split into two layers:

- `encodeX(...)` functions: low-level calldata/batch encoders
- `planX(...)` functions: higher-level planners that use account context and include approval requirements
- `executeTransactionPlan(...)`: service-owned execution for plugin processing, approval resolution, Permit2 signing, direct calls, and EVC batches

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

An `evcBatch` contains batch entries. Each entry is either a raw `EVCBatchItem` or a named operation:

```typescript
type EVCBatch = {
  type: "evcBatch"
  items: EVCBatchEntry[]
}

type EVCBatchEntry = EVCBatchItem | EVCBatchOperation

type EVCBatchOperation = {
  type: "operation"
  name: string
  items: EVCBatchItem[]
}
```

Planner methods (`planDeposit`, `planBorrow`, `planRepayWithSwap`, etc.) group their encoded batch items into a named operation. Raw batch items are still accepted so plugins and low-level utilities can prepend or append setup calls without inventing an operation group.

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
- `executeTransactionPlan(...)` to process plugins, resolve any unresolved approvals, request Permit2 signatures, send direct contract calls and EVC batches, and report `onProgress` updates.

## Consuming a Plan

Plans are standard data, so apps can still implement their own wallet UX, relayers, transaction queueing, or batching policy. For the default wallet-client flow, use the service executor:

```typescript
const result = await sdk.executionService.executeTransactionPlan({
  plan,
  chainId,
  account, // AddressOrAccount: owner address or fetched Account
  sendTransaction: walletClient.sendTransaction,
  signTypedData: walletClient.signTypedData,
  onProgress: (progress) => {
    console.log(progress.status, progress.completed, progress.total)
  },
})
```

The `account` argument is `AddressOrAccount` (`Address | Account`) for `executeTransactionPlan`, `simulateTransactionPlan`, and `estimateGasForTransactionPlan`. Passing an already-fetched `Account` lets plugins reuse account state; passing an address lets plugins fetch the minimal data they need.

The bundled executor:

1. Processes configured plugins against the plan
2. Processes `requiredApproval` items (approve or Permit2 path)
3. Collects/appends Permit2 calls when needed
4. Executes `contractCall` items directly
5. Sends the final EVC batch transaction

## Embedding Payloads in Higher-Level Flows

`encodeX` and `planX` outputs are composable and can be embedded into larger workflows:

- prepend setup actions
- merge multiple plans
- append extra operations before final submission

Use `convertBatchItemsToPlan(...)` when you already have raw batch items and want to integrate them into a plan-based pipeline.
By default it creates an `evcBatch` with the raw items directly. Pass `operationName` to wrap those items in a named operation:

```typescript
const rawPlan = sdk.executionService.convertBatchItemsToPlan(batchItems)
const groupedPlan = sdk.executionService.convertBatchItemsToPlan(batchItems, "customOperation")
```

Reward claim planning is intentionally kept out of `executionService`. Provider-specific claim payloads for Merkl, Brevis, and Fuul are built in [`rewardsService`](./rewards-service.md), which returns standard `TransactionPlan` items that your executor can run alongside core Euler plans.

## `mergePlans` and `describeBatch`

- `mergePlans(plans)`: merges multiple plans into one plan. Required approvals for the same `(token, owner, spender)` are summed, executable items keep their order, adjacent EVC batches are concatenated, and operation groupings are preserved. `contractCall` items are not merged automatically; merge those flows manually.
- `describeBatch(batch, extraAbis?)`: decodes batch item calldata into human-readable function names and arguments. If the input batch contains operation entries, the returned description preserves the same operation grouping and operation names while decoding child items.

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
