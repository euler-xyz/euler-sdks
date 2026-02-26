# Execution Service

`executionService` is split into two layers:

- `encodeX(...)` functions: low-level calldata/batch encoders
- `planX(...)` functions: higher-level planners that use account context and include approval requirements

This separation lets you either work with raw payloads directly or use opinionated planning helpers.

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

The planner layer uses the account/vault context you pass in to drive the right encoder path and include approval requirements.

Common plan functions include:

- `planDeposit`, `planMint`, `planWithdraw`, `planRedeem`
- `planBorrow`, `planPullDebt`, `planLiquidation`
- `planRepayFromWallet`, `planRepayFromDeposit`, `planRepayWithSwap`
- `planDepositWithSwapFromWallet`, `planSwapCollateral`, `planSwapDebt`
- `planTransfer`, `planMultiplyWithSwap`, `planMultiplySameAsset`

After planning, use:

- `resolveRequiredApprovals(...)` or `resolveRequiredApprovalsWithWallet(...)` to resolve approval requirements into concrete `approve` calls or Permit2 signatures metadata.

## Consuming a Plan

Plans are intentionally execution-framework agnostic. How you execute/consume them depends on your app (wallet UX, relayers, transaction queueing, batching policy, etc.).

Reference executor:

- [`examples/utils/executor.ts`](../examples/utils/executor.ts)

This example shows a practical flow:

1. Process `requiredApproval` items (approve or Permit2 path)
2. Collect/append Permit2 calls when needed
3. Send the final EVC batch transaction

## Embedding Payloads in Higher-Level Flows

`encodeX` and `planX` outputs are composable and can be embedded into larger workflows:

- prepend setup actions
- merge multiple plans
- append extra operations before final submission

Use `convertBatchItemsToPlan(...)` when you already have raw batch items and want to integrate them into a plan-based pipeline.

## `mergePlans` and `describeBatch`

- `mergePlans(plans)`: merges multiple plans into one plan. Required approvals for the same `(token, owner, spender)` are summed, and EVC batch items are concatenated in order.
- `describeBatch(batch, extraAbis?)`: decodes batch item calldata into human-readable function names and arguments. Useful for logs, debugging, previews, and safety checks.

`describeBatch` is a decoder/inspector only; it does not execute anything.

## Runnable Examples (Fork)

Execution examples are in:

- `packages/euler-v2-sdk/examples/execution`

They are designed to run against a fork (Anvil + `examples/.env` with `FORK_RPC_URL`) and demonstrate plan creation + execution end-to-end.

Useful entry points:

- [`examples/execution/deposit-example.ts`](../examples/execution/deposit-example.ts)
- [`examples/execution/repay-with-swap-example.ts`](../examples/execution/repay-with-swap-example.ts)
- [`examples/execution/merge-plans-example.ts`](../examples/execution/merge-plans-example.ts)
- [`run-examples.sh`](../run-examples.sh)
