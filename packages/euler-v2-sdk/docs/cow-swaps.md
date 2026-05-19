# CoW Swaps

CoW swap plans use the same SDK quote, plan, and execution services as regular swap flows, but the execution shape is different. A regular swap plan encodes an EVC batch that calls Euler's Swapper immediately. A CoW swap plan submits a signed order to the CoW Protocol orderbook, and CoW settlement fills the order asynchronously.

Use CoW plans for the supported position flows:

- open a leveraged position: deposit collateral, borrow, and sell the borrowed asset through CoW
- close a position: sell collateral vault shares through CoW and repay debt
- swap collateral: sell source collateral vault shares through CoW and deposit into another collateral vault

## Quote Flow

The regular quote methods build CoW provider metadata when you pass `cowSwap`.

For open-position and collateral-swap quotes, use `fetchDepositQuote`:

```typescript
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId,
  fromVault: borrowVault,
  toVault: longVault,
  fromAccount: subAccount,
  toAccount: subAccount,
  fromAsset: borrowAsset,
  toAsset: longAsset,
  amount: borrowAmount,
  origin: owner,
  slippage: 0.5,
  provider: "cow",
  cowSwap: {
    type: "openPosition",
    owner,
    collateralVault,
    collateralAmount,
  },
})
```

```typescript
const quotes = await sdk.swapService.fetchDepositQuote({
  chainId,
  fromVault,
  toVault,
  fromAccount: subAccount,
  toAccount: subAccount,
  fromAsset,
  toAsset,
  amount: assetAmount,
  origin: owner,
  slippage: 0.5,
  provider: "cow",
  cowSwap: {
    type: "collateralSwap",
    owner,
    sharesAmount,
    disableSourceCollateral: true,
  },
})
```

For close-position quotes, use `fetchRepayQuotes`:

```typescript
const quotes = await sdk.swapService.fetchRepayQuotes({
  chainId,
  fromVault: collateralVault,
  fromAsset: collateralAsset,
  fromAccount: subAccount,
  liabilityVault: borrowVault,
  liabilityAsset: borrowAsset,
  currentDebt,
  liabilityAmount: currentDebt,
  toAccount: subAccount,
  origin: owner,
  swapperMode: SwapperMode.TARGET_DEBT,
  slippage: 0.5,
  provider: "cow",
  cowSwap: {
    type: "closePosition",
    owner,
    collateralSharesAmount,
  },
})
```

`cowSwap` creates `providerExtraData` for the swap API when `provider` is `"cow"` / `"cow swap"` or when `provider` is not set. If you explicitly request a non-CoW provider, the SDK does not attach generated CoW metadata. This lets broad quote screens request all providers while still giving the router enough data to build CoW quotes.

CoW quotes include `providerData.quoteId`, `providerData.sellAmount`, `providerData.buyAmount`, and `providerData.feeAmount`. The SDK validates those fields against the quote request before returning CoW quotes.

## Plan Flow

Use the CoW-specific plan function for a CoW quote:

```typescript
const plan = sdk.executionService.planOpenPositionWithCoW({
  account,
  collateralVault,
  collateralAmount,
  collateralAsset,
  swapQuote: quotes[0]!,
})
```

```typescript
const plan = sdk.executionService.planSwapCollateralWithCoW({
  account,
  swapQuote: quotes[0]!,
  disableSourceCollateral: true,
})
```

```typescript
const plan = sdk.executionService.planClosePositionWithCow({
  account,
  swapQuote: quotes[0]!,
  swapperMode: SwapperMode.TARGET_DEBT,
})
```

Regular swap planners reject CoW quotes and point to the matching CoW planner. CoW planners return `TransactionPlan` items with `type: "cowSwap"`. These plan items are not EVC batch items and cannot be simulated or gas-estimated by `simulateTransactionPlan` or `estimateGasForTransactionPlan`.

Do not merge CoW plans with regular transaction plans. Execute a CoW plan as its own user action.

## Execution Flow

Execute CoW plans with the CoW executor:

```typescript
const result = await sdk.executionService.executeCowSwapTransactionPlan({
  plan,
  chainId,
  account: owner,
  sendTransaction: walletClient.sendTransaction,
  signTypedData: walletClient.signTypedData,
  onProgress: ({ status, orderUid, hash }) => {
    console.log(status, orderUid, hash)
  },
})

console.log(result.orderUids)
```

The executor handles the CoW-specific sequence:

1. Direct ERC20 approvals needed by the wrapper and CoW vault relayer
2. EVC permit typed-data signature for the wrapper action
3. CoW order typed-data signature
4. CoW order submission to the orderbook
5. For close-position plans, inbox preparation and EIP-1271 order signing

`executeCowSwapTransactionPlan` returns submitted `orderUids` for CoW plans. The returned result means the order was accepted by the CoW API, not that settlement has completed.

## Status And Cancellation

The SDK exports CoW order helpers from both `services/executionService` and the package root.

Use `getCowSwapOrderExplorerUrl` to build the CoW Explorer link:

```typescript
console.log(getCowSwapOrderExplorerUrl(orderUid))
```

Use `fetchCowSwapOrderStatus` for a one-shot read:

```typescript
const status = await fetchCowSwapOrderStatus({
  chainId,
  orderUid,
})
```

Use `pollCowSwapOrderStatus` to wait until CoW reports a terminal status:

```typescript
const finalStatus = await pollCowSwapOrderStatus({
  chainId,
  orderUid,
  onStatus: status => console.log(status.type),
})
```

Terminal statuses are `traded`, `fulfilled`, `cancelled`, and `expired`. The helper reads both CoW competition status (`/orders/{uid}/status`) and lifecycle status (`/orders/{uid}`), then normalizes them into one `CowSwapOrderStatus`.

There are two cancellation paths:

- `cancelCowSwapOrder` signs a CoW `OrderCancellations` typed-data message and submits `DELETE /api/v1/orders`. This is the lite flow for CoW open-position and collateral-swap orders.
- `planCancelClosePositionWithCow` invalidates the EVC permit nonce used by a CoW close-position order. This is the lite flow for CoW close-position orders, because the submitted order is an EIP-1271 order owned by the close-position Inbox.

For CoW API cancellation:

```typescript
await cancelCowSwapOrder({
  chainId,
  orderUid,
  signTypedData: walletClient.signTypedData,
})
```

For close-position nonce invalidation, use the `permitCancellation` data returned on the close-position execution result:

```typescript
const result = await sdk.executionService.executeCowSwapTransactionPlan({
  plan,
  chainId,
  account: owner,
  sendTransaction: walletClient.sendTransaction,
  signTypedData: walletClient.signTypedData,
})

const cancellation = result.results[0]?.permitCancellation
if (cancellation) {
  const cancelPlan = sdk.executionService.planCancelClosePositionWithCow({
    chainId: cancellation.chainId,
    owner: cancellation.owner,
    nonce: cancellation.nonce,
    nonceNamespace: cancellation.nonceNamespace,
    wrapperAddress: cancellation.wrapperAddress,
  })

  await sdk.executionService.executeCowSwapTransactionPlan({
    plan: cancelPlan,
    chainId,
    account: owner,
    sendTransaction: walletClient.sendTransaction,
    signTypedData: walletClient.signTypedData,
  })
}
```

The nonce-invalidation plan calls EVC `setNonce(addressPrefix, nonceNamespace, nonce + 1)` only if the current nonce has not already advanced past the signed nonce.

## Operational Notes

- CoW support is chain-configured. The SDK throws when the selected chain has no CoW wrapper configuration.
- CoW plan simulation is not supported because the final settlement transaction is created by CoW Protocol.
- The quote deadline and order validity use the CoW order window. Re-quote near submission.
- CoW close-position plans may deploy or prepare the account inbox before signing and submitting the order.
- CoW open-position and collateral-swap cancellation uses the CoW API. CoW close-position cancellation uses EVC permit nonce invalidation.
- `formatCowSwapExecutionErrorMessage` formats viem/CoW errors into short UI-safe messages.
- For all-provider quote screens, keep non-CoW quotes on regular planners and CoW quotes on CoW planners.

## Example

See [`examples/execution/open-position-with-cow-live-example.ts`](../examples/execution/open-position-with-cow-live-example.ts) for a live mainnet script that requires a real private key and submits an open-position CoW order.
