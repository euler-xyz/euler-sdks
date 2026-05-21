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
- `planDepositWithSwapFromWallet`, `planSwapFromWallet`, `planSwapAndBorrowFromWallet`, `planSwapAndRepayFromWallet`
- `planWithdrawAndSwap`, `planRedeemAndSwap`, `planSwapCollateral`, `planSwapDebt`
- `planMigrateSameAssetCollateral`, `planMigrateSameAssetDebt`
- `planTransfer`, `planMultiplyWithSwap`, `planMultiplySameAsset`
- `planOpenPositionWithCoW`, `planClosePositionWithCow`, `planSwapCollateralWithCoW`, `planCancelClosePositionWithCow`

Repay planners accept `cleanupOnMax`. When set on a full repay, the planner appends cleanup calls that disable active collaterals on the repaid sub-account and transfer those collateral shares back to the owner. Source-deposit repay and swap repay also transfer any remaining source-vault shares to the owner. For same-asset different-vault repay, pre-existing liability-vault deposits are preserved.

CoW planners produce `cowSwap` plan items instead of EVC batch items. They are
executed by `executeCowSwapTransactionPlan`, but they are not supported by
`simulateTransactionPlan`, `estimateGasForTransactionPlan`, `mergePlans`, or
`describeBatch`. Execute a CoW plan as a standalone user action.

After planning, use:

- `resolveRequiredApprovals(...)` or `resolveRequiredApprovalsWithWallet(...)` to resolve approval requirements into concrete `approve` calls or Permit2 signatures metadata.
- `executeTransactionPlan(...)` to process plugins, resolve any unresolved approvals, request Permit2 signatures, send direct contract calls and EVC batches, and report `onProgress` updates.
- `prepareTransactionPlan(...)` when the same plan will be both simulated and executed (typical Review-then-Confirm UX). It runs plugins and resolves approvals once and returns a `TransactionPlanPrepared` envelope that carries `plan`, `chainId`, `account`, `usePermit2`, and `unlimitedApproval`. Pass the envelope to `simulatePreparedTransactionPlan(...)` and `executePreparedTransactionPlan(...)` to skip the redundant plugin pass (and, for execute, the approval re-resolution). Use the `isPreparedTransactionPlan` type guard to discriminate envelope vs raw plan.

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

For flows that simulate-then-execute the same plan (e.g. a Review screen that previews state changes and then submits on Confirm), prepare the plan once and reuse the envelope to avoid re-running plugins (TOS / Keyring / Pyth) and re-fetching wallet allowances on each step:

```typescript
const prepared = await sdk.executionService.prepareTransactionPlan({
  plan,
  chainId,
  account, // AddressOrAccount
  usePermit2: true,
  unlimitedApproval: false,
})

const simulation = await sdk.executionService.simulatePreparedTransactionPlan(prepared)

const result = await sdk.executionService.executePreparedTransactionPlan({
  prepared,
  sendTransaction: walletClient.sendTransaction,
  signTypedData: walletClient.signTypedData,
  onProgress,
})
```

The original `simulateTransactionPlan` / `executeTransactionPlan` entry points are unchanged — the prepared variants are additive. Do not pass CoW plans to `prepareTransactionPlan`.

For CoW plans, use `executeCowSwapTransactionPlan`. It runs ERC20 approvals,
EVC permit signing, CoW order signing, and order submission. The result includes
`orderUids` for submitted CoW orders. CoW settlement happens asynchronously
through CoW Protocol, so `orderUids` indicate order submission rather than final
settlement. Use `fetchCowSwapOrderStatus` or `pollCowSwapOrderStatus` to track
the order. Use `cancelCowSwapOrder` for CoW API cancellation of open-position
and collateral-swap orders. Use `planCancelClosePositionWithCow` to invalidate
the EVC permit nonce for close-position orders.

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
- [`examples/execution/swap-and-borrow-from-wallet-example.ts`](../examples/execution/swap-and-borrow-from-wallet-example.ts)
- [`examples/execution/swap-and-repay-from-wallet-example.ts`](../examples/execution/swap-and-repay-from-wallet-example.ts)
- [`examples/execution/withdraw-and-swap-example.ts`](../examples/execution/withdraw-and-swap-example.ts)
- [`examples/execution/redeem-and-swap-example.ts`](../examples/execution/redeem-and-swap-example.ts)
- [`examples/execution/same-asset-position-migration-example.ts`](../examples/execution/same-asset-position-migration-example.ts)
- [`examples/execution/merge-plans-example.ts`](../examples/execution/merge-plans-example.ts)
- [`examples/execution/open-position-with-cow-live-example.ts`](../examples/execution/open-position-with-cow-live-example.ts)
- [`run-examples.sh`](../examples/run-examples.sh)

The CoW example uses live mainnet and requires `PRIVATE_KEY` plus a mainnet RPC
URL. It is not a fork example because CoW order submission depends on the
external CoW orderbook.
